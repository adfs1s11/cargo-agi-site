import * as db from './db.js';
import {reloadAll,invalidateDispatch} from './data.js';
import {duplicateGroups} from './dispatch-identity.js';
export {duplicateGroups} from './dispatch-identity.js';
// Compare business values, not import fingerprints or source-specific metadata.
const MERGE_FIELDS=['customer','model','driver','vehicleNo','driverPhone','count','turn','departTime','color','position','code','note','billed','unpaid','sourceClaim','sourceHabul','unloadName','unloadPhone','customerName','customerPhone','distanceKm','transportType','cargoClass'];
const present=v=>v!==''&&v!==null&&v!==undefined;
const comparable=(field,v)=>['billed','unpaid','sourceClaim','sourceHabul','count','turn','distanceKm'].includes(field)&&Number.isFinite(Number(String(v).replaceAll(',','')))?String(Number(String(v).replaceAll(',',''))):String(v).trim();
export function planDuplicateGroup(input){
 const rows=[...input].sort((a,b)=>MERGE_FIELDS.filter(f=>present(b[f])).length-MERGE_FIELDS.filter(f=>present(a[f])).length||String(a.createdAt||a.importedAt||'').localeCompare(String(b.createdAt||b.importedAt||''))||String(a.id).localeCompare(String(b.id)));
 const conflictFields=MERGE_FIELDS.filter(f=>new Set(rows.filter(r=>present(r[f])).map(r=>comparable(f,r[f]))).size>1);
 const keeper={...rows[0]};
 if(!conflictFields.length)for(const field of MERGE_FIELDS)if(!present(keeper[field])){const donor=rows.find(r=>present(r[field]));if(donor)keeper[field]=donor[field];}
 return {rows,keeper,conflictFields,conflict:!!conflictFields.length};
}
export async function reviewDuplicates(from,to,apply=false){
 const database=await db.openDb();const out=await new Promise((resolve,reject)=>{
 const names=['dispatch','assignments','closings','settlements','meta'],tx=database.transaction(names,apply?'readwrite':'readonly'),v={};let left=names.length,result,failure;
 for(const name of names)tx.objectStore(name).getAll().onsuccess=e=>{v[name]=e.target.result;if(--left)return;try{
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(from)||!/^20\d{2}-\d{2}-\d{2}$/.test(to)||from>to)throw Error('점검 기간을 지정하세요.');
 const linked=new Set(v.assignments.flatMap(p=>p.orderIds||[])),settled=new Set(v.settlements.map(s=>s.orderId));
 const closed=new Set(v.closings.filter(c=>c.status==='closed').map(c=>c.month));
 const groups=duplicateGroups(v.dispatch,from,to).map(input=>{const group=planDuplicateGroup(input);const protectedGroup=group.rows.some(r=>linked.has(r.id)||settled.has(r.id)||closed.has(r.date.slice(0,7))||!['normal',undefined,''].includes(r.status));return {...group,protectedGroup,canArchive:!protectedGroup&&!group.conflict};});
 const archived=groups.filter(g=>g.canArchive).flatMap(g=>g.rows.slice(1));
 result={protectedGroups:groups.filter(g=>g.protectedGroup).length,conflictGroups:groups.filter(g=>!g.protectedGroup&&g.conflict).length,totalRows:v.dispatch.filter(r=>r.date>=from&&r.date<=to).length,multipleUnits:v.dispatch.filter(r=>r.date>=from&&r.date<=to&&Number(r.count)>1).length,groups,archiveCount:archived.length,archiveUnits:archived.reduce((n,r)=>n+Number(r.count||1),0),lastArchive:v.meta.filter(m=>m.key.startsWith('duplicateArchive:')&&!m.restoredAt).sort((a,b)=>b.at.localeCompare(a.at))[0]};
 if(apply&&archived.length){const at=new Date().toISOString();const keepers=groups.filter(g=>g.canArchive).map(g=>({before:g.rows[0],after:g.keeper}));tx.objectStore('meta').put({key:'duplicateArchive:'+at,at,from,to,rows:archived,keepers,reason:'동일 일자·VIN·구간 중복: 빈칸 보완 후 원본 보관'});for(const k of keepers)tx.objectStore('dispatch').put(k.after);for(const r of archived)tx.objectStore('dispatch').delete(r.id);}
 }catch(e){failure=e;tx.abort();}};
 tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure||tx.error||Error('중복 점검 실패'));tx.onerror=()=>reject(tx.error);
 });if(apply){invalidateDispatch();await reloadAll();}return out;
}
export async function restoreDuplicateArchive(key){
 const database=await db.openDb();await new Promise((resolve,reject)=>{
 const names=['dispatch','meta','closings','assignments','settlements'],tx=database.transaction(names,'readwrite'),v={};let left=names.length,failure;
 for(const name of names)tx.objectStore(name).getAll().onsuccess=e=>{v[name]=e.target.result;if(--left)return;try{
 const a=v.meta.find(m=>m.key===key);if(!a||a.restoredAt)return;
 const affected=new Set([...a.rows.map(r=>r.id),...(a.keepers||[]).map(k=>k.before.id)]);
 if(a.rows.some(r=>v.closings.some(c=>c.status==='closed'&&r.date.startsWith(c.month)))||v.assignments.some(p=>(p.orderIds||[]).some(id=>affected.has(id)))||v.settlements.some(s=>affected.has(s.orderId)))throw Error('정리 후 배정·정산·마감된 자료가 있어 복원을 보류합니다.');
 for(const k of a.keepers||[])if(JSON.stringify(v.dispatch.find(r=>r.id===k.after.id))!==JSON.stringify(k.after))throw Error('정리 후 대표 원본이 수정되어 자동 복원을 보류합니다.');
 for(const r of a.rows)tx.objectStore('dispatch').add(r);
 for(const k of a.keepers||[])tx.objectStore('dispatch').put(k.before);
 tx.objectStore('meta').put({...a,restoredAt:new Date().toISOString()});
 }catch(e){failure=e;tx.abort();}};
 tx.oncomplete=resolve;tx.onabort=()=>reject(failure||tx.error||Error('복원 실패'));tx.onerror=()=>reject(tx.error);
 });invalidateDispatch();await reloadAll();
}
