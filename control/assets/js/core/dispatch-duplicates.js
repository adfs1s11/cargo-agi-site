import * as db from './db.js';
import {reloadAll,invalidateDispatch} from './data.js';
import {duplicateGroups} from './dispatch-identity.js';
export {duplicateGroups} from './dispatch-identity.js';
export async function reviewDuplicates(from,to,apply=false){
 const database=await db.openDb();const out=await new Promise((resolve,reject)=>{
 const names=['dispatch','assignments','closings','settlements','meta'],tx=database.transaction(names,apply?'readwrite':'readonly'),v={};let left=names.length,result,failure;
 for(const name of names)tx.objectStore(name).getAll().onsuccess=e=>{v[name]=e.target.result;if(--left)return;try{
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(from)||!/^20\d{2}-\d{2}-\d{2}$/.test(to)||from>to)throw Error('점검 기간을 지정하세요.');
 const linked=new Set(v.assignments.flatMap(p=>p.orderIds||[])),settled=new Set(v.settlements.map(s=>s.orderId));
 const closed=new Set(v.closings.filter(c=>c.status==='closed').map(c=>c.month));
 const groups=duplicateGroups(v.dispatch,from,to).map(rows=>{rows.sort((a,b)=>String(a.createdAt||a.importedAt||'').localeCompare(String(b.createdAt||b.importedAt||''))||String(a.id).localeCompare(String(b.id)));const protectedGroup=rows.some(r=>linked.has(r.id)||settled.has(r.id)||closed.has(r.date.slice(0,7))||!['normal',undefined,''].includes(r.status));const signature=r=>JSON.stringify([r.driver||'',r.vehicleNo||'',Number(r.count||1),Number(r.billed||0),Number(r.unpaid||0),r.model||'',r.customer||'',r.sourceClaim||'',r.sourceHabul||'',r.sourceAmounts||null,r.note||'',r.departTime||'',r.code||'',r.driverPhone||'']);const conflict=new Set(rows.map(signature)).size>1;return {rows,protectedGroup,conflict,canArchive:!protectedGroup&&!conflict};});
 const archived=groups.filter(g=>g.canArchive).flatMap(g=>g.rows.slice(1));
 result={totalRows:v.dispatch.filter(r=>r.date>=from&&r.date<=to).length,multipleUnits:v.dispatch.filter(r=>r.date>=from&&r.date<=to&&Number(r.count)>1).length,groups,archiveCount:archived.length,archiveUnits:archived.reduce((n,r)=>n+Number(r.count||1),0),lastArchive:v.meta.filter(m=>m.key.startsWith('duplicateArchive:')&&!m.restoredAt).sort((a,b)=>b.at.localeCompare(a.at))[0]};
 if(apply&&archived.length){const at=new Date().toISOString();tx.objectStore('meta').put({key:'duplicateArchive:'+at,at,from,to,rows:archived,reason:'동일 일자·VIN·출발지·도착지 및 주요 운송 내용 일치'});for(const r of archived)tx.objectStore('dispatch').delete(r.id);}
 }catch(e){failure=e;tx.abort();}};
 tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure||tx.error||Error('중복 점검 실패'));tx.onerror=()=>reject(tx.error);
 });if(apply){invalidateDispatch();await reloadAll();}return out;
}
export async function restoreDuplicateArchive(key){const database=await db.openDb();await new Promise((resolve,reject)=>{const tx=database.transaction(['dispatch','meta','closings'],'readwrite');let failure;tx.objectStore('closings').getAll().onsuccess=e=>{const closed=e.target.result;tx.objectStore('meta').get(key).onsuccess=e=>{const a=e.target.result;if(!a||a.restoredAt)return;if(a.rows.some(r=>closed.some(c=>c.status==='closed'&&r.date.startsWith(c.month)))){failure=Error('마감된 월은 복원할 수 없습니다.');tx.abort();return;}for(const r of a.rows)tx.objectStore('dispatch').add(r);tx.objectStore('meta').put({...a,restoredAt:new Date().toISOString()});};};tx.oncomplete=resolve;tx.onabort=()=>reject(failure||tx.error||Error('복원 실패'));tx.onerror=()=>reject(tx.error);});invalidateDispatch();await reloadAll();}
