import {STORES,canonical,sha,checkManifest,auditPage} from './migration-core.js';
export async function reconcileResume(plan,call,progress=()=>{}){
 if(!plan.header.resumeOnly)throw Error('검증된 이어받기 파일이 필요합니다.');
 const previous=checkManifest(plan.header.manifest),start=checkManifest(await call('cloud.snapshot'));
 if(start.revision<previous.revision)throw Error('원본 버전이 이전보다 과거입니다.');
 const stores=Object.fromEntries(STORES.map(s=>[s,new Map(plan.stores[s])]));
 for(const store of STORES){
  if(start.ends[store]<previous.ends[store])throw Error('원본 변경 이력이 줄었습니다: '+store);
  let cursor=previous.ends[store]+1;
  while(cursor<=start.ends[store]){
   progress(`${store} 변경분 ${cursor-previous.ends[store]} / ${start.ends[store]-previous.ends[store]} 확인`);
   const page=await call('cloud.page',{store,start:cursor,until:start.ends[store],limit:100});
   if(!Array.isArray(page.entries)||page.entries.length!==Math.min(100,start.ends[store]-cursor+1))throw Error('변경 행 누락');
   await auditPage(store,page.entries,new Map());
   for(const e of page.entries){if(e.deleted)stores[store].delete(String(e.key));else stores[store].set(String(e.key),{key:String(e.key),hash:e.hash,text:canonical(e.value)});}
   cursor+=page.entries.length;if(page.next!==(cursor<=start.ends[store]?cursor:null))throw Error('변경 행 연결 불일치');
  }
  if(stores[store].size!==start.counts[store])throw Error(store+' 최신 건수 불일치');
 }
 const end=checkManifest(await call('cloud.status'));
 if(canonical(start)!==canonical(end))throw Error('대조 중 원본이 변경됐습니다. 다시 대조하세요.');
 const expected=[];for(const store of STORES){const pairs=[...stores[store]].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,v.hash]);expected.push({store,records:stores[store].size,fingerprint:await sha(canonical(pairs))});}
 const archiveSha256=await sha(canonical({format:'mmt-reconciled-snapshot-1',sourceArchive:plan.header.archiveSha256,manifest:start,expected}));
 return {header:{format:'mmt-private-import-1',revision:start.revision,archiveSha256,expected},stores,count:expected.reduce((n,e)=>n+e.records,0),manifest:start};
}
