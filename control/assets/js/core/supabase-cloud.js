import * as db from './db.js';
import {workspaceRpc,workspaceWrite,workspaceSession,workspaceProfile} from './supabase-session.js';
import {cacheScope} from './workspace-access.js';
import {readWorkspace,partitionChanges} from './workspace-transfer.js';
import {cleanRecords,delta,canonical,overlayChanges} from './cloud-model.js';
import {reloadAll} from './data.js';
import {esc,downloadJson} from './utils.js';
let snapshot=null,busy=false,dirty=false,refresh=()=>{},timer,writeEpoch=0,unsubscribe;
export const hasPendingSupabase=()=>dirty||busy;
const api={manifest:()=>workspaceRpc('tms_workspace_manifest'),page:args=>workspaceRpc('tms_workspace_page',args)};
function status(message,error=false){
 let el=document.getElementById('supabase-workspace-status');
 if(!el){el=document.createElement('div');el.id='supabase-workspace-status';el.setAttribute('role','status');el.style.cssText='position:sticky;top:0;z-index:45;padding:12px 20px;background:#eef5ff;border-bottom:1px solid #bfd0e5';document.body.prepend(el);}
 el.innerHTML=`<b>Supabase 운영 원장</b> · ${esc(message)} <button id="sb-save-retry" class="btn btn-xs">저장 확인</button> <button id="sb-work-backup" class="btn btn-xs">작업 백업</button>`;
 el.style.background=error?'#fff0ed':'#eef5ff';
 el.querySelector('#sb-save-retry').onclick=flushSupabase;
 el.querySelector('#sb-work-backup').onclick=async()=>downloadJson(await db.exportAll(),'M&M_개인작업_복구백업.json');
}
async function writeCache(records){
 const database=await db.openDb();
 const settings=await db.getAll('settings');
 const local=settings.filter(r=>r.key!=='settings'&&r.key!=='_supabaseOutgoing');
 const google=settings.find(r=>r.key==='settings')?.value?.google;
 const next=structuredClone(records);next.settings=[...(next.settings||[]),...local];
 if(google){let row=next.settings.find(r=>r.key==='settings');if(!row){row={key:'settings',value:{}};next.settings.push(row);}row.value={...row.value,google};}
 await new Promise((resolve,reject)=>{const tx=db.quietTransaction(database,Object.keys(db.STORES),'readwrite');for(const store of Object.keys(db.STORES)){const target=tx.objectStore(store);target.clear();for(const row of next[store]||[])target.put(row);}tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('조회 자료 저장 취소'));tx.onerror=()=>reject(tx.error);});
}
async function localQueue(value){const database=await db.openDb();return new Promise((resolve,reject)=>{const tx=db.quietTransaction(database,['settings'],'readwrite');tx.objectStore('settings').put({key:'_supabaseOutgoing',value});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('저장 요청 보관 실패'));});}
export async function bootSupabase(view){
 clearTimeout(timer);unsubscribe?.();dirty=false;busy=false;writeEpoch=0;
 const profile=workspaceProfile();await db.selectWorkspaceCache(cacheScope(profile,workspaceSession().nonce));
 const pending=await db.getSetting('_supabaseOutgoing');
 snapshot=await readWorkspace(api,{progress:p=>{view.textContent=`Supabase 자료 확인 · ${p.store} ${p.loaded.toLocaleString()} / ${p.total.toLocaleString()}건`;}});
 await writeCache(pending?overlayChanges(snapshot.records,pending.changes):snapshot.records);
 if(pending){await localQueue(pending);dirty=true;}
 status(pending?'이전 작업의 서버 저장 결과를 확인합니다.':`연결 확인 · ${snapshot.manifest.revision}차 · ${profile.name}`);return true;
}
async function readLocal(){const data=await db.exportAll();return cleanRecords(data.data);}
function commandChanges(changes){return changes.map(c=>{
 const version=snapshot.versions[c.store]?.[c.key]??0;
 if(c.after===null)return {store:c.store,key:c.key,revision:version,delete:true};
 const key=['meta','settings'].includes(c.store)?'key':'id',patch={};
 for(const field of new Set([...Object.keys(c.before||{}),...Object.keys(c.after)]))if(field!==key&&canonical(c.before?.[field])!==canonical(c.after[field]))patch[field]=c.after[field]??null;
 return {store:c.store,key:c.key,revision:version,patch};
});}
export async function flushSupabase(){
 if(busy||!snapshot||!dirty)return;
 busy=true;document.getElementById('app')?.setAttribute('inert','');
 const epoch=writeEpoch;
 try{
  if(!snapshot.manifest.writeEnabled)throw Error('운영 저장 활성화 전입니다.');
  let queue=await db.getSetting('_supabaseOutgoing');
  if(!queue){
   const captured=await readLocal(),changes=delta(snapshot.records,captured,snapshot.manifest.profile.stores);
   if(!changes.length){dirty=false;return;}
   const prepared=commandChanges(changes),chunks=partitionChanges(prepared);
   if(chunks.length>1&&changes.some(c=>c.store==='assignments'))throw Error('편성과 관련 운송은 한 번에 저장해야 합니다. 선택 범위를 줄이세요.');
   queue={chunks,cursor:0,captured,changes,command:null};await localQueue(queue);
  }
  while(queue.cursor<queue.chunks.length){
   if(!queue.command){queue.command={mutationId:crypto.randomUUID(),revision:snapshot.manifest.revision,accessRevision:snapshot.manifest.profile.accessRevision,changes:queue.chunks[queue.cursor]};await localQueue(queue);}
   status(`서버 저장 확인 중 · ${queue.cursor+1} / ${queue.chunks.length}묶음`);
   const receipt=await workspaceWrite(queue.command);
   if(!Number.isSafeInteger(receipt.revision)||receipt.records!==queue.command.changes.length)throw Error('저장 결과 확인이 필요합니다.');
   for(const c of queue.command.changes){snapshot.versions[c.store]||={};snapshot.versions[c.store][c.key]=receipt.revision;}
   snapshot.manifest.revision=receipt.revision;queue.cursor++;queue.command=null;await localQueue(queue);
  }
  snapshot.records=overlayChanges(snapshot.records,queue.changes);await localQueue(null);dirty=writeEpoch!==epoch;
  status(dirty?'추가 변경 저장 대기':`서버 저장 완료 · ${snapshot.manifest.revision}차`);
  if(dirty){clearTimeout(timer);timer=setTimeout(flushSupabase,0);}
 }catch(e){dirty=true;status(`${e.message} · 작업은 이 브라우저에 보관 중입니다.`,true);}
 finally{busy=false;document.getElementById('app')?.removeAttribute('inert');}
}
export function supabaseReviewBasis(){if(!snapshot||dirty||busy)throw Error('서버 저장 확인 후 평가하세요.');return {provider:'supabase',baseImportId:snapshot.manifest.baseImportId,revision:snapshot.manifest.revision};}
async function poll(){
 if(busy||dirty||document.querySelector('.modal,.drawer')||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
 busy=true;
 try{
  const end=await api.manifest();
  if(end.profile.id!==snapshot.manifest.profile.id||end.profile.accessRevision!==snapshot.manifest.profile.accessRevision){document.getElementById('app')?.setAttribute('inert','');throw Error('계정 권한이 변경됐습니다. 다시 로그인하세요.');}
  if(end.revision===snapshot.manifest.revision)return;
  let after=null;const changes=[];
  do{const page=await workspaceRpc('tms_workspace_changes',{p_access_revision:end.profile.accessRevision,p_since:snapshot.manifest.revision,p_revision:end.revision,p_after:after,p_limit:500});if(page.revision!==end.revision||page.role!==end.profile.role)throw Error('변경 자료 확인 필요');for(const r of page.rows)changes.push({store:r.store,key:r.key,after:r.value,revision:r.revision});after=page.next;}while(after);
  if(dirty)return;
  const records=overlayChanges(snapshot.records,changes);
  for(const store of end.profile.stores)if((records[store]||[]).length!==end.counts[store])throw Error('변경 자료 건수 불일치');
  await writeCache(records);snapshot.records=records;snapshot.manifest=end;
  for(const c of changes){snapshot.versions[c.store]||={};snapshot.versions[c.store][c.key]=c.revision;}
  await reloadAll();refresh();status(`최신 자료 확인 · ${end.revision}차`);
 }catch(e){status(e.message,true);if(e.code==='42501'||e.status===401||e.status===403)document.getElementById('app')?.setAttribute('inert','');}
 finally{busy=false;}
}
export async function reloadSupabase(){
 await flushSupabase();
 if(dirty||busy){status('전송 대기 작업을 먼저 저장 확인하세요. 작업 백업도 가능합니다.',true);return;}
 return poll();
}
export function startSupabase(onRefresh){
 refresh=onRefresh;
 unsubscribe?.();unsubscribe=db.onWrite(stores=>{if(!stores.some(s=>snapshot.manifest.profile.stores.includes(s)))return;writeEpoch++;dirty=true;status('서버 저장 대기 · 완료 안내 전까지 창을 닫지 마세요.');clearTimeout(timer);timer=setTimeout(flushSupabase,1200);});
 window.addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}});
 setInterval(poll,30000);
 if(dirty)flushSupabase();
}
