import { EQUIPMENT_STRUCTURES, equipmentStructure, capacityCategory } from './equipment-policy.js';
import { transportKey, guardDispatchImport } from './dispatch-identity.js';
import * as db from './db.js';
import { uid, ymd, addDays, todayStr, parseYmd, num, str, norm, normalizePlate, regionOf, brandOf, round } from './utils.js';
import { SAFETY_SEED } from './safety-seed.js';
import { availabilityOn, validateSchedule, availabilityRows, allocateTurn, rotationLoad, loadPolicy } from './schedule.js';
import { buildDemo } from './demo.js';

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
    historyDays: 730,
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
  vehicleSafetyDocuments: [],
  imports: [],
  transportHistory: [], historyImports: [],
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
  // Switch existing browsers to operational data once; never insert examples automatically.
  if (!await db.get('meta', 'operationalReadyV1')) {
    await clearDemoData();
    await saveSettings({ demo: false });
    await db.put('meta', { key: 'operationalReadyV1', at: new Date().toISOString() });
  }
  await db.put('meta', { key: 'publicDemoBootstrap', value: 1 });
  const dates = state.dispatch.map((r) => r.date).filter(Boolean).sort();
  const stored = await db.getSetting('workdate');
  state.workdate = stored && dates.includes(stored) ? stored : (dates[dates.length - 1] || todayStr());
  state.ready = true;
  emit('ready');
}

export async function reloadAll() {
  const [drivers, equipment, products, incidents, assignments, imports, dispatch, safety, transportHistory, historyImports] = await Promise.all([
    db.getAll('drivers'), db.getAll('equipment'), db.getAll('products'),
    db.getAll('incidents'), db.getAll('assignments'), db.getAll('imports'), db.getAll('dispatch'), db.getAll('safety'), db.getAll('transportHistory'), db.getAll('historyImports'),
  ]);
  state.drivers = drivers;
  state.equipment = equipment;
  state.products = products;
  state.incidents = incidents;
  state.assignments = assignments;
  state.imports = imports.sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt)));
  state.dispatch = dispatch;
  state.safety = safety.filter(r=>r.recordType!=='vehicleSafety');
  state.vehicleSafetyDocuments = safety.filter(r=>r.recordType==='vehicleSafety');
  state.transportHistory=transportHistory; state.historyImports=historyImports.sort((a,b)=>b.importedAt.localeCompare(a.importedAt));
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
    schedule: validateSchedule((driver.id ? (await db.get('drivers', driver.id))?.schedule : driver.schedule)),
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
    skillLevel: Math.max(1, Math.min(5, num(driver.skillLevel) || 1)), baseOrigin: str(driver.baseOrigin), supportedClasses: driver.supportedClasses || [], availableFrom: str(driver.availableFrom), availableTo: str(driver.availableTo),
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
  const previous=item.id?await db.get('equipment',item.id):null;
  const row = {
    ...(previous||{}),
    id: item.id || uid('eqp'),
    supportedClasses: item.supportedClasses || [], maxLoadKg: num(item.maxLoadKg),
    plateNo: normalizePlate(item.plateNo),
    type: item.type || '카캐리어',
    structure: item.structure || equipmentStructure(item),
    model: str(item.model),
    capacity: num(item.capacity),
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
  if(!EQUIPMENT_STRUCTURES.includes(row.structure))throw Error('장비 구조·용도를 선택하세요.');
  if(capacityCategory(row.capacity)==='review'&&row.capacity!==previous?.capacity)throw Error('적재량은 7대 이상·6대·5대·4대·2대·1대로 구분하세요.');
  if(!Number.isInteger(row.capacity)||row.capacity<0||row.capacity>50)throw Error('적재 대수는 0(미설정)~50대 정수로 입력하세요.');
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
  if(!Number.isInteger(row.capacity)||row.capacity<0||row.capacity>50)throw Error('적재 대수는 0(미설정)~50대 정수로 입력하세요.');
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
  if (replace) await db.bulkDel('safety', state.safety.map(r=>r.id));
  await db.bulkPut('safety', out);
  await reloadAll();
  return { inserted, updated, total: out.length };
}

