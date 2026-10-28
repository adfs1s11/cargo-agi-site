import { referenceHistory } from './transport-history.js';
/* 가배차 엔진 — 이력·등급·선호권역·부하·사고이력 기반 추천 */
import { availabilityOn, equipmentFor, availabilityRows, allocateTurn, rotationLoad } from './schedule.js';
import { state } from './data.js';
import { evaluate } from './evaluation.js';
import { routeKey, classifyOrder, driverSimilarity, compatible } from './dispatch-profile.js';
import { norm, num, str, clamp, round, regionOf, isCapital, addDays, todayStr } from './utils.js';

const statusOk = (r) => !['cancelled', 'notshipped', 'support'].includes(r.status);
const shareTotals = new WeakMap();

export function buildContext(date, { historyDays = null, includeAssigned = false } = {}) {
  historyDays = historyDays || Number(state.settings.assign.historyDays) || 365;
  const from = addDays(date, -historyDays);
  const history = referenceHistory(state.dispatch,state.transportHistory,date,from);
  const todayRows = state.dispatch.filter((r) => r.date === date);

  const gradeMap = new Map();
  try {
    const ev = evaluate({ from: addDays(date, -181), to: date });
    for (const r of ev.results) gradeMap.set(norm(r.name), r);
  } catch { /* 평가 실패 시 기본값 */ }

  const stats = new Map();
  const ensure = (name) => {
    const key = norm(name);
    if (!stats.has(key)) stats.set(key, { name, rows: 0, regions: new Map(), customers: new Map(), destinations: new Map(), brands: new Map(), byDate: new Map(), routes: new Map(), models: new Map(), classes: new Map(), equipmentTypes: new Map() });
    return stats.get(key);
  };
  const equipmentTypes = new Map(state.equipment.filter((e) => e.plateNo).map((e) => [norm(e.plateNo), e.type]));
  for (const r of history) {
    const name = resolveName(r.driver);
    if (!name) continue;
    const s = ensure(name);
    const c = num(r.count) || 1;
    s.rows += c;
    const reg = r.region || regionOf(r.destination);
    s.regions.set(reg, (s.regions.get(reg) || 0) + c);
    s.customers.set(str(r.customer), (s.customers.get(str(r.customer)) || 0) + c);
    s.destinations.set(norm(r.destination), (s.destinations.get(norm(r.destination)) || 0) + c);
    s.brands.set(str(r.brand), (s.brands.get(str(r.brand)) || 0) + c);
    s.byDate.set(r.date, (s.byDate.get(r.date) || 0) + c);
    const classified = classifyOrder(r, state.products);
    for (const [map, key] of [[s.routes, routeKey(r)], [s.models, norm(r.model)], [s.classes, norm(classified.cargoClass)]]) if (key && key !== '→') map.set(key, (map.get(key) || 0) + c);
    const equipmentType = norm(r.transportType || equipmentTypes.get(norm(r.vehicleNo)));
    if (equipmentType) s.equipmentTypes.set(equipmentType, (s.equipmentTypes.get(equipmentType) || 0) + c);
  }

  const currentLoads=availabilityRows(state.drivers,date,state.equipment,includeAssigned?[]:state.dispatch,includeAssigned?[]:state.assignments);
  const loadMap=new Map(currentLoads.map(r=>[r.driver.id,r]));
  const loads=new Map(currentLoads.map(r=>[norm(r.driver.name),r.count]));
  const confirmed=includeAssigned?[]:state.assignments.filter(a=>a.date===date&&a.status==='confirmed');
  const lockedIds=new Set(confirmed.flatMap(p=>p.orderIds || []));
  const incidents = state.incidents.filter((i) => i.date >= addDays(date, -90) && i.date <= date);
  const incidentCount = new Map();
  for (const i of incidents) {
    const name = norm(resolveName(i.driverName));
    if (name) incidentCount.set(name, (incidentCount.get(name) || 0) + (i.severity === '상' ? 3 : i.severity === '중' ? 2 : 1));
  }

  const drivers = state.drivers.filter((d) => availabilityOn(d, date, state.equipment).available).map((d) => {
    const eq = equipmentFor(d, state.equipment);
    const ev = gradeMap.get(norm(d.name));
    return {
      policy: {capacity:loadMap.get(d.id).capacity,maxTurns:loadMap.get(d.id).maxTurns},
      booked:[...loadMap.get(d.id).booked], baseBooked:[...loadMap.get(d.id).booked],
      id: d.id, name: d.name, phone: d.phone, vehicleNo: d.vehicleNo || eq?.plateNo || '',
      type: d.type, preferred: d.preferred || [], avoid: d.avoid || [],
      equipment: eq || null,
      skillLevel: Number(d.skillLevel || 1), baseOrigin: d.baseOrigin || '', supportedClasses: d.supportedClasses || [], availableFrom: d.availableFrom || '', availableTo: d.availableTo || '',
      grade: ev?.grade || 'F',
      score: ev?.total || 0,
      history: stats.get(norm(d.name)) || null,
      load: loads.get(norm(d.name)) || 0,
      baseLoad: loads.get(norm(d.name)) || 0,
      incidents: incidentCount.get(norm(d.name)) || 0,
    };
  });
  for (const driver of drivers) driver.peers = drivers.filter((peer) => peer.id !== driver.id && peer.history?.rows).map((peer) => ({ name: peer.name, history: peer.history, similarity: driverSimilarity(driver, peer) })).filter((p) => p.similarity >= 0.65).sort((a, b) => b.similarity - a.similarity).slice(0, 3);

  const orders = todayRows.filter((r) => statusOk(r) && (includeAssigned ? true : (!r.driver && !lockedIds.has(r.id))));
  return { date, drivers, orders, loads, stats, gradeMap, todayRows, includeAssigned, lockedIds, confirmedCount: confirmed.reduce((n, a) => n + (a.totalCount || 0), 0) };
}

