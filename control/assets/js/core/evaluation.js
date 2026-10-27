/* 운전자 평가 엔진 — M&M 6개 지표(100점) + 등급 */
import { state } from './data.js';
import { norm, num, str, clamp, round, gradeOf, unique, addDays, todayStr, parseYmd, diffDays } from './utils.js';

export const METRIC_LABELS = {
  volume: '운송량',
  continuity: '근무 지속성',
  efficiency: '효율성',
  destVariety: '도착지 다양성',
  customerVariety: '거래처 다양성',
  brand: '브랜드 참여도',
};

export const GRADE_RANGES = [
  ['S', 90, '최우수'],
  ['A', 80, '우수'],
  ['B', 70, '양호'],
  ['C', 60, '보통'],
  ['D', 50, '미흡'],
  ['F', 0, '개선 필요'],
];

export function periodRange(preset = '6m', custom = null) {
  const dates = state.dispatch.map((r) => r.date).filter(Boolean).sort();
  const latest = dates[dates.length - 1] || todayStr();
  const end = latest;
  if (preset === 'custom' && custom?.from) return { from: custom.from, to: custom.to || end, end };
  if (preset === 'month') {
    const d = parseYmd(latest);
    return { from: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`, to: end };
  }
  if (preset === '3m') return { from: addDays(end, -89), to: end };
  if (preset === '6m') return { from: addDays(end, -181), to: end };
  if (preset === 'all') return { from: dates[0] || addDays(end, -181), to: end };
  return { from: addDays(end, -181), to: end };
}

const counted = (r) => !['cancelled', 'notshipped', 'support'].includes(r.status);
const canonicalName = (name) => {
  const n = norm(name);
  if (!n) return '';
  const master = state.drivers.find((d) => norm(d.name) === n || (d.aliases || []).some((a) => norm(a) === n));
  return master ? master.name : str(name);
};

export function evaluate({ from, to } = {}) {
  const fromDate = from || addDays(todayStr(), -181);
  const toDate = to || todayStr();
  const spanDays = Math.max(1, diffDays(fromDate, toDate) + 1);
  const cfg = state.settings.eval;
  const factor = cfg.prorate ? Math.max(0.05, spanDays / (cfg.periodDays || 182)) : 1;
  const std = {
    volume: (cfg.standards.volume || 498) * factor,
    days: (cfg.standards.days || 84) * factor,
    perDay: cfg.standards.perDay || 7.7,
    destRatio: cfg.standards.destRatio || 0.344,
    customers: cfg.standards.customers || 3,
    brandRatio: cfg.standards.brandRatio || 0.545,
  };

  const rows = state.dispatch.filter((r) => r.date >= fromDate && r.date <= toDate);
  const driverMap = new Map();
  const byMaster = new Map(state.drivers.map((d) => [norm(d.name), d]));
  const aliasMap = new Map();
  for (const d of state.drivers) for (const a of d.aliases || []) aliasMap.set(norm(a), d);

  for (const r of rows) {
    const rawName = str(r.driver);
    if (!rawName || ['지원', '취소', '미출고', '회송', '변경', '사고'].includes(rawName)) continue;
    const master = byMaster.get(norm(rawName)) || aliasMap.get(norm(rawName));
    const name = master ? master.name : canonicalName(rawName);
    if (!name) continue;
    if (!driverMap.has(name)) {
      driverMap.set(name, {
        name,
        master,
        count: 0, workdays: new Set(), destinations: new Set(), customers: new Set(),
        brands: new Set(), rows: [], cancelled: 0, support: 0, turns: 0, firstDate: '', lastDate: '', byDate: new Map(),
      });
    }
    const d = driverMap.get(name);
    const cnt = num(r.count) || 1;
    d.rows.push(r);
    d.turns += num(r.turn) || 1;
    d.byDate.set(r.date, (d.byDate.get(r.date) || 0) + cnt);
    if (r.status === 'cancelled') { d.cancelled++; continue; }
    if (r.status === 'support') { d.support++; continue; }
    if (!counted(r)) continue;
    d.count += cnt;
    d.workdays.add(r.date);
    if (r.destination) d.destinations.add(norm(r.destination));
    if (r.customer) d.customers.add(norm(r.customer));
    if (r.brand) d.brands.add(norm(r.brand));
    if (!d.firstDate || r.date < d.firstDate) d.firstDate = r.date;
    if (!d.lastDate || r.date > d.lastDate) d.lastDate = r.date;
  }

  // 평가 대상 기사(배차 이력 없음)도 확인할 수 있게 master 전체를 포함
  for (const m of state.drivers) {
    if (!driverMap.has(m.name)) {
      driverMap.set(m.name, {
        name: m.name, master: m, count: 0, workdays: new Set(), destinations: new Set(), customers: new Set(),
        brands: new Set(), rows: [], cancelled: 0, support: 0, turns: 0, firstDate: '', lastDate: '', byDate: new Map(),
      });
    }
  }

  const incidents = state.incidents.filter((i) => i.date >= fromDate && i.date <= toDate);
  const incidentByDriver = new Map();
  for (const i of incidents) {
    const name = canonicalName(i.driverName);
    if (!name) continue;
    if (!incidentByDriver.has(name)) incidentByDriver.set(name, []);
    incidentByDriver.get(name).push(i);
  }

  const results = [...driverMap.values()].map((d) => {
    const days = d.workdays.size;
    const avgPerDay = days ? d.count / days : 0;
    const destRatio = d.count ? d.destinations.size / d.count : 0;
    const brandRatio = d.brands.size / 12;
    const volScore = clamp((d.count / Math.max(1, std.volume)) * 25, 0, 25);
    let bonus = 0;
    if (days >= 100) bonus = cfg.bonus.d100 ?? 8;
    else if (days >= 80) bonus = cfg.bonus.d80 ?? 6;
    else if (days >= 60) bonus = cfg.bonus.d60 ?? 4;
    const contBase = clamp((days / Math.max(1, std.days)) * 12, 0, 12);
    const contScore = clamp(contBase + bonus, 0, 20);
    const effScore = clamp((avgPerDay / Math.max(0.1, std.perDay)) * 20, 0, 20);
    const destScore = clamp(Math.sqrt(Math.min(1, destRatio / Math.max(0.01, std.destRatio))) * 20, 0, 20);
    const custScore = clamp((d.customers.size / Math.max(1, std.customers)) * 10, 0, 10);
    const brandScore = clamp((brandRatio / Math.max(0.01, std.brandRatio)) * 5, 0, 5);
    const subscores = { volume: volScore, continuity: contScore, efficiency: effScore, destVariety: destScore, customerVariety: custScore, brand: brandScore };

    const inc = incidentByDriver.get(d.name) || [];
    const sevPoints = { 상: 8, 중: 4, 하: 1 };
    const incPenalty = inc.reduce((s, i) => s + (cfg.penalties.incident?.[i.severity] ?? sevPoints[i.severity] ?? 0), 0);
    const costPenalty = Math.min(10, inc.reduce((s, i) => s + (num(i.cost) / 10000) * (cfg.penalties.costPer10k ?? 0.1), 0));
    const cancelRate = d.rows.length ? d.cancelled / d.rows.length : 0;
    const cancelPenalty = cancelRate * (cfg.penalties.cancelRate ?? 10);
    const penalty = incPenalty + costPenalty + cancelPenalty;
    const total = clamp(Object.values(subscores).reduce((a, b) => a + b, 0) - penalty, 0, 100);
    const grade = gradeOf(total);
    return {
      name: d.name,
      driverId: d.master?.id || '',
      phone: d.master?.phone || '',
      vehicleNo: d.master?.vehicleNo || d.rows.find((r) => r.vehicleNo)?.vehicleNo || '',
      type: d.master?.type || '미등록',
      active: !d.master || d.master.status === 'active',
      count: d.count,
      days,
      avgPerDay: round(avgPerDay, 2),
      destinations: d.destinations.size,
      customers: d.customers.size,
      brands: d.brands.size,
      destRatio: round(destRatio, 3),
      turns: d.turns,
      cancelled: d.cancelled,
      support: d.support,
      incidents: inc.length,
      incidentCost: inc.reduce((s, i) => s + num(i.cost), 0),
      incidentPenalty: round(incPenalty + costPenalty, 1),
      cancelPenalty: round(cancelPenalty, 1),
      penalty: round(penalty, 1),
      subscores: Object.fromEntries(Object.entries(subscores).map(([k, v]) => [k, round(v, 1)])),
      total: round(total, 1),
      grade,
      firstDate: d.firstDate,
      lastDate: d.lastDate,
      recent: d.rows.slice(-8).reverse(),
      incidentList: inc,
    };
  }).sort((a, b) => b.total - a.total || b.count - a.count);

  const distribution = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 };
  results.forEach((r) => distribution[r.grade]++);
  const active = results.filter((r) => r.count > 0);
  return {
    from: fromDate, to: toDate, spanDays, factor,
    standards: std,
    results,
    summary: {
      drivers: results.length,
      activeDrivers: active.length,
      avgScore: round(active.reduce((s, r) => s + r.total, 0) / Math.max(1, active.length), 1),
      totalVolume: active.reduce((s, r) => s + r.count, 0),
      distribution,
      incidents: incidents.length,
      incidentCost: incidents.reduce((s, i) => s + num(i.cost), 0),
    },
  };
}

export function evaluationForDriver(name, range) {
  const ev = evaluate(range);
  return ev.results.find((r) => norm(r.name) === norm(name)) || null;
}

export function gradeCache(range) {
  const ev = evaluate(range);
  const map = new Map();
  for (const r of ev.results) map.set(norm(r.name), r);
  return map;
}
