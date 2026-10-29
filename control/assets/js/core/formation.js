import * as db from './db.js';
import {uid} from './utils.js';
import {loadPolicy,equipmentFor} from './schedule.js';
import {reloadAll} from './data.js';
import {formationProblems,orderSnapshot,formationKey} from './formation-policy.js';
export function formationInput({date,driver,vehicleNo='',orders,turn,previous=null,routeReviewed=false,routeNote='',note=''}){
 return {...previous,id:previous?.id||uid('frm'),formation:true,date,driverId:driver.id,driverName:driver.name,vehicleNo:vehicleNo||previous?.vehicleNo||driver.vehicleNo||'',turn:Number(turn),orderIds:orders.map(r=>r.id),orderTurns:Object.fromEntries(orders.map(r=>[r.id,Number(turn)])),orderSnapshots:Object.fromEntries(orders.map(r=>[r.id,orderSnapshot(r)])),totalCount:orders.reduce((n,r)=>n+Number(r.count||0),0),totalTurns:1,routeReviewed,routeNote,note,status:'draft',createdAt:previous?.createdAt||new Date().toISOString(),expectedUpdatedAt:previous?.updatedAt||null};
}
export async function saveFormations(plans,{status='draft'}={}){
 if(!plans.length||!['draft','confirmed'].includes(status))throw Error('편성 내용을 확인하세요.');
 const names=['dispatch','drivers','equipment','assignments','products','closings','settlements','meta'],database=await db.openDb();
 await new Promise((resolve,reject)=>{const tx=database.transaction(names,'readwrite'),data={};let left=names.length,error;
 tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(error||tx.error||Error('편성 저장 취소'));
 for(const name of names)tx.objectStore(name).getAll().onsuccess=e=>{data[name]=e.target.result;if(--left)return;try{
   const now=new Date().toISOString(),rows=plans.map(p=>({...p,status,formation:true,updatedAt:now}));
   for(const row of rows){
    const before=data.assignments.find(p=>p.id===row.id);if((before?.updatedAt||null)!==row.expectedUpdatedAt)throw Error('다른 직원이 편성을 변경했습니다. 새로고침 후 검토하세요.');
    if(!before&&status==='draft'&&!row.routeReviewed&&!row.routeNote&&!row.note&&data.assignments.some(p=>p.formation&&p.status==='draft'&&formationKey(p)===formationKey(row)&&p.orderIds?.length===row.orderIds.length&&p.orderIds.every(id=>row.orderIds.includes(id)&&p.orderSnapshots?.[id]===row.orderSnapshots?.[id])))continue;
    if(before?.status==='confirmed'&&status!=='confirmed')throw Error('확정 편성은 초안으로 되돌릴 수 없습니다. 전체 배차 취소 메뉴에서 처리하세요.');
    const orders=data.dispatch.filter(r=>row.orderIds.includes(r.id));if(!data.drivers.some(d=>d.id===row.driverId))throw Error('등록된 기사를 선택하세요.');
    if(!row.orderIds.length||new Set(row.orderIds).size!==row.orderIds.length||orders.length!==new Set(row.orderIds).size||orders.some(r=>row.orderSnapshots[r.id]!==orderSnapshot(r)))throw Error('운송 자료가 변경되었습니다. 다시 선택하세요.');
    if(data.closings.some(c=>c.status==='closed'&&c.month===row.date.slice(0,7)))throw Error('마감된 월은 편성할 수 없습니다.');
    if(before?.status==='confirmed'&&(before.orderIds||[]).some(id=>!row.orderIds.includes(id)))throw Error('확정 편성의 운송은 여기서 제외할 수 없습니다. 배차 취소 후 재편성하세요.');
    if(status==='confirmed'){const driver=data.drivers.find(d=>d.id===row.driverId);row.capacitySnapshot=loadPolicy(driver,data.equipment).capacity;row.capacityBasis='registeredAtConfirmation';row.capacityRecordedAt=now;row.vehicleStructureSnapshot=equipmentFor(driver,data.equipment)?.structure||'';const proposed={...data,assignments:[...data.assignments.filter(p=>!rows.some(r=>r.id===p.id)),...rows]};const issues=formationProblems(row,proposed);if(issues.length)throw Error(issues.join('\n'));}
    delete row.expectedUpdatedAt;tx.objectStore('assignments').put(row);tx.objectStore('meta').put({key:uid('formationAudit'),value:{at:now,action:status==='confirmed'?'편성 확정':'편성 초안 저장',before:before||null,after:row}});
   }
 }catch(e){error=e;tx.abort();}};
 });await reloadAll();return plans.length;
}