function resolveName(name) {
  const n = norm(name);
  if (!n) return '';
  const d = state.drivers.find((x) => norm(x.name) === n || (x.aliases || []).some((a) => norm(a) === n));
  return d ? d.name : str(name);
}

function share(map, key) {
  if (!map || !map.size) return 0;
  let total = shareTotals.get(map);
  if (total === undefined) { total = 0; for (const v of map.values()) total += v; shareTotals.set(map, total); }
  return total ? (map.get(key) || 0) / total : 0;
}

export function scoreCandidates(order, ctx, { excludeNames = [] } = {}) {
  order = classifyOrder(order, state.products);
  const cfg = state.settings.assign;
  const reg = order.region || regionOf(order.destination);
  const cap = Math.max(1, num(cfg.maxPerDriver) || 14);
  const totalW = (cfg.historyWeight + cfg.gradeWeight + cfg.prefWeight + cfg.balanceWeight) || 1;
  const out = [];
  for (const d of ctx.drivers) {
    if (excludeNames.includes(d.name)) continue;
    if (!compatible(order, d)) continue;
    const remaining = d.policy.capacity*d.policy.maxTurns - d.load;
    const turn=allocateTurn(d.booked,order,d.policy);
    if (turn===null) continue;
    if (remaining < (num(order.count) || 1)) continue;
    if (d.equipment && d.equipment.status === 'maintenance') continue;
    if (d.equipment && (num(d.equipment.capacity) || 5) < (num(order.count) || 1)) continue;

    const h = d.history;
    const regionShare = h ? share(h.regions, reg) : 0;
    const customerShare = h ? share(h.customers, str(order.customer)) : 0;
    const destShare = h ? share(h.destinations, norm(order.destination)) : 0;
    const brandShare = h ? share(h.brands, str(order.brand)) : 0;
    const historyScore = (history) => history ? share(history.routes, routeKey(order)) * 0.3 + share(history.models, norm(order.model)) * 0.15 + (order.cargoClass ? share(history.classes, norm(order.cargoClass)) * 0.1 : 0) + share(history.equipmentTypes, norm(d.equipment?.type)) * 0.1 + share(history.regions, reg) * 0.15 + share(history.customers, str(order.customer)) * 0.1 + share(history.destinations, norm(order.destination)) * 0.05 + share(history.brands, str(order.brand)) * 0.05 : 0;
    const ownTrust = Math.min(1, (h?.rows || 0) / 60);
    const peers = d.peers || [];
    const similarityWeight = peers.reduce((n, p) => n + p.similarity, 0);
    const transferred = similarityWeight ? peers.reduce((n, p) => n + historyScore(p.history) * p.similarity, 0) / similarityWeight * 0.6 : 0;
    const hist = historyScore(h) * ownTrust + transferred * (1 - ownTrust);

    const gradeNorm = clamp((d.score - 45) / 55, 0, 1);
    const pref = (d.preferred || []).includes(reg) ? 1 : (d.avoid || []).includes(reg) ? -0.9 : 0;
    const prefNorm = (pref + 1) / 2;
    const balance = clamp(remaining / (d.policy.capacity*d.policy.maxTurns), 0, 1);
    const incPenalty = Math.min(0.6, d.incidents * (cfg.incidentPenalty || 0.12));

    let score = (cfg.historyWeight * hist + cfg.gradeWeight * gradeNorm + cfg.prefWeight * prefNorm + cfg.balanceWeight * balance) / totalW;
    score -= incPenalty;
    if (d.baseOrigin && norm(d.baseOrigin) === norm(order.origin)) score += 0.06;
    score += Math.max(0, d.skillLevel - Number(order.minSkill || 1)) * 0.01;
    if (pref < 0) score -= 0.12;
    if (d.grade === 'S') score += 0.03;
    if (d.grade === 'F' && d.score === 0) score -= 0.05;
    score = clamp(score, 0, 1);

    const reasons = [];
    if (h && share(h.routes, routeKey(order)) > 0) reasons.push('동일 출발·도착 구간 경험');
    if (h && share(h.models, norm(order.model)) > 0) reasons.push('동일 차종 운송 경험');
    if (ownTrust < 1 && peers.length) reasons.push(`유사 장비·인력 ${peers.map((p) => p.name).join(', ')} 이력 참고`);
    if (d.baseOrigin && norm(d.baseOrigin) === norm(order.origin)) reasons.push('출발지 거점 일치');
    reasons.push(`숙련도 ${d.skillLevel}/5`);
    if (regionShare > 0) reasons.push(`${reg} ${Math.round(regionShare * 100)}% 경험`);
    if (customerShare > 0.05) reasons.push(`${shortCustomer(order.customer)} ${Math.round(customerShare * 100)}%`);
    if (pref > 0) reasons.push('선호 권역');
    if (pref < 0) reasons.push('기피 권역');
    reasons.push(`${d.grade}등급`);
    reasons.push(`여유 ${remaining}대`);
    if (d.incidents) reasons.push(`사고이력 ${d.incidents}`);
    if (d.equipment?.type) reasons.push(d.equipment.type);
    out.push({ turn, driver: d, score: round(score, 4), reasons, remaining, regionShare, customerShare });
  }
  return out.sort((a, b) => b.score - a.score);
}

