import * as db from './db.js';
import { uid, ymd, addDays, todayStr, parseYmd, num, str, norm, normalizePlate, regionOf, brandOf, round } from './utils.js';
import { SAFETY_SEED } from './safety-seed.js';

export const DEFAULT_SETTINGS = {
  company: 'M&M통운',
  logo: '',
  demo: false,
  eval: {
    weights: { volume: 25, continuity: 20, efficiency: 20, destVariety: 20, customerVariety: 10, brand: 5 },
    standards: { volume: 498, days: 84, perDay: 7.7, destRatio: 0.344, customers: 3, brandRatio: 0.545 },
    bonus: { d100: 8, d80: 6, d60: 4 },
    penalties: { cancelRate: 10, incident: { 상: 8, 중: 4, 하: 1 }, costPer10k: 0.1 },
    prorate: true,
    periodDays: 182,
  },
  assign: {
    maxPerDriver: 14,
    historyDays: 365,
    historyWeight: 0.45,
    gradeWeight: 0.2,
    prefWeight: 0.15,
    balanceWeight: 0.2,
    incidentPenalty: 0.12,
    unassignedPenalty: 0,
    includeAssigned: false,
  },
  google: { url: '', token: '', auto: false, lastSync: null },
  photo: { maxWidth: 1600, quality: 0.72, warnAt: 0.7, blockAt: 0.88 },
};

export const state = {
  settings: structuredClone(DEFAULT_SETTINGS),
  drivers: [],
  equipment: [],
  products: [],
  incidents: [],
  assignments: [],
  safety: [],
  imports: [],
  workdate: '',
  ready: false,
  storage: null,
};

const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const emit = (event = 'change', detail = null) => listeners.forEach((fn) => fn(event, detail));

const deepMerge = (base, patch) => {
  if (Array.isArray(base) || Array.isArray(patch) || typeof base !== 'object' || base === null || typeof patch !== 'object' || patch === null) return patch ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = k in base ? deepMerge(base[k], v) : v;
  return out;
};

export async function initData() {
  const saved = await db.getSetting('settings');
  state.settings = deepMerge(structuredClone(DEFAULT_SETTINGS), saved || {});
  await db.setSetting('settings', state.settings);
  await reloadAll();
  const SEED_VERSION = 4;
  const meta = await db.get('meta', 'seeded');
  if (!meta || (meta.value !== SEED_VERSION && state.settings.demo)) {
    if (meta) await clearDemoData();
    await seedDemo({ silent: true });
    await db.put('meta', { key: 'seeded', value: SEED_VERSION, at: new Date().toISOString() });
  }
  await reloadAll();
  const safetyMeta = await db.get('meta', 'safetySeeded');
  if (!safetyMeta && !state.safety.length) {
    await db.bulkPut('safety', SAFETY_SEED);
    await db.put('meta', { key: 'safetySeeded', value: '2026-10-13', at: new Date().toISOString() });
    await reloadAll();
  }
  const dates = state.dispatch.map((r) => r.date).filter(Boolean).sort();
  const stored = await db.getSetting('workdate');
  state.workdate = stored && dates.includes(stored) ? stored : (dates[dates.length - 1] || todayStr());
  state.ready = true;
  emit('ready');
}

export async function reloadAll() {
  const [drivers, equipment, products, incidents, assignments, imports, dispatch, safety] = await Promise.all([
    db.getAll('drivers'), db.getAll('equipment'), db.getAll('products'),
    db.getAll('incidents'), db.getAll('assignments'), db.getAll('imports'), db.getAll('dispatch'), db.getAll('safety'),
  ]);
  state.drivers = drivers;
  state.equipment = equipment;
  state.products = products;
  state.incidents = incidents;
  state.assignments = assignments;
  state.imports = imports.sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt)));
  state.dispatch = dispatch;
  state.safety = safety;
  emit('data');
}

let dispatchCache = null;
export function dispatchRows() {
  if (!dispatchCache) dispatchCache = state.dispatch;
  return dispatchCache;
}
export function invalidateDispatch() { dispatchCache = null; }

export async function saveSettings(patch) {
  state.settings = deepMerge(state.settings, patch);
  await db.setSetting('settings', state.settings);
  emit('settings', state.settings);
  return state.settings;
}
export async function setWorkdate(date) {
  state.workdate = date;
  await db.setSetting('workdate', date);
  emit('workdate', date);
}

