/* IndexedDB wrapper — M&M 통합 운송 관제 */
const DB_NAME = 'mm-transport-control';
const DB_VERSION = 4;

export const STORES = {
  transportHistory: {keyPath:'id',indexes:[['date','date']]},
  historyImports: {keyPath:'id',indexes:[]},
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

const writeListeners=new Set(),quietTransactions=new WeakSet();
export const onWrite=fn=>{writeListeners.add(fn);return ()=>writeListeners.delete(fn);};
export function quietTransaction(database,names,mode){const transaction=database.transaction(names,mode);quietTransactions.add(transaction);return transaction;}
function observeDatabase(database){return new Proxy(database,{get(target,key){if(key==='transaction')return (...args)=>{const tx=target.transaction(...args);if(args[1]==='readwrite')tx.addEventListener('complete',()=>{if(!quietTransactions.has(tx))for(const fn of writeListeners)fn();});return tx;};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});}
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
    req.onsuccess = () => { req.result.onversionchange = () => { req.result.close(); dbPromise = null; }; resolve(observeDatabase(req.result)); };
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
  const s=await tx(store,'readwrite');
  await new Promise((resolve,reject)=>{s.transaction.addEventListener('complete',resolve);s.transaction.addEventListener('abort',()=>reject(s.transaction.error||Error('저장 취소')));s.transaction.addEventListener('error',()=>reject(s.transaction.error));s.put(obj);});
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
  await new Promise((resolve,reject)=>{s.transaction.addEventListener('complete',resolve);s.transaction.addEventListener('abort',()=>reject(s.transaction.error||Error('삭제 취소')));s.delete(key);});
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
  await new Promise((resolve,reject)=>{s.transaction.addEventListener('complete',resolve);s.transaction.addEventListener('abort',()=>reject(s.transaction.error||Error('초기화 취소')));s.clear();});
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
  const names=Object.keys(payload.data).filter(name=>STORES[name]);
  if(!names.length)throw Error('복원할 자료가 없습니다.');
  const database=await openDb();
  await new Promise((resolve,reject)=>{const transaction=database.transaction(names,'readwrite');for(const name of names){const target=transaction.objectStore(name);if(!merge)target.clear();for(const row of payload.data[name]||[])target.put(row);}transaction.oncomplete=resolve;transaction.onabort=()=>reject(transaction.error||Error('복원 취소'));transaction.onerror=()=>reject(transaction.error);});
}

export async function resetAll() {
  for (const name of Object.keys(STORES)) await clearStore(name);
}