const shortCustomer = (name) => {
  const s = str(name);
  if (s.includes('삼성SDS')) return '삼성SDS';
  if (s.includes('메르세데스')) return '벤츠';
  if (s.includes('지에스')) return 'GS';
  return s.length > 8 ? s.slice(0, 8) : s;
};

const difficulty = (order, ctx) => {
  const reg = order.region || regionOf(order.destination);
  let d = 0;
  if (!isCapital(reg)) d += 3;
  if (reg === '제주') d += 3;
  if (reg === '기타') d += 2;
  d += (num(order.turn) || 1) * 0.2;
  const experienced = ctx.drivers.filter((x) => x.history && share(x.history.regions, reg) > 0.08).length;
  d += Math.max(0, 3 - experienced) * 0.6;
  return d;
};

export function autoAssign(date, { includeAssigned = false, pinned = {} } = {}) {
  const ctx = buildContext(date, { includeAssigned });
  const cfg = state.settings.assign;
  const cap = Math.max(1, num(cfg.maxPerDriver) || 14);
  const assignments = new Map(); // driverName -> {driver, orders:[], scoreSum, reasons:Set}
  const unassigned = [];
  const orderPool = [...ctx.orders];
  const usedOrderIds = new Set();

  const ensurePlan = (driver) => {
    if (!assignments.has(driver.name)) assignments.set(driver.name, { driver, orders: [], scoreSum: 0, reasons: new Set() });
    return assignments.get(driver.name);
  };

  // 수동 고정 배정 먼저
  for (const order of orderPool) {
    const pinnedName = pinned[order.id];
    if (!pinnedName) continue;
    const driver = ctx.drivers.find((d) => d.name === pinnedName);
    if (!driver || !scoreCandidates(order, ctx).some((c) => c.driver === driver)) continue;
    const plan = ensurePlan(driver);
    const turn=allocateTurn(driver.booked,order,driver.policy);
    const allocated={...order,turn};
    plan.orders.push(allocated); driver.booked.push(allocated);
    plan.reasons.add('수동 지정');
    driver.load += num(order.count) || 1;
    usedOrderIds.add(order.id);
  }

  const pending = orderPool
    .filter((o) => !usedOrderIds.has(o.id))
    .map((o) => ({ order: o, diff: difficulty(o, ctx) }))
    .sort((a, b) => b.diff - a.diff);

  for (const { order } of pending) {
    const cands = scoreCandidates(order, ctx).filter((c) => c.remaining >= (num(order.count) || 1));
    if (!cands.length) {
      const reason = ctx.drivers.length ? '상차·회전 한도 또는 기존 회전 확인 필요' : '등록된 기사 없음';
      unassigned.push({ order, reason, candidates: 0 });
      continue;
    }
    const best = cands[0];
    const plan = ensurePlan(best.driver);
    const allocated={...order,turn:best.turn};
    plan.orders.push(allocated); best.driver.booked.push(allocated);
    plan.scoreSum += best.score;
    best.reasons.slice(0, 2).forEach((r) => plan.reasons.add(r));
    best.driver.load += num(order.count) || 1;
    usedOrderIds.add(order.id);
  }

  const plans = [...assignments.values()].filter((p) => p.orders.length).map((p) => {
    const regions = [...new Set(p.orders.map((o) => o.region || regionOf(o.destination)))];
    const totalCount = p.orders.reduce((s, o) => s + (num(o.count) || 1), 0);
    const totalTurns = rotationLoad(p.orders).usedTurns;
    return {
      id: `plan_${p.driver.id || norm(p.driver.name)}`,
      driverId: p.driver.id,
      driverName: p.driver.name,
      vehicleNo: p.driver.vehicleNo,
      grade: p.driver.grade,
      score: p.driver.score,
      orderIds: p.orders.map((o) => o.id),
      orderTurns: Object.fromEntries(p.orders.map(o=>[o.id,o.turn])),
      orders: p.orders,
      regions,
      totalCount,
      totalTurns,
      confidence: round(p.scoreSum / Math.max(1, p.orders.length), 3),
      reasons: [...p.reasons].slice(0, 5),
      capacity: p.driver.policy.capacity*p.driver.policy.maxTurns,
    };
  }).sort((a, b) => b.score - a.score);

  const assignedCount = plans.reduce((s, p) => s + p.totalCount, 0);
  const lockedCount = ctx.includeAssigned ? 0 : (ctx.confirmedCount || 0);
  const demand = ctx.orders.reduce((s, o) => s + (num(o.count) || 1), 0) + lockedCount;
  return {
    date,
    plans,
    unassigned,
    stats: {
      orders: ctx.orders.length,
      demand,
      assignedCount,
      lockedCount,
      assignedOrders: plans.reduce((s, p) => s + p.orders.length, 0),
      driversUsed: new Set([...plans.map((p) => p.driverName), ...(ctx.includeAssigned ? [] : state.assignments.filter((a) => a.date === date && a.status === 'confirmed').map((a) => a.driverName))]).size,
      driversAvailable: ctx.drivers.length,
      coverage: demand ? round(((assignedCount + lockedCount) / demand) * 100, 1) : 0,
      locked: ctx.includeAssigned ? 0 : ctx.confirmedCount,
    },
    context: ctx,
  };
}

