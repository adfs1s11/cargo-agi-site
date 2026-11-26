import {norm,normalizePlate} from './utils.js';
import {providerOnly,carrierAssigned} from './dispatch-metrics.js';
import {validDriverName} from './driver-master.js';
import {validDate} from './schedule.js';
import {transportKey} from './dispatch-identity.js';

const excludedStatus=r=>['cancelled','notshipped','support'].includes(r.status);
const missingName=v=>!validDriverName(v);
export function performanceResolver(drivers=[]){
 const byId=new Map(drivers.map(d=>[d.id,d])),names=new Map();
 for(const d of drivers)for(const value of [d.name,...d.aliases||[]]){if(missingName(value))continue;const key=norm(value);const set=names.get(key)||new Map();set.set(d.id,d);names.set(key,set);}
 return row=>{if(providerOnly(row))return {key:'',name:''};const direct=byId.get(row.driverId),matches=[...(names.get(norm(row.driver))?.values()||[])];if(direct){if(row.driver&&![direct.name,...direct.aliases||[]].map(norm).includes(norm(row.driver)))return {ambiguous:true,name:String(row.driver||''),key:''};return {key:direct.id,name:direct.name,master:direct};}if(matches.length>1)return {ambiguous:true,name:String(row.driver||''),key:''};const master=matches[0];if(master)return {key:master.id,name:master.name,master};if(missingName(row.driver))return {key:'',name:''};return {key:'name:'+norm(row.driver),name:String(row.driver).trim(),master:null};};
}
export function deliveryStops(orders){
 const stops=new Set();let missing=0;
 for(const row of orders){const name=norm(String(row.destination??'').normalize('NFC'));if(!name||['-','미정','미입력','미확인','없음','unknown','n/a'].includes(name))missing++;else stops.add(name);}
 return {count:stops.size,missing};
}
export function stopSummary(orders){
 const {count,missing}=deliveryStops(orders);
 if(missing)return '하차지 '+count+'곳 확인 · 미확인 '+missing+'건';
 return count?'하차 '+count+'곳 · 추가 하차 '+(count-1)+'곳':'하차지 미선택';
}
export function performanceTripKey(row,owner){const turn=Number(row.turn),plate=normalizePlate(row.vehicleNo);return owner.key&&plate&&Number.isInteger(turn)&&turn>0&&validDate(row.date)?JSON.stringify([row.date,owner.key,norm(plate),turn]):'';}
export function mergePerformanceRows(data,{from='',to='9999-12-31',includeHistory=false}={}){
 const resolve=performanceResolver(data.drivers),overlay=new Map(),ambiguous=new Set(),entries=new Map(),invalid=[],quality={missingIdentity:0,overlap:0,duplicates:0,conflictingDuplicates:0,invalidDates:0,ambiguousAssignments:0};
 for(const p of data.assignments||[])if(p.status==='confirmed')for(const id of p.orderIds||[]){if(overlay.has(id))ambiguous.add(id);overlay.set(id,p);}
 const inRange=r=>{if(!validDate(r.date)){quality.invalidDates++;return false;}return (!from||r.date>=from)&&r.date<=to;};
 const signature=r=>JSON.stringify([resolve(r).key||norm(r.driver),Number(r.count),Number(r.turn)||'',norm(normalizePlate(r.vehicleNo)),norm(r.model),norm(r.customer),r.status||'normal']);
 const add=(r,source,index)=>{if(!inRange(r))return;const key=transportKey(r);if(!key){quality.missingIdentity++;invalid.push({row:r,source,reason:'운송일·VIN·구간 식별 정보 확인 필요'});return;}const sig=signature(r),old=entries.get(key);if(old){if(source==='history'&&old.source==='operational'){quality.overlap++;return;}if(old.signature===sig)quality.duplicates++;else{old.conflict=true;old.alternatives=old.alternatives||[old.row];old.alternatives.push(r);quality.conflictingDuplicates++;}return;}entries.set(key,{row:r,source,signature:sig,conflict:ambiguous.has(r.id)});};
 (data.dispatch||[]).forEach((raw,i)=>{const p=overlay.get(raw.id),r=p&&p.date===raw.date?{...raw,driverId:p.driverId,driver:p.driverName,vehicleNo:p.vehicleNo,turn:p.orderTurns?.[raw.id]??raw.turn,performancePlanId:p.id}:raw;if(ambiguous.has(raw.id))quality.ambiguousAssignments++;add(r,'operational',i);});
 if(includeHistory)(data.transportHistory||[]).forEach((r,i)=>add(r,'history',i));
 const rows=[],sources=new Map(),held=[...invalid];for(const entry of entries.values()){if(entry.conflict){held.push(entry);continue;}rows.push(entry.row);sources.set(entry.row,entry.source);}
 return {rows,sources,held,quality,resolve};
}
export function summarizePerformance(data,options={}){
 const merged=mergePerformanceRows(data,options),byDriver=new Map(),groups=new Map(),byOrder=new Map();
 const workload={knownStopTrips:0,multiStopTrips:0,extraStops:0,unknownStopTrips:0};
 const total={...workload,units:0,records:0,assignedUnits:0,unassignedUnits:0,tripCount:0,tripUnits:0,unclassifiedRecords:0,unclassifiedUnits:0,invalidQuantities:0,ambiguousDrivers:0,mixedOriginTrips:0,recordedCapacityTrips:0,capacitySum:0,capacityUnits:0,sourceHistoryRecords:0,legacyTurnRecords:0};
 const ensure=owner=>{if(!byDriver.has(owner.key))byDriver.set(owner.key,{...workload,key:owner.key,name:owner.name,master:owner.master,units:0,records:0,days:new Set(),tripCount:0,tripUnits:0,unclassifiedRecords:0,unclassifiedUnits:0,recordedCapacityTrips:0,capacitySum:0,capacityUnits:0,groups:[]});return byDriver.get(owner.key);};
 for(const row of merged.rows){if(excludedStatus(row))continue;const count=Number(row.count);if(!Number.isInteger(count)||count<1){total.invalidQuantities++;continue;}total.units+=count;total.records++;if(Number(row.turn)===1&&!row.turnBasis&&row.sourceRecordType!=='googleSheet'&&!row.performancePlanId)total.legacyTurnRecords++;if(merged.sources.get(row)==='history')total.sourceHistoryRecords++;
  if(carrierAssigned(row)){total.assignedUnits+=count;total.unclassifiedUnits+=count;total.unclassifiedRecords++;continue;}
  const owner=merged.resolve(row);if(owner.ambiguous){total.ambiguousDrivers++;total.unclassifiedRecords++;total.unclassifiedUnits+=count;continue;}if(!owner.key){total.unassignedUnits+=count;continue;}
  total.assignedUnits+=count;const d=ensure(owner);d.units+=count;d.records++;d.days.add(row.date);const key=performanceTripKey(row,owner);
  if(!key){d.unclassifiedRecords++;d.unclassifiedUnits+=count;total.unclassifiedRecords++;total.unclassifiedUnits+=count;continue;}
  if(!groups.has(key))groups.set(key,{key,date:row.date,driverId:owner.master?.id||'',driverName:owner.name,ownerKey:owner.key,vehicleNo:normalizePlate(row.vehicleNo),turn:Number(row.turn),orders:[],units:0,origins:new Set(),destinations:new Set(),sourceHistory:false});const g=groups.get(key);g.orders.push(row);g.units+=count;g.origins.add(norm(row.origin));g.destinations.add(norm(row.destination));if(merged.sources.get(row)==='history')g.sourceHistory=true;if(row.id)byOrder.set(row.id,g);
 }
 const plans=new Map((data.assignments||[]).filter(p=>p.formation&&p.status==='confirmed').map(p=>[JSON.stringify([p.date,p.driverId,norm(normalizePlate(p.vehicleNo)),Number(p.turn)]),p]));
 for(const g of groups.values()){const d=byDriver.get(g.ownerKey);d.tripCount++;d.tripUnits+=g.units;d.groups.push(g);total.tripCount++;total.tripUnits+=g.units;if(g.origins.size>1)total.mixedOriginTrips++;
  const stops=deliveryStops(g.orders);
  for(const summary of [d,total]){
   if(stops.missing){summary.unknownStopTrips++;continue;}
   summary.knownStopTrips++;
   if(stops.count>1){summary.multiStopTrips++;summary.extraStops+=stops.count-1;}
  }
  const p=plans.get(g.key),capacity=Number(p?.capacitySnapshot);g.planId=p?.id||'';g.confirmed=!!p;g.capacity=null;g.utilization=null;
  // Historical capacity is never inferred from today's vehicle master or a reference copy.
  if(p&&!g.sourceHistory&&p.capacityBasis==='registeredAtConfirmation'&&Number.isInteger(capacity)&&capacity>0&&capacity<=50&&p.orderIds?.length===g.orders.length&&g.orders.every(r=>p.orderIds.includes(r.id))){g.capacity=capacity;g.utilization=Math.round(g.units/capacity*1000)/10;d.recordedCapacityTrips++;d.capacitySum+=capacity;d.capacityUnits+=g.units;total.recordedCapacityTrips++;total.capacitySum+=capacity;total.capacityUnits+=g.units;}
 }
 for(const d of byDriver.values()){d.days=d.days.size;d.avgPerTrip=d.tripCount?Math.round(d.tripUnits/d.tripCount*100)/100:null;d.coverage=d.units?Math.round(d.tripUnits/d.units*1000)/10:0;d.utilization=d.capacitySum?Math.round(d.capacityUnits/d.capacitySum*1000)/10:null;}
 total.avgPerTrip=total.tripCount?Math.round(total.tripUnits/total.tripCount*100)/100:null;total.coverage=total.assignedUnits?Math.round(total.tripUnits/total.assignedUnits*1000)/10:0;total.utilization=total.capacitySum?Math.round(total.capacityUnits/total.capacitySum*1000)/10:null;
 return {...merged,total,byDriver,groups:[...groups.values()],byOrder};
}
