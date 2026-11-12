import {createDispatchLedger} from './dispatch-metrics.js';

// Full records stay on the server. Use canonical IDs to select already-authorized local rows.
export function resolveDashboardLedger(rows,options,response,{date,revision}){
 if(response?.date!==date||response.revision!==revision||response.ledger?.version!==1)throw Error('대시보드와 원장의 기준이 다릅니다. 최신 자료를 다시 확인하세요.');
 const local=createDispatchLedger(rows,options),selected={};
 for(const name of ['counted','assigned','pending','excluded']){
  const ids=response.ledger[name];
  if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw Error('대시보드 집계 자료를 확인할 수 없습니다.');
  selected[name]=ids.map(id=>{const item=local.byId.get(id);if(!item)throw Error('최신 배차 자료를 다시 확인하세요.');return item.row;});
 }
 const s=response.summary,units=items=>items.reduce((sum,row)=>sum+Number(row.count),0);
 const counted=new Set(response.ledger.counted),assigned=new Set(response.ledger.assigned),pending=new Set(response.ledger.pending);
 if(!s||s.rawRecords!==rows.length||units(selected.counted)!==s.units||units(selected.assigned)!==s.assignedUnits||units(selected.pending)!==s.pendingUnits||assigned.size+pending.size!==counted.size||[...assigned,...pending].some(id=>!counted.has(id))||[...assigned].some(id=>pending.has(id))||response.ledger.excluded.some(id=>counted.has(id)))throw Error('대시보드 집계 기준을 다시 확인하세요.');
 return {...s,...selected};
}

export function createDashboardLoader(fetcher,{now=Date.now,ttl=30000,maxEntries=8}={}){
 const cache=new Map(),pending=new Map();
 return async function load({profile,nonce,date,revision}){
  const key=JSON.stringify([profile.id,profile.role,profile.accessRevision,nonce,date,revision]);
  const cached=cache.get(key);if(cached&&now()-cached.at<ttl)return structuredClone(cached.value);
  if(pending.has(key))return structuredClone(await pending.get(key));
  const request=(async()=>{
   const result=await fetcher('dashboard.summary',{date,view:'full'});
   if(result?.revision!==revision||result.date!==date||result.ledger?.version!==1)throw Error('대시보드와 최신 원장 기준이 다릅니다. 다시 연결 후 조회하세요.');
   cache.delete(key);cache.set(key,{at:now(),value:structuredClone(result)});
   while(cache.size>maxEntries)cache.delete(cache.keys().next().value);
   return result;
  })();
  pending.set(key,request);
  try{return structuredClone(await request);}finally{pending.delete(key);}
 };
}
