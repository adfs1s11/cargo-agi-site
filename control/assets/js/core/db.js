/* IndexedDB wrapper — M&M 통합 운송 관제 */
const DB_NAME = 'mm-transport-control';
const DB_VERSION = 3;

export const STORES = {
  rates: { keyPath: 'id', indexes: [['side', 'side']] },
  settlements: { keyPath: 'id', indexes: [['date', 'date']] },
  closings: { keyPath: 'id', indexes: [['month', 'month']] },
  settlementImports: { keyPath: 'id', indexes: [] },
  dispatch: { keyPath: 'id', indexes: [['date', 'date'], ['driver', 'driver'], ['vin', 'vin'], ['status', 'status'], ['sourceFile', 'sourceFile']] },
  drivers: { keyPath: 'id', indexes: [['name', 'name'], ['status', 'status']] },
  equipment: { keyPath: 'id', indexes: [['plateNo', 'plateNo'], ['driverId', 'driverId']] },
  products: { keyPath: 'id', indexes: [['brand', 'brand']] },
  incidents: { keyPath: 'id', indexes: [['date', 'date'], ['driverName', 'driverName'], ['status', 'status']] },
  assignments: { keyPath: 'id', indexes: [['date', 'date'], ['status', 'status']] },
  safety: { keyPath: 'id', indexes: [['plateNo', 'plateNo'], ['company', 'company'], ['operating', 'operating']] },
  imports: { keyPath: 'id', indexes: [['importedAt', 'importedAt']] },
  photos: { keyPath: 'id', indexes: [['incidentId', 'incidentId'], ['createdAt', 'createdAt']] },
  settings: { keyPath: 'key' },
  meta: { keyPath: 'key' },
};

let dbPromise = null;
export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, def] of Object.entries(STORES)) {
        let store;
        if (!db.objectStoreNames.contains(name)) store = db.createObjectStore(name, { keyPath: def.keyPath });
        else store = req.transaction.objectStore(name);
        for (const [idxName, path] of def.indexes || []) {
          if (!store.indexNames.contains(idxName)) store.createIndex(idxName, path, { unique: false });
        }
      }
    };
    req.onsuccess = () => { req.result.onversionchange = () => { req.result.close(); dbPromise = null; }; resolve(req.result); };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('다른 탭에서 DB를 사용 중입니다. 모든 탭을 닫고 다시 시도하세요.'));
  });
  return dbPromise;
}

const tx = async (store, mode = 'readonly') => {
  const db = await openDb();
  return db.transaction(store, mode).objectStore(store);
};
const wrap = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export async function getAll(store) {
  return wrap((await tx(store)).getAll());
}
export async function get(store, key) {
  return wrap((await tx(store)).get(key));
}
export async function put(store, obj) {
  const s = await tx(store, 'readwrite');
  await wrap(s.put(obj));
  return obj;
}
export async function bulkPut(store, list) {
  if (!list?.length) return 0;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    for (const item of list) s.put(item);
    t.oncomplete = () => resolve(list.length);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('저장이 취소되었습니다.'));
  });
}
export async function del(store, key) {
  const s = await tx(store, 'readwrite');
  await wrap(s.delete(key));
}
export async function bulkDel(store, keys) {
  if (!keys?.length) return 0;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    keys.forEach((k) => s.delete(k));
    t.oncomplete = () => resolve(keys.length);
    t.onerror = () => reject(t.error);
  });
}
export async function clearStore(store) {
  const s = await tx(store, 'readwrite');
  await wrap(s.clear());
}
export async function count(store) {
  return wrap((await tx(store)).count());
}
export async function getSetting(key, fallback = null) {
  const row = await get('settings', key);
  return row ? row.value : fallback;
}
export async function setSetting(key, value) {
  return put('settings', { key, value });
}
export async function estimateStorage() {
  if (!navigator.storage?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota, ratio: quota ? usage / quota : 0 };
  } catch {
    return null;
  }
}

export async function exportAll() {
  const out = { app: 'mm-transport-control', version: 1, exportedAt: new Date().toISOString(), data: {} };
  for (const name of Object.keys(STORES)) out.data[name] = await getAll(name);
  return out;
}

export async function importAll(payload, { merge = false } = {}) {
  if (!payload?.data) throw new Error('백업 파일 형식이 아닙니다.');
  if (!merge) for (const name of ['rates', 'settlements', 'closings', 'settlementImports']) {
    if (!Object.hasOwn(payload.data, name) && await count(name)) throw new Error('이전 형식의 백업에는 정산·마감 자료가 없습니다. 현재 자료를 포함한 전체 백업으로 복원해 주세요.');
  }
  for (const [name, rows] of Object.entries(payload.data)) {
    if (!STORES[name]) continue;
    if (!merge) await clearStore(name);
    if (rows?.length) await bulkPut(name, rows);
  }
}

export async function resetAll() {
  for (const name of Object.keys(STORES)) await clearStore(name);
}
