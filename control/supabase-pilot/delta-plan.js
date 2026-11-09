import {STORES,canonical,sha} from './migration-core.js';

// Compare hashes, never download the complete private snapshot a second time.
// The resulting patch is validated against ALL target store fingerprints.
export async function planDelta(core,base,readPage,progress=()=>{}){
 if(!core?.header||!base?.id||base.revision>=core.header.revision)throw Error('변경분의 원본 버전을 확인하세요.');
 const names=base.stores?.map(e=>e.store);
 if(names?.length!==STORES.length||new Set(names).size!==STORES.length||STORES.some(s=>!names.includes(s)))throw Error('기존 원장 목록이 불완전합니다.');
 const changes=[];
 for(const store of STORES){
  const spec=base.stores.find(s=>s.store===store),wanted=core.stores[store],old=new Map();let after='';
  if(!(wanted instanceof Map))throw Error('최신 원장 확인이 필요합니다.');
  do{
   const page=await readPage({p_id:base.id,p_store:store,p_after:after,p_limit:500});
   if(page.snapshotId!==base.id||!Array.isArray(page.rows)||page.rows.length>500)throw Error('기존 원장 응답 오류');
   for(const row of page.rows){if(typeof row.key!=='string'||!row.key||old.has(row.key)||!/^[a-f0-9]{64}$/.test(row.hash||''))throw Error('기존 원장 중복 또는 해시 오류');old.set(row.key,row.hash);}
   if(page.next!==null&&(!page.rows.length||page.next!==page.rows.at(-1).key||page.next===after))throw Error('원장 페이지 연결 오류');
   after=page.next;
  }while(after!==null);
  const pairs=[...old].sort(([a],[b])=>a<b?-1:a>b?1:0);
  if(old.size!==spec.records||await sha(canonical(pairs))!==spec.fingerprint)throw Error('기존 원장 전체 대조 실패: '+store);
  for(const [key,row] of wanted){
   if(row.key!==key||await sha(row.text)!==row.hash)throw Error('최신 원장 해시 오류');
   if(old.get(key)!==row.hash)changes.push({store,key,hash:row.hash,text:row.text});
  }
  for(const key of old.keys())if(!wanted.has(key))changes.push({store,key,hash:null,text:null});
  const target=core.header.expected.find(e=>e.store===store);
  const current=[...wanted].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,row])=>[key,row.hash]);
  if(!target||target.records!==wanted.size||target.fingerprint!==await sha(canonical(current)))throw Error('최신 원장 전체 대조 실패: '+store);
  progress(`${store} 대조 완료 · 변경 ${changes.length.toLocaleString()}건`);
 }
 return {baseId:base.id,revision:core.header.revision,fingerprint:core.header.archiveSha256,expected:core.header.expected,changes};
}