export function reassignOrder(result, orderId, driverName) {
  const all = result.plans.flatMap((p) => p.orders);
  const order = all.find((o) => o.id === orderId);
  if (!order) return result;
  const owner = result.plans.find((p) => p.orderIds.includes(orderId));
  if (owner?.driverName === driverName) return result;
  if (!bestForOrder(result, orderId).some((c) => c.driver.name === driverName)) {
    throw new Error('해당 기사는 일일 한도 또는 차량 상태로 배정할 수 없습니다.');
  }
  for (const p of result.plans) {
    p.orders = p.orders.filter((o) => o.id !== orderId);
    p.orderIds = p.orders.map((o) => o.id);
  }
  let plan = result.plans.find((p) => p.driverName === driverName);
  if (!plan) {
    const driver = result.context.drivers.find((d) => d.name === driverName);
    if (!driver) return result;
    plan = {
      id: `plan_${driver.id}`, driverId: driver.id, driverName: driver.name, vehicleNo: driver.vehicleNo,
      grade: driver.grade, score: driver.score, orders: [], orderIds: [], regions: [], totalCount: 0,
      totalTurns: 0, confidence: 0, reasons: ['수동 지정'], capacity: driver.policy.capacity*driver.policy.maxTurns,
    };
    result.plans.push(plan);
  }
  const target=result.context.drivers.find(d=>d.name===driverName);
  const turn=allocateTurn(target.booked,order,target.policy);
  plan.orders.push({...order,turn});
  plan.orderIds = plan.orders.map((o) => o.id);
  for (const p of result.plans) {
    p.regions = [...new Set(p.orders.map((o) => o.region || regionOf(o.destination)))];
    p.totalCount = p.orders.reduce((s, o) => s + (num(o.count) || 1), 0);
    p.totalTurns = rotationLoad(p.orders).usedTurns;
    p.orderTurns=Object.fromEntries(p.orders.map(o=>[o.id,o.turn]));
    const drv = result.context.drivers.find((d) => d.name === p.driverName);
    if (drv) {drv.load = drv.baseLoad + p.totalCount;drv.booked=[...drv.baseBooked,...p.orders];}
    p.remaining = Math.max(0, (drv ? drv.policy.capacity*drv.policy.maxTurns : p.capacity) - (drv?.load || p.totalCount));
    p.over = (drv?.load || p.totalCount) > p.capacity;
    if (!drv) p.reasons = p.reasons || [];
  }
  for(const d of result.context.drivers) {d.booked=[...d.baseBooked,...result.plans.filter(p=>p.driverName===d.name).flatMap(p=>p.orders)];d.load=d.booked.reduce((n,o)=>n+Number(o.count || 0),0);}
  result.plans = result.plans.filter((p) => p.orders.length);
  const assignedCount = result.plans.reduce((s, p) => s + p.totalCount, 0);
  result.stats.assignedCount = assignedCount;
  result.stats.assignedOrders = result.plans.reduce((s, p) => s + p.orders.length, 0);
  result.stats.driversUsed = new Set([...result.plans.map((p) => p.driverName), ...(result.context.includeAssigned ? [] : state.assignments.filter((a) => a.date === result.date && a.status === 'confirmed').map((a) => a.driverName))]).size;
  result.stats.coverage = result.stats.demand ? round(((assignedCount + (result.stats.lockedCount || 0)) / result.stats.demand) * 100, 1) : 0;
  return result;
}