/* ---------------- Products ---------------- */
export async function saveProduct(item) {
  const row = {
    ...(state.products.find(p=>p.id===item.id)||{}),
    id: item.id || uid('prd'),
    brand: str(item.brand),
    model: str(item.model),
    cargoClass: str(item.cargoClass), requiredEquipment: str(item.requiredEquipment), minSkill: Math.max(1, Math.min(5, num(item.minSkill) || 1)), weightKg: num(item.weightKg),
    trim: str(item.trim),
    price: item.price===''?null:item.price==null?(state.products.find(p=>p.id===item.id)?.price??null):num(item.price),
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
export function dispatchKey(r) { return transportKey(r); }
export async function commitDispatch(rows, importMeta = {}, onProgress = null) {
  const database=await db.openDb();
  const result=await new Promise((resolve,reject)=>{
    const tx=database.transaction(['dispatch','imports','closings'],'readwrite'), values={};let left=2,result,failure;
    for(const name of ['dispatch','closings'])tx.objectStore(name).getAll().onsuccess=e=>{
      values[name]=e.target.result;if(--left)return;
      try {
        const {accepted,held}=guardDispatchImport(rows,values.dispatch);
        const blocked=new Set(values.closings.filter(c=>c.status==='closed').map(c=>c.month));
        const safe=accepted.filter(r=>!blocked.has(r.date.slice(0,7)));
        const now=new Date().toISOString(),importId=uid('imp');
        for(const raw of safe) tx.objectStore('dispatch').put({...raw,id:uid('dsp'),dedupeKey:transportKey(raw),sourceImportId:importId,importedAt:now,createdAt:now});
        result={inserted:safe.length,updated:0,held:held.length+accepted.length-safe.length,total:rows.length};
        if(importMeta.fileName) tx.objectStore('imports').put({...importMeta,id:importId,source:'excel',totalRows:rows.length,...result,importedAt:now});
      }catch(e){failure=e;tx.abort();}
    };
    tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure||tx.error||Error('배차 저장 실패'));tx.onerror=()=>reject(tx.error);
  });
  onProgress?.(1);invalidateDispatch();await reloadAll();return result;
}

export async function deleteImport(id) {
  const imp = state.imports.find((x) => x.id === id);
  if (!imp) return 0;
  const rows = await db.getAll('dispatch');
  const targets = rows.filter((r) => ['googleSheet','excel'].includes(imp.source) ? r.sourceImportId === imp.id : !r.sourceImportId && r.sourceFile === imp.fileName);
  if((await db.getAll('assignments')).some(p=>p.formation&&p.status==='confirmed'&&(p.orderIds||[]).some(id=>targets.some(r=>r.id===id))))throw Error('확정 편성에 연결된 운송입니다. 배차 취소 후 업로드 자료를 삭제하세요.');
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
    orderTurns: p.orderTurns || {},
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
  await persistScheduledPlans(rows, date, !!meta.replaceConfirmed);
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
    if(state.assignments.some(p=>p.date===date&&p.driverId===driver.id&&p.status==='confirmed'&&p.formation))throw Error('이 기사는 회전별 편성으로 확정되어 있습니다. 배차 편성 메뉴에서 해당 회전을 열어 운송을 추가하세요.');
    const existing = state.assignments.find((a) => a.date === date && a.driverId === driver.id && a.status === 'confirmed')
      || state.assignments.find((a) => a.date === date && a.driverId === driver.id);
    const current=availabilityRows([driver],date,state.equipment,state.dispatch,state.assignments)[0];
    const booked=[...current.booked], orderTurns={...(existing?.orderTurns || {})};
    for(const order of candidates) {
      const turn=allocateTurn(booked,order,current);
      if(turn===null) throw Error(`${date} ${driver.name}: 상차 대수·일일 회전 한도 또는 미확인 회전을 확인하세요.`);
      orderTurns[order.id]=turn;booked.push({...order,turn});
    }
    const orderIds = [...new Set([...(existing?.orderIds || []), ...candidates.map((r) => r.id)])];
    const orders = orderIds.map((id) => state.dispatch.find((r) => r.id === id)).filter(Boolean);
    const row = {
      ...(existing || {}),
      id: existing?.id || uid('asg'),
      date,
      driverId: driver.id,
      driverName: driver.name,
      vehicleNo: normalizePlate(vehicleNo) || existing?.vehicleNo || driver.vehicleNo || '',
      orderIds, orderTurns,
      regions: [...new Set(orders.map((r) => r.region || regionOf(r.destination)))],
      totalCount: orders.reduce((s, r) => s + (num(r.count) || 1), 0),
      totalTurns: rotationLoad(orders.map(o=>({...o,turn:orderTurns[o.id] ?? o.turn}))).usedTurns,
      score: existing?.score || 0,
      reasons: [...new Set([...(existing?.reasons || []), '수동 일괄 배차'])],
      status: 'confirmed',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    plans.push(row);
    assigned += candidates.reduce((s, r) => s + (num(r.count) || 1), 0);
  }
  if (plans.length) { await persistScheduledPlans(plans); await reloadAll(); }
  return { assigned, skipped, plans };
}

/* Sample insertion is additive and idempotent. Existing operational rows are preserved. */
export async function seedDemo() {
  const demo = buildDemo();
  for (const [store, rows] of Object.entries(demo)) {
    const existing = new Set((await db.getAll(store)).map((r) => r.id));
    await db.bulkPut(store, rows.filter((r) => !existing.has(r.id)));
  }
  await db.put('meta', { key: 'publicDemoBootstrap', value: 1 });
  await saveSettings({ demo: true });
  invalidateDispatch();
  await reloadAll();
  return Object.fromEntries(Object.entries(demo).map(([key, rows]) => [key, rows.length]));
}

export async function resetEverything() {
  await db.resetAll();
  await db.put('meta', { key: 'seeded', value: 9, at: new Date().toISOString() });
  await db.put('meta', { key: 'publicDemoBootstrap', value: 1 });
  await db.put('meta', { key: 'safetySeeded', value: 'reset', at: new Date().toISOString() });
  await db.setSetting('settings', { ...structuredClone(DEFAULT_SETTINGS), demo: false });
  invalidateDispatch();
}

export async function clearDemoData() {
  const database = await db.openDb();
  const names = ['dispatch', 'drivers', 'equipment', 'products', 'incidents', 'assignments', 'settlements', 'meta'];
  await new Promise((resolve, reject) => {
    const tx = database.transaction(names, 'readwrite'), values = {}; let left = names.length;
    for (const name of names) tx.objectStore(name).getAll().onsuccess = event => {
      values[name] = event.target.result; if (--left) return;
      const sampleOrders = new Set(values.dispatch.filter(r => r.sourceFile === '샘플 데이터').map(r=>r.id));
      const realRows = values.dispatch.filter(r => !sampleOrders.has(r.id));
      for (const id of sampleOrders) tx.objectStore('dispatch').delete(id);
      const keptPlans = [];
      for (const plan of values.assignments) {
        const ids = (plan.orderIds || []).filter(id => !sampleOrders.has(id));
        if (ids.length === (plan.orderIds || []).length) { keptPlans.push(plan); continue; }
        if (!ids.length) tx.objectStore('assignments').delete(plan.id);
        else {
          const orders = realRows.filter(r=>ids.includes(r.id));
          const kept = { ...plan, orderIds: ids, totalCount: orders.reduce((n,r)=>n+(num(r.count)||1),0), totalTurns: plan.formation?1:rotationLoad(orders.map(r=>({...r,turn:plan.orderTurns?.[r.id]??r.turn}))).usedTurns };
          keptPlans.push(kept); tx.objectStore('assignments').put(kept);
        }
      }
      // Preserve a sample identity if it was deliberately reused in a real transport record.
      for (const driver of values.drivers.filter(d=>d.id.startsWith('drv_seed_'))) {
        if (realRows.some(r=>norm(r.driver)===norm(driver.name)) || keptPlans.some(p=>p.driverId===driver.id || norm(p.driverName)===norm(driver.name))) continue;
        tx.objectStore('drivers').delete(driver.id);
      }
      for (const eq of values.equipment.filter(e=>e.id.startsWith('eqp_seed_'))) {
        if (realRows.some(r=>r.vehicleNo && norm(r.vehicleNo)===norm(eq.plateNo)) || keptPlans.some(p=>p.vehicleNo && norm(p.vehicleNo)===norm(eq.plateNo))) continue;
        tx.objectStore('equipment').delete(eq.id);
      }
      for (const [name,prefix] of [['products','prd_seed_'],['incidents','inc_seed_']]) for (const row of values[name].filter(r=>r.id.startsWith(prefix))) tx.objectStore(name).delete(row.id);
      for (const row of values.settlements.filter(r=>sampleOrders.has(r.orderId))) tx.objectStore('settlements').delete(row.id);
      tx.objectStore('meta').put({ key: 'publicDemoBootstrap', value: 1 });
    };
    tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error || Error('샘플 삭제 취소'));
  });
  invalidateDispatch(); await reloadAll();
}

