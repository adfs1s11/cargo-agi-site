// Whole-store write snapshots and read-only day views have separate lifecycles.
export const STARTUP_STORES=['settings','drivers','assignments'];
export const NORMAL_STORES=['settings','drivers','equipment','products','incidents','assignments','imports','dispatch','safety','historyImports','rates','settlements','closings','settlementImports','photos','meta'];
export function routeStores(id){
 if(id==='driver-app-admin')return ['settings','drivers','equipment','assignments'];
 if(id==='fleet'||id==='dashboard'||id==='dispatch-reference'||id==='destination-regions'||id==='driver-notices'||id.startsWith('forwarding')||id.startsWith('kgm'))return STARTUP_STORES;
 // Until a legacy editor has an audited dependency list, load its complete stores.
 return ['engine','assign','evaluation'].includes(id)?[...NORMAL_STORES,'transportHistory']:NORMAL_STORES;
}
export function storesReady(snapshot,stores){
 return !!snapshot&&stores.every(s=>!snapshot.manifest.profile.stores.includes(s)||snapshot.loadedStores.includes(s));
}
export function mergeStoreSnapshots(current,incoming){
 const a=current.manifest,b=incoming.manifest;
 if(a.baseImportId!==b.baseImportId||a.revision!==b.revision||a.profile.id!==b.profile.id||a.profile.role!==b.profile.role||a.profile.accessRevision!==b.profile.accessRevision)throw Error('조회 중 자료가 변경되었습니다. 다시 조회하세요.');
 // Never accept an empty placeholder for a previously loaded store.
 const records={...current.records},versions={...current.versions};
 for(const store of incoming.loadedStores){records[store]=incoming.records[store];versions[store]=incoming.versions[store];}
 return {manifest:b,records,versions,loadedStores:[...new Set([...current.loadedStores,...incoming.loadedStores])]};
}
export async function readDashboardDay(api,manifest,date){
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(date)||!manifest.profile.stores.includes('dispatch'))throw Error('배차 조회 범위·권한을 확인하세요.');
 const rows=[],seen=new Set();let after='',pages=0;
 do{
  const page=await api.page({p_store:'dispatch',p_access_revision:manifest.profile.accessRevision,p_revision:manifest.revision,p_after:after,p_limit:2000,p_from:date,p_to:date});
  if(page.revision!==manifest.revision||page.role!==manifest.profile.role||!Array.isArray(page.rows)||page.rows.length>2000||++pages>1000)throw Error('배차 조회 기준이 변경됐습니다. 다시 조회하세요.');
  for(const r of page.rows){if(!r.key||seen.has(r.key)||r.value?.id!==r.key||r.value.date!==date)throw Error('배차 조회 자료 검증 실패');seen.add(r.key);rows.push(r.value);}
  if(page.next!==null&&(typeof page.next!=='string'||!page.rows.length||page.next!==page.rows.at(-1).key||page.next===after))throw Error('배차 조회 페이지 검증 실패');
  after=page.next;
 }while(after!==null);
 const head=await api.head();
 if(head.revision!==manifest.revision||head.baseImportId!==manifest.baseImportId||head.profile.id!==manifest.profile.id||head.profile.role!==manifest.profile.role||head.profile.accessRevision!==manifest.profile.accessRevision)throw Error('조회 중 원장이 변경됐습니다. 다시 조회하세요.');
 // These rows are only for rendering. They must not enter the writable cache.
 return rows;
}