export function bestForOrder(result, orderId, excludeNames = []) {
  const order = result.plans.flatMap((p) => p.orders).find((r) => r.id === orderId);
  if (!order) return [];
  const owner = result.plans.find((p) => p.orderIds.includes(orderId));
  const drivers = result.context.drivers.map((d) => ({ ...d, booked:d.booked.filter(o=>o.id!==orderId), load: d.load - (owner?.driverName === d.name ? (num(order.count) || 1) : 0) }));
  return scoreCandidates(order, { ...result.context, drivers }, { excludeNames });
}

export function applyPlanToDispatchPreview(plans) {
  const map = new Map();
  for (const p of plans) for (const o of p.orders) map.set(o.id, { driver: p.driverName, vehicleNo: p.vehicleNo });
  return map;
}

export function planExportRows(plans) {
  const headers = ['배차일', '기사', '차량번호', '등급', '권역', '댓수', '회전', '거래처', '도착지', '차대번호', '비고'];
  const rows = [headers];
  for (const p of plans) {
    for (const o of p.orders) {
      rows.push([o.date, p.driverName, p.vehicleNo, p.grade, o.region || regionOf(o.destination), num(o.count) || 1, num(o.turn) || 1, o.customer, o.destination, o.vin, `추천 ${Math.round(p.confidence * 100)}%`]);
    }
  }
  return rows;
}