export async function saveDriverSchedule(id, schedule) {
  const database = await db.openDb();
  await new Promise((resolve,reject) => {
    const tx=database.transaction('drivers','readwrite'); let failure;
    tx.objectStore('drivers').get(id).onsuccess=event=>{
      const driver=event.target.result;
      if (!driver) { failure=Error('기사가 삭제되었거나 존재하지 않습니다.'); tx.abort(); return; }
      try { const normalized=validateSchedule(typeof schedule === 'function' ? schedule(driver.schedule || {mode:'daily',weekdays:[],exceptions:{}}) : schedule); tx.objectStore('drivers').put({ ...driver, schedule: normalized, updatedAt:new Date().toISOString() }); } catch(e) { failure=e; tx.abort(); }
    };
    tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(failure || tx.error);
  });
  await reloadAll();
}
async function persistScheduledPlans(rows, replaceDate = null, replaceConfirmed = false) {
  const database=await db.openDb();
  await new Promise((resolve,reject)=>{
    const names=['drivers','equipment','assignments','dispatch'], tx=database.transaction(names,'readwrite'), values={}; let left=names.length, failure;
    for (const name of names) tx.objectStore(name).getAll().onsuccess=event=>{
      values[name]=event.target.result; if (--left) return;
      if(replaceDate&&values.assignments.some(p=>p.date===replaceDate&&p.formation)) {failure=Error('회전별 편성이 있습니다. 배차 편성 메뉴에서 검토하세요.');tx.abort();return;}
      for (const row of rows) {
        if(!row.formation&&values.assignments.some(p=>p.formation&&p.status==='confirmed'&&p.date===row.date&&p.driverId===row.driverId)){failure=Error('확정 편성은 배차 편성 메뉴에서 변경하세요.');tx.abort();return;}
        const driver=values.drivers.find(d=>d.id===row.driverId);
        const status=driver && availabilityOn(driver,row.date,values.equipment);
        if (!status?.available) { failure=Error(`${row.date} ${driver?.name || row.driverName}: ${status?.reason || '등록되지 않은 기사'} — 스케줄을 확인하세요.`); tx.abort(); return; }
      }
      const kept=values.assignments.filter(p=>(!replaceDate || p.date!==replaceDate || (p.status==='confirmed' && !replaceConfirmed)) && !rows.some(r=>r.id===p.id));
      const proposed=[...kept,...rows];
      const orderOwners=new Map();
      for(const p of proposed.filter(p=>p.status==='confirmed')) for(const id of p.orderIds || []) {
        if(orderOwners.has(id)) {failure=Error('동일 운송이 여러 확정 배차에 포함되어 있습니다. 새로고침 후 확인하세요.');tx.abort();return;}
        orderOwners.set(id,p.driverId);
      }
      for(const row of rows.filter(r=>r.status==='confirmed')) {
        const driver=values.drivers.find(d=>d.id===row.driverId), policy=loadPolicy(driver,values.equipment);
        // Final validation uses fresh records inside the same transaction as the write.
        const check=availabilityRows([driver],row.date,values.equipment,values.dispatch,proposed)[0];
        if(check.review || check.over) {failure=Error(`${driver.name}: 회전별 상차 한도·일일 ${policy.maxTurns}회전 또는 미확인 자료를 확인하세요.`);tx.abort();return;}
        if((row.orderIds || []).some(id=>!values.dispatch.some(o=>o.id===id && o.date===row.date))) {failure=Error('운송 자료가 변경되었습니다. 다시 배정하세요.');tx.abort();return;}
      }
      if (replaceDate) for (const old of values.assignments.filter(p=>p.date===replaceDate && (replaceConfirmed || p.status!=='confirmed'))) tx.objectStore('assignments').delete(old.id);
      for (const row of rows) tx.objectStore('assignments').put(row);
    };
    tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(failure || tx.error || Error('배차 저장 취소'));
  });
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
