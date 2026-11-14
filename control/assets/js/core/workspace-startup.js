import {canonical,cleanRecords,delta,overlayChanges} from './cloud-model.js';
export const SNAPSHOT_KEY='_supabaseStartupV1';
export function savedSnapshot(snapshot,nonce){return {format:1,nonce,snapshot:structuredClone(snapshot)};}
export async function resumeWorkspace({saved,profile,nonce,local,pending,api}){
 const s=saved?.snapshot;
 if(saved?.format!==1||saved.nonce!==nonce||!s?.records||!s.versions||!Array.isArray(s.loadedStores)||s.manifest?.profile?.id!==profile.id||s.manifest.profile.role!==profile.role||s.manifest.profile.accessRevision!==profile.accessRevision)return null;
 const head=await api.head();
 if(head?.profile?.id!==profile.id||head.profile.role!==profile.role||head.profile.accessRevision!==profile.accessRevision){const e=Error('계정 권한이 변경됐습니다. 다시 로그인하세요.');e.code='42501';throw e;}
 if(head.baseImportId!==s.manifest.baseImportId||!Number.isSafeInteger(head.revision)||head.revision<s.manifest.revision){if(pending||delta(s.records,local,s.loadedStores).length)throw Error('원장 기준이 변경됐습니다. 미전송 작업을 백업한 뒤 확인하세요.');return null;}
 // Preserve edits even if the browser was closed before the outgoing request existed.
 if(pending||delta(s.records,local,s.loadedStores).length)return {snapshot:s,dirty:true,mode:'pending'};
 if(head.revision===s.manifest.revision){s.manifest.writeEnabled=head.writeEnabled;return {snapshot:s,dirty:false,mode:'cache'};}
 const end=await api.manifest();
 if(end.baseImportId!==s.manifest.baseImportId||end.profile.id!==profile.id||end.profile.role!==profile.role||end.profile.accessRevision!==profile.accessRevision||end.revision<head.revision||canonical(end.profile.stores)!==canonical(s.manifest.profile.stores))throw Error('조회 중 자료·권한이 변경됐습니다. 다시 접속하세요.');
 let after=null;const changes=[],seen=new Set();
 do{const page=await api.changes({p_access_revision:profile.accessRevision,p_since:s.manifest.revision,p_revision:end.revision,p_after:after,p_limit:500});
  if(page.revision!==end.revision||page.role!==profile.role||!Array.isArray(page.rows))throw Error('변경 자료 응답을 확인하세요.');
  for(const r of page.rows){if(s.loadedStores.includes(r.store)){const k=JSON.stringify([r.store,r.key]);if(seen.has(k))throw Error('중복 변경 자료');seen.add(k);changes.push({store:r.store,key:r.key,after:r.value,revision:r.revision});}}
  if(page.next!==null&&(!page.rows.length||canonical(page.next)===canonical(after)))throw Error('변경 자료 페이지 오류');after=page.next;
 }while(after!==null);
 const check=await api.head();if(check.revision!==end.revision||check.baseImportId!==end.baseImportId||check.profile.id!==profile.id||check.profile.role!==profile.role||check.profile.accessRevision!==profile.accessRevision)throw Error('조회 중 자료가 변경됐습니다. 다시 접속하세요.');
 const records=overlayChanges(s.records,changes);for(const store of s.loadedStores)if((records[store]||[]).length!==end.counts[store])throw Error('변경 자료 건수 불일치');
 const versions=structuredClone(s.versions);for(const c of changes){versions[c.store]||={};versions[c.store][c.key]=c.revision;}
 return {snapshot:{manifest:end,records:cleanRecords(records),versions,loadedStores:s.loadedStores},dirty:false,mode:'delta'};
}