/* ---------------- Drivers ---------------- */
export function driverByName(name) {
  const n = norm(name);
  if (!n) return null;
  return state.drivers.find((d) => norm(d.name) === n || (d.aliases || []).some((a) => norm(a) === n)) || null;
}
export function driverById(id) {
  return state.drivers.find((d) => d.id === id) || null;
}
export async function saveDriver(driver) {
  const row = {
    id: driver.id || uid('drv'),
    name: str(driver.name),
    phone: str(driver.phone),
    vehicleNo: normalizePlate(driver.vehicleNo),
    type: driver.type || '개별',
    preferred: driver.preferred || [],
    avoid: driver.avoid || [],
    aliases: (driver.aliases || []).map(str).filter(Boolean),
    status: driver.status || 'active',
    joinedAt: driver.joinedAt || '',
    memo: str(driver.memo),
    createdAt: driver.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (!row.name) throw new Error('기사 이름을 입력하세요.');
  await db.put('drivers', row);
  await reloadAll();
  return row;
}
export async function deleteDriver(id) {
  await db.del('drivers', id);
  await reloadAll();
}
export function unknownDriversFromRows(rows) {
  const known = new Set(state.drivers.flatMap((d) => [norm(d.name), ...(d.aliases || []).map(norm)]));
  const map = new Map();
  for (const r of rows) {
    const name = str(r.driver);
    if (!name || ['지원', '취소', '미출고', '회송', '변경', '사고'].includes(name)) continue;
    if (known.has(norm(name))) continue;
    if (!map.has(name)) map.set(name, { name, count: 0, plates: new Map(), phones: new Map(), regions: new Map(), lastDate: '' });
    const item = map.get(name);
    item.count += num(r.count) || 1;
    if (r.vehicleNo) item.plates.set(r.vehicleNo, (item.plates.get(r.vehicleNo) || 0) + 1);
    if (r.driverPhone) item.phones.set(r.driverPhone, (item.phones.get(r.driverPhone) || 0) + 1);
    if (r.region) item.regions.set(r.region, (item.regions.get(r.region) || 0) + 1);
    if (r.date > item.lastDate) item.lastDate = r.date;
  }
  const top = (m, n = 1) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map((x) => x[0]);
  return [...map.values()].map((x) => ({
    ...x, plates: [...x.plates.keys()], phones: [...x.phones.keys()],
    preferred: top(x.regions, 2), topPlate: top(x.plates, 1)[0] || '', topPhone: top(x.phones, 1)[0] || '',
  })).sort((a, b) => b.count - a.count);
}

export async function registerDriversFromRows(rows) {
  const targets = unknownDriversFromRows(rows);
  if (!targets.length) return { created: 0, linked: 0 };
  const now = new Date().toISOString();
  const creates = [];
  const updates = new Map();
  for (const x of targets) {
    const base = x.name.replace(/(개별|텍싼|협력|직영|용차)$/i, '').trim();
    if (base && base !== x.name) {
      const master = driverByName(base);
      if (master && !(master.aliases || []).some((a) => norm(a) === norm(x.name))) {
        updates.set(master.id, { ...master, aliases: [...(master.aliases || []), x.name], updatedAt: now });
        continue;
      }
    }
    creates.push({
      id: uid('drv'), name: x.name, phone: x.topPhone, vehicleNo: normalizePlate(x.topPlate),
      type: '개별', preferred: x.preferred, avoid: [], aliases: [], status: 'active',
      joinedAt: '', memo: `배차판에서 자동 등록 (${x.count}대)`, createdAt: now, updatedAt: now,
    });
  }
  await db.bulkPut('drivers', [...updates.values(), ...creates]);
  await reloadAll();
  return { created: creates.length, linked: updates.size };
}

export function driversFromDispatch() {
  const known = new Set(state.drivers.flatMap((d) => [norm(d.name), ...(d.aliases || []).map(norm)]));
  const map = new Map();
  for (const r of state.dispatch) {
    const name = str(r.driver);
    if (!name || ['지원', '취소', '미출고', '회송', '변경', '사고'].includes(name)) continue;
    if (known.has(norm(name))) continue;
    if (!map.has(name)) map.set(name, { name, count: 0, plates: new Set(), lastDate: '' });
    const item = map.get(name);
    item.count += num(r.count) || 1;
    if (r.vehicleNo) item.plates.add(r.vehicleNo);
    if (r.date > item.lastDate) item.lastDate = r.date;
  }
  return [...map.values()].map((x) => ({ ...x, plates: [...x.plates] })).sort((a, b) => b.count - a.count);
}
export async function registerDriversFromDispatch(names) {
  const targets = driversFromDispatch().filter((x) => names.includes(x.name));
  const rows = targets.map((x) => ({
    id: uid('drv'), name: x.name, phone: '', vehicleNo: normalizePlate(x.plates[0] || ''),
    type: '개별', preferred: [], avoid: [], aliases: [], status: 'active',
    joinedAt: '', memo: '배차판에서 자동 등록', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }));
  await db.bulkPut('drivers', rows);
  await reloadAll();
  return rows.length;
}

/* ---------------- Equipment ---------------- */
export async function saveEquipment(item) {
  const row = {
    id: item.id || uid('eqp'),
    plateNo: normalizePlate(item.plateNo),
    type: item.type || '카캐리어',
    model: str(item.model),
    capacity: num(item.capacity) || 5,
    driverId: item.driverId || '',
    driverName: str(item.driverName),
    insuranceExpiry: item.insuranceExpiry || '',
    inspectionExpiry: item.inspectionExpiry || '',
    status: item.status || 'active',
    memo: str(item.memo),
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (!row.plateNo) throw new Error('차량번호를 입력하세요.');
  await db.put('equipment', row);
  await reloadAll();
  return row;
}
export async function deleteEquipment(id) {
  await db.del('equipment', id);
  await reloadAll();
}
export function equipmentByPlate(plate) {
  const p = normalizePlate(plate);
  return state.equipment.find((e) => normalizePlate(e.plateNo) === p) || null;
}
export async function importEquipmentFromSafety(records, { company = '', onlyActive = true } = {}) {
  const existing = new Set(state.equipment.map((e) => normalizePlate(e.plateNo)));
  const now = new Date().toISOString();
  const rows = [];
  for (const r of records) {
    if (company && r.company !== company) continue;
    if (onlyActive && !r.active) continue;
    const plate = normalizePlate(r.plateNo);
    if (!plate || existing.has(plate)) continue;
    existing.add(plate);
    rows.push({
      id: uid('eqp'), plateNo: plate, type: '카캐리어', model: r.bodyType || '카캐리어',
      capacity: num(r.capacity) || 5, driverId: '', driverName: '',
      insuranceExpiry: '', inspectionExpiry: '', status: r.active ? 'active' : 'idle',
      safetyId: r.id, memo: `${r.company || ''} · ${r.ageBand || ''} · 안전점검 연동 ${todayStr()}`,
      createdAt: now, updatedAt: now,
    });
  }
  if (rows.length) {
    await db.bulkPut('equipment', rows);
    await reloadAll();
  }
  return { created: rows.length, skipped: records.filter((r) => (!company || r.company === company) && (!onlyActive || r.active)).length - rows.length };
}

/* ---------------- Safety (Tesla 고정 Pool) ---------------- */
export function safetyByPlateMap() {
  const map = new Map();
  for (const r of state.safety) {
    const p = normalizePlate(r.plateNo);
    if (!p) continue;
    if (!map.has(p)) map.set(p, []);
    map.get(p).push(r);
  }
  return map;
}
export function safetyForPlate(plate) {
  const p = normalizePlate(plate);
  if (!p) return [];
  return state.safety.filter((r) => normalizePlate(r.plateNo) === p);
}
export async function saveSafety(item) {
  const row = {
    ...item,
    id: item.id || uid('saf'),
    plateNo: normalizePlate(item.plateNo),
    no: num(item.no) || item.no || '',
    year: num(item.year) || '',
    approvalYear: num(item.approvalYear) || '',
    tonnage: num(item.tonnage),
    capacity: num(item.capacity),
    active: item.operating === '○' || /^운행|운행중|가동/.test(str(item.operating)),
    memo: str(item.memo),
    updatedAt: new Date().toISOString(),
    createdAt: item.createdAt || new Date().toISOString(),
  };
  if (!row.plateNo) throw new Error('차량번호를 입력하세요.');
  await db.put('safety', row);
  await reloadAll();
  return row;
}
export async function deleteSafety(id) {
  await db.del('safety', id);
  await reloadAll();
}
export async function commitSafety(rows, { replace = false, fileName = '' } = {}) {
  let inserted = 0, updated = 0;
  const existing = new Map(state.safety.map((r) => [r.id, r]));
  const byNatural = new Map(state.safety.map((r) => [`${r.no}|${r.plateNo}`, r]));
  const out = [];
  const used = new Set();
  for (const raw of rows) {
    const natural = `${raw.no}|${raw.plateNo}`;
    const prev = existing.get(raw.id) || byNatural.get(natural);
    let id = prev?.id || raw.id || uid('saf');
    while (used.has(id)) id = uid('saf');
    used.add(id);
    const row = {
      ...raw,
      id,
      sourceFile: fileName || raw.sourceFile || '',
      importedAt: new Date().toISOString(),
      createdAt: prev?.createdAt || raw.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (prev) updated++; else inserted++;
    out.push(row);
  }
  if (replace) await db.clearStore('safety');
  await db.bulkPut('safety', out);
  await reloadAll();
  return { inserted, updated, total: out.length };
}

/* ---------------- Products ---------------- */
export async function saveProduct(item) {
  const row = {
    id: item.id || uid('prd'),
    brand: str(item.brand),
    model: str(item.model),
    trim: str(item.trim),
    price: num(item.price),
    dealer: str(item.dealer),
    region: str(item.region),
    sourceUrl: str(item.sourceUrl),
    updatedAt: item.updatedAt || todayStr(),
    note: str(item.note),
    createdAt: item.createdAt || new Date().toISOString(),
  };
  if (!row.brand || !row.model) throw new Error('브랜드와 모델명을 입력하세요.');
  await db.put('products', row);
  await reloadAll();
  return row;
}
export async function deleteProduct(id) {
  await db.del('products', id);
  await reloadAll();
}
export async function markProductsUpdated(ids, date = todayStr()) {
  const set = new Set(ids);
  const rows = state.products.filter((p) => set.has(p.id)).map((p) => ({ ...p, updatedAt: date }));
  await db.bulkPut('products', rows);
  await reloadAll();
  return rows.length;
}
export const staleProducts = (days = 31) => {
  const limit = addDays(todayStr(), -days);
  return state.products.filter((p) => !p.updatedAt || p.updatedAt < limit);
};

/* ---------------- Incidents ---------------- */
export async function saveIncident(item) {
  const row = {
    id: item.id || uid('inc'),
    date: item.date || todayStr(),
    type: item.type || '클레임',
    severity: item.severity || '중',
    driverId: item.driverId || '',
    driverName: str(item.driverName),
    vehicleNo: str(item.vehicleNo),
    vin: str(item.vin).toUpperCase(),
    customer: str(item.customer),
    destination: str(item.destination),
    description: str(item.description),
    cost: num(item.cost),
    status: item.status || 'open',
    photos: item.photos || [],
    request: str(item.request),
    createdBy: item.createdBy || '관제',
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (!row.driverName && !row.vehicleNo) throw new Error('기사 또는 차량을 지정하세요.');
  await db.put('incidents', row);
  await reloadAll();
  return row;
}
export async function deleteIncident(id) {
  const photos = (await db.getAll('photos')).filter((p) => p.incidentId === id);
  await db.bulkDel('photos', photos.map((p) => p.id));
  await db.del('incidents', id);
  await reloadAll();
}
export async function setIncidentStatus(id, status) {
  const row = state.incidents.find((x) => x.id === id);
  if (!row) return;
  await db.put('incidents', { ...row, status, updatedAt: new Date().toISOString() });
  await reloadAll();
}
export function incidentsForDriver(name, from, to) {
  const n = norm(name);
  return state.incidents.filter((i) => norm(i.driverName) === n && (!from || i.date >= from) && (!to || i.date <= to));
}

/* ---------------- Dispatch ---------------- */
export function dispatchKey(r) {
  const base = [r.date, r.vin || r.model || '', r.departTime || '', r.destination || '', r.driver || ''].join('|');
  return base;
}
export async function commitDispatch(rows, importMeta = {}, onProgress = null) {
  const existing = new Map(state.dispatch.map((r) => [r.dedupeKey || dispatchKey(r), r]));
  const incoming = new Map();
  let inserted = 0, updated = 0;
  const toPut = [];
  for (const raw of rows) {
    let key = raw.dedupeKey || dispatchKey(raw);
    let finalKey = key;
    let n = 2;
    while (incoming.has(finalKey)) {
      finalKey = `${key}#${n++}`;
    }
    const prev = existing.get(finalKey);
    const row = {
      ...raw,
      id: prev?.id || uid('dsp'),
      dedupeKey: finalKey,
      importedAt: new Date().toISOString(),
    };
    if (prev) { updated++; row.createdAt = prev.createdAt; } else inserted++;
    incoming.set(finalKey, row);
    toPut.push(row);
  }
  const chunk = 1500;
  for (let i = 0; i < toPut.length; i += chunk) {
    await db.bulkPut('dispatch', toPut.slice(i, i + chunk));
    if (onProgress) onProgress(Math.min(1, (i + chunk) / Math.max(1, toPut.length)));
  }
  if (importMeta.fileName) {
    await db.put('imports', {
      id: importMeta.id || uid('imp'),
      fileName: importMeta.fileName,
      sheets: importMeta.sheets || [],
      totalRows: rows.length,
      inserted,
      updated,
      dates: importMeta.dates || [],
      warnings: importMeta.warnings || [],
      importedAt: new Date().toISOString(),
    });
  }
  invalidateDispatch();
  await reloadAll();
  return { inserted, updated, total: rows.length };
}

export async function deleteImport(id) {
  const imp = state.imports.find((x) => x.id === id);
  if (!imp) return 0;
  const rows = await db.getAll('dispatch');
  const targets = rows.filter((r) => r.sourceFile === imp.fileName);
  await db.bulkDel('dispatch', targets.map((r) => r.id));
  await db.del('imports', id);
  invalidateDispatch();
  await reloadAll();
  return targets.length;
}

export async function deleteDispatchByDates(from, to) {
  const rows = state.dispatch.filter((r) => (!from || r.date >= from) && (!to || r.date <= to));
  await db.bulkDel('dispatch', rows.map((r) => r.id));
  invalidateDispatch();
  await reloadAll();
  return rows.length;
}

export function rowsOn(date) {
  return state.dispatch.filter((r) => r.date === date);
}
export function latestDates(limit = 30) {
  return [...new Set(state.dispatch.map((r) => r.date).filter(Boolean))].sort().reverse().slice(0, limit);
}
export function hasDriver(r) { return !!str(r.driver) && !['지원', '취소', '미출고', '회송', '변경', '사고'].includes(str(r.driver)); }
export function isCounted(r) { return !['cancelled', 'notshipped', 'support'].includes(r.status) && num(r.count || 1) > 0; }

/* ---------------- Assignments ---------------- */
export async function saveAssignmentPlan(date, plans, meta = {}) {
  const rows = plans.map((p) => ({
    id: p.id || uid('asg'),
    date,
    driverId: p.driverId || '',
    driverName: p.driverName || '',
    vehicleNo: p.vehicleNo || '',
    orderIds: p.orderIds || [],
    regions: p.regions || [],
    totalCount: p.totalCount || 0,
    totalTurns: p.totalTurns || 0,
    score: p.score || 0,
    reasons: p.reasons || [],
    status: p.status || 'draft',
    createdAt: p.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...meta,
  }));
  const old = state.assignments.filter((a) => a.date === date);
  await db.bulkDel('assignments', old.map((a) => a.id));
  await db.bulkPut('assignments', rows);
  await reloadAll();
  return rows;
}
export function assignmentsOn(date) {
  return state.assignments.filter((a) => a.date === date);
}
export function confirmedPlans(date) {
  return state.assignments.filter((a) => a.date === date && a.status === 'confirmed');
}
export function plannedOverlay(date) {
  const map = new Map();
  for (const plan of confirmedPlans(date)) {
    for (const orderId of plan.orderIds || []) {
      map.set(orderId, { driverName: plan.driverName, vehicleNo: plan.vehicleNo, driverId: plan.driverId, planId: plan.id });
    }
  }
  return map;
}

/* 일괄 배차: 선택한 미배차 건을 한 기사에게 확정 배정 (기존 확정안은 유지) */
export async function bulkAssignOrders(rows, driver, vehicleNo = '') {
  if (!driver?.id) throw new Error('배정할 기사를 선택하세요.');
  const dates = [...new Set(rows.map((r) => r.date).filter(Boolean))];
  let assigned = 0, skipped = 0;
  const plans = [];
  const now = new Date().toISOString();
  for (const date of dates) {
    const overlay = plannedOverlay(date);
    const candidates = rows.filter((r) => r.date === date && isCounted(r) && !hasDriver(r) && !overlay.has(r.id));
    skipped += rows.filter((r) => r.date === date).length - candidates.length;
    if (!candidates.length) continue;
    const existing = state.assignments.find((a) => a.date === date && a.driverId === driver.id && a.status === 'confirmed')
      || state.assignments.find((a) => a.date === date && a.driverId === driver.id);
    const orderIds = [...new Set([...(existing?.orderIds || []), ...candidates.map((r) => r.id)])];
    const orders = orderIds.map((id) => state.dispatch.find((r) => r.id === id)).filter(Boolean);
    const row = {
      ...(existing || {}),
      id: existing?.id || uid('asg'),
      date,
      driverId: driver.id,
      driverName: driver.name,
      vehicleNo: normalizePlate(vehicleNo) || existing?.vehicleNo || driver.vehicleNo || '',
      orderIds,
      regions: [...new Set(orders.map((r) => r.region || regionOf(r.destination)))],
      totalCount: orders.reduce((s, r) => s + (num(r.count) || 1), 0),
      totalTurns: orders.reduce((s, r) => s + (num(r.turn) || 1), 0),
      score: existing?.score || 0,
      reasons: [...new Set([...(existing?.reasons || []), '수동 일괄 배차'])],
      status: 'confirmed',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    await db.put('assignments', row);
    plans.push(row);
    assigned += candidates.reduce((s, r) => s + (num(r.count) || 1), 0);
  }
  if (plans.length) await reloadAll();
  return { assigned, skipped, plans };
}

/* Public distribution starts with an empty ledger. */
export async function seedDemo() {
  return { drivers: 0, equipment: 0, products: 0, dispatch: 0, incidents: 0 };
}

export async function resetEverything() {
  await db.resetAll();
  await db.put('meta', { key: 'seeded', value: 9, at: new Date().toISOString() });
  await db.put('meta', { key: 'safetySeeded', value: 'reset', at: new Date().toISOString() });
  await db.setSetting('settings', { ...structuredClone(DEFAULT_SETTINGS), demo: false });
  invalidateDispatch();
}

export async function clearDemoData() {
  const demoRows = state.dispatch.filter((r) => r.sourceFile === '샘플 데이터');
  await db.bulkDel('dispatch', demoRows.map((r) => r.id));
  const demoDrivers = state.drivers.filter((d) => d.id.startsWith('drv_seed_'));
  await db.bulkDel('drivers', demoDrivers.map((d) => d.id));
  const demoEq = state.equipment.filter((d) => d.id.startsWith('eqp_seed_'));
  await db.bulkDel('equipment', demoEq.map((d) => d.id));
  const demoProducts = state.products.filter((d) => d.id.startsWith('prd_seed_'));
  await db.bulkDel('products', demoProducts.map((d) => d.id));
  const demoInc = state.incidents.filter((d) => d.id.startsWith('inc_seed_'));
  await db.bulkDel('incidents', demoInc.map((d) => d.id));
  await db.put('meta', { key: 'seeded', value: 4, at: new Date().toISOString() });
  invalidateDispatch();
  await reloadAll();
}

/* ---------------- Import commit helper ---------------- */
export function normalizeRowForStore(row) {
  return {
    ...row,
    count: num(row.count) || 1,
    turn: num(row.turn) || 1,
    brand: row.brand || brandOf(row),
    region: row.region || regionOf(row.destination),
    status: row.status || 'normal',
    supportAmount: num(row.supportAmount),
    billed: num(row.billed),
    unpaid: num(row.unpaid),
  };
}
