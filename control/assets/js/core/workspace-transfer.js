// Transport independent. The UI installs a snapshot only after every page and
// the final manifest match; partial downloads must never replace the live cache.
const keyField=store=>['meta','settings'].includes(store)?'key':'id';
export async function readWorkspace(api,{progress=()=>{},signal}={}){
 const start=await api.manifest();
 if(start.provider!=='supabase'||start.protocol!==1||!start.profile?.id||!Array.isArray(start.profile.stores))throw Error('운영 원장 응답 형식 오류');
 const records={},versions={};
 for(const store of start.profile.stores){
  const expected=start.counts[store];
  if(!Number.isSafeInteger(expected)||expected<0)throw Error('원장 건수 확인 필요');
  const rows=[],revs={},seen=new Set();let after='';
  do{
   signal?.throwIfAborted();
   const page=await api.page({p_store:store,p_access_revision:start.profile.accessRevision,p_revision:start.revision,p_after:after,p_limit:500});
   if(page.revision!==start.revision||page.role!==start.profile.role||!Array.isArray(page.rows)||page.rows.length>500)throw Error('조회 중 자료·권한이 변경됐습니다');
   let last=after;
   for(const row of page.rows){
    // Do not impose JavaScript ordering on PostgreSQL's locale-aware collation.
    if(typeof row.key!=='string'||!row.key||seen.has(row.key)||String(row.value?.[keyField(store)])!==row.key||!Number.isSafeInteger(row.revision)||row.revision<0)throw Error('중복 또는 잘못된 조회 행');
    seen.add(row.key);rows.push(row.value);revs[row.key]=row.revision;last=row.key;
   }
   if(page.next!==null&&(typeof page.next!=='string'||!page.rows.length||page.next!==last||page.next===after))throw Error('페이지 연결 오류');
   after=page.next;progress({store,loaded:rows.length,total:expected});
   if(rows.length>expected)throw Error('조회 건수가 원장과 다릅니다');
  }while(after!==null);
  if(rows.length!==expected)throw Error('조회 누락: '+store);
  records[store]=rows;versions[store]=revs;
 }
 const end=await api.manifest();
 if(end.baseImportId!==start.baseImportId||end.revision!==start.revision||end.profile.id!==start.profile.id||end.profile.accessRevision!==start.profile.accessRevision||end.profile.role!==start.profile.role)throw Error('조회 중 자료·권한이 변경됐습니다. 다시 조회하세요');
 return {manifest:end,records,versions};
}

// Batch boundaries are explicit. Persist the immutable request before send;
// on ambiguous failure retry that same mutation, never make a new identifier.
export function partitionChanges(changes,{maxRows=250,maxBytes=750000}={}){
 if(!Number.isInteger(maxRows)||maxRows<1||maxRows>500||!Number.isInteger(maxBytes)||maxBytes<256||maxBytes>900000)throw Error('분할 기준 오류');
 const chunks=[];let chunk=[],bytes=2;const seen=new Set();
 for(const change of changes){
  const id=JSON.stringify([change.store,change.key]);if(seen.has(id))throw Error('중복 저장 대상');seen.add(id);
  const size=new TextEncoder().encode(JSON.stringify(change)).length+1;
  if(size+2>maxBytes)throw Error('단일 자료가 너무 큽니다. 사진은 파일 저장소로 분리하세요');
  if(chunk.length&&(chunk.length>=maxRows||bytes+size>maxBytes)){chunks.push(chunk);chunk=[];bytes=2;}
  chunk.push(change);bytes+=size;
 }
 if(chunk.length)chunks.push(chunk);return chunks;
}
