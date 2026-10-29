import {validDate} from './schedule.js';
import {transportKey} from './dispatch-identity.js';
import {norm} from './utils.js';
export const dispatchUnits=r=>{const n=Number(r.count);return Number.isInteger(n)&&n>0?n:0;};
export function dispatchStatus(r){const name=String(r.driver||'').trim();return ({취소:'cancelled',미출고:'notshipped',지원:'support'})[name]||r.status||'normal';}
export const countedDispatch=r=>!['cancelled','notshipped','support'].includes(dispatchStatus(r))&&dispatchUnits(r)>0;
export const assignedDriver=r=>{const n=norm(r.driver);return !!n&&!/^([-—–]+|0+|\?+|\.+)$/.test(n)&&!['지원','취소','미출고','회송','변경','사고','미배차','미정','대기','미입력','미상','없음','미지정','미배정','미확인','배차대기','-','unknown','n/a'].includes(n);};
const fields=['customer','model','driver','driverId','vehicleNo','driverPhone','count','turn','departTime','color','position','code','note','billed','unpaid','sourceClaim','sourceHabul','unloadName','unloadPhone','customerName','customerPhone','distanceKm','transportType','cargoClass','status'];
const signature=r=>JSON.stringify(fields.map(k=>['count','turn','billed','unpaid','distanceKm'].includes(k)&&r[k]!==''&&r[k]!=null&&Number.isFinite(Number(r[k]))?Number(r[k]):norm(r[k])));
export function createDispatchLedger(rows,{assignments=[],drivers=[]}={}){
 const masters=new Map(drivers.map(d=>[d.id,d])),plans=new Map(),byId=new Map(),groups=new Map();
 for(const p of assignments)if(p.status==='confirmed')for(const id of p.orderIds||[]){const list=plans.get(id)||[];list.push(p);plans.set(id,list);}
 for(const [i,raw]of rows.entries()){
  const matching=(plans.get(raw.id)||[]).filter(p=>p.date===raw.date),p=matching.length===1?matching[0]:null,status=dispatchStatus(raw);let row={...raw,status};
  if(p&&!['cancelled','notshipped','support'].includes(status))row={...row,driver:p.driverName||masters.get(p.driverId)?.name||'',driverId:p.driverId,vehicleNo:p.vehicleNo,turn:p.orderTurns?.[raw.id]??raw.turn,confirmedPlanId:p.id};
  if(!assignedDriver(row)&&!norm(row.driver)&&masters.has(row.driverId))row={...row,driver:masters.get(row.driverId).name};
  const identity=transportKey(raw),key=identity||'record:'+(raw.id||i),group=groups.get(key)||{key,identity,items:[]};group.items.push({raw,row,planAmbiguous:matching.length>1});groups.set(key,group);
 }
 for(const g of groups.values()){
  g.items.sort((a,b)=>String(a.raw.createdAt||a.raw.importedAt||'').localeCompare(String(b.raw.createdAt||b.raw.importedAt||''))||String(a.raw.id).localeCompare(String(b.raw.id)));g.row=g.items[0].row;g.units=dispatchUnits(g.row);
  g.reason='';g.kind='';const sigs=new Set(g.items.map(x=>signature(x.row)));
  if(g.items.some(x=>x.planAmbiguous)){g.kind='held';g.reason='확정 편성 중복 연결';}
  else if(sigs.size>1){g.kind='held';g.reason='동일 일자·VIN·구간 내용 상충';}
  else if(['cancelled','notshipped','support'].includes(g.row.status))g.kind='excluded';
  else if(!validDate(g.row.date)){g.kind='held';g.reason='운송일 확인 필요';}
  else if(!g.identity){g.kind='held';g.reason='VIN·운송 구간 확인 필요';}
  else if(!g.units){g.kind='held';g.reason='운송 대수 확인 필요';}
  else if(['사고','회송','변경'].includes(String(g.row.driver||'').trim())){g.kind='held';g.reason='기사란의 사고·회송·변경 상태 확인';}
  else if(g.row.confirmedPlanId&&!assignedDriver(g.row)){g.kind='held';g.reason='확정 편성의 기사 정보 확인';}
  else g.kind=assignedDriver(g.row)?'assigned':'pending';
  g.exactCopies=sigs.size===1&&!g.items.some(x=>x.planAmbiguous)?g.items.length-1:0;
  for(const [i,item]of g.items.entries())byId.set(item.raw.id,{row:item.row,group:g,kind:g.kind,duplicate:i>0&&g.exactCopies>0,reason:g.reason});
 }
 function summaryFor(scope){const ids=new Set(scope.map(r=>r.id)),selected=[...groups.values()].filter(g=>g.items.some(x=>ids.has(x.raw.id))),result={rawRecords:scope.length,units:0,assignedUnits:0,pendingUnits:0,manualPendingUnits:0,modifiedPendingUnits:0,heldRecords:0,excludedRecords:0,duplicateRecords:0,heldGroups:0,counted:[],assigned:[],pending:[],excluded:[],held:[]};
  for(const g of selected){const members=g.items.filter(x=>ids.has(x.raw.id));const copies=g.kind==='held'?0:Math.min(g.exactCopies,Math.max(0,members.length-1));result.duplicateRecords+=copies;if(g.kind==='held'){result.heldGroups++;result.heldRecords+=members.length;result.held.push(g);continue;}if(g.kind==='excluded'){result.excludedRecords+=members.length-copies;result.excluded.push(...members.map(x=>x.row));continue;}result.units+=g.units;result.counted.push(g.row);result[g.kind].push(g.row);result[g.kind==='assigned'?'assignedUnits':'pendingUnits']+=g.units;if(g.kind==='pending'&&g.row.manualAssignmentClearedAt)result.manualPendingUnits+=g.units;else if(g.kind==='pending'&&g.row.updatedAt&&g.row.updatedAt!==g.row.sourceAssignmentRefreshedAt)result.modifiedPendingUnits+=g.units;}
  return result;
 }
 return {byId,groups,summaryFor,summary:summaryFor(rows)};
}
