import {createDispatchLedger} from './dispatch-metrics.js';
import {normalizePlate,norm} from './utils.js';
export const OPERATING_STAGES={pending:{label:'미배차',tone:'pending'},assigned:{label:'배차 완료',tone:'assigned'},held:{label:'자료 확인',tone:'held'},excluded:{label:'운송 제외',tone:'excluded'}};
export function operatingStage(record,closing){
 const row=record?.row||{},base=OPERATING_STAGES[record?.kind]||OPERATING_STAGES.held;
 const exception={cancelled:'취소',notshipped:'미출고',support:'지원'}[row.status];
 const closed=closing?.sale&&closing?.purchase?'매출·매입 마감':closing?.sale?'매출 마감':closing?.purchase?'매입 마감':'';
 return {key:record?.kind||'held',label:exception||base.label,tone:base.tone,closed,closingTone:closed?'closed':'',detail:record?.reason|| (row.confirmedPlanId?'확정 편성 연결':''),duplicate:!!record?.duplicate};
}
// Cache only derived read views. Replacing any source array invalidates all date views.
export function createPeriodViews(){
 let refs=[],byDate=new Map(),cache=new Map(),order=new Map();
 return function get(data,from='',to='9999-12-31'){
  const next=[data.dispatch,data.assignments,data.drivers];if(next.some((v,i)=>v!==refs[i])){refs=next;byDate=new Map();order=new Map();cache.clear();for(const [index,row] of (data.dispatch||[]).entries()){order.set(row,index);const day=row.date||'';if(!byDate.has(day))byDate.set(day,[]);byDate.get(day).push(row);}}
  const key=JSON.stringify([from,to]);if(cache.has(key)){const hit=cache.get(key);cache.delete(key);cache.set(key,hit);return hit;}
  const rows=[...byDate].filter(([date])=>(!from||date>=from)&&(!to||date<=to)).flatMap(([,rows])=>rows).sort((a,b)=>order.get(a)-order.get(b));
  const assignments=(data.assignments||[]).filter(p=>(!from||p.date>=from)&&(!to||p.date<=to));
  const value={rows,assignments,ledger:createDispatchLedger(rows,{assignments,drivers:data.drivers||[]})};cache.set(key,value);if(cache.size>32)cache.delete(cache.keys().next().value);return value;
 };
}
export const periodView=createPeriodViews();
export function createFleetLinks(drivers=[],equipment=[]){
 const driverIds=new Map(drivers.map(d=>[d.id,d])),names=new Map(),plates=new Map(),vehiclesByDriver=new Map();
 for(const d of drivers)for(const name of [d.name,...d.aliases||[]]){const key=norm(name);if(key){if(!names.has(key))names.set(key,new Map());names.get(key).set(d.id,d);}}
 for(const e of equipment){const plate=normalizePlate(e.plateNo);if(plate){if(!plates.has(plate))plates.set(plate,[]);plates.get(plate).push(e);}if(e.driverId){if(!vehiclesByDriver.has(e.driverId))vehiclesByDriver.set(e.driverId,[]);vehiclesByDriver.get(e.driverId).push(e);}}
 function vehicle(e){const direct=driverIds.get(e.driverId),matches=[...(names.get(norm(e.driverName))?.values()||[])],issues=[];if(e.driverId&&!direct)issues.push('연결 기사 없음');if(matches.length>1)issues.push('동명이인 확인');if(direct&&matches.length===1&&matches[0].id!==direct.id)issues.push('기사 번호·이름 불일치');if(!direct&&e.driverName)issues.push(matches.length===1?'기사 이름만 일치 · 연결 필요':'기사 명부 확인');if(!direct&&!e.driverName)issues.push('기사 미연결');if((plates.get(normalizePlate(e.plateNo))||[]).length>1)issues.push('차량번호 중복');if(direct?.vehicleNo&&normalizePlate(direct.vehicleNo)!==normalizePlate(e.plateNo))issues.push('기사 명부 차량과 다름');return {driver:direct||null,name:direct?.name||e.driverName||'',issues};}
 function driver(d){const explicit=vehiclesByDriver.get(d.id)||[],listed=plates.get(normalizePlate(d.vehicleNo))||[],issues=[];if(listed.length>1)issues.push('차량번호 중복');if(listed.some(e=>e.driverId&&e.driverId!==d.id))issues.push('다른 기사에게 연결된 차량');if(explicit.length&&d.vehicleNo&&!explicit.some(e=>normalizePlate(e.plateNo)===normalizePlate(d.vehicleNo)))issues.push('기사·차량 명부 불일치');if(!explicit.length&&!listed.length)issues.push(d.vehicleNo?'차량 원장 미등록':'차량 미연결');return {vehicles:explicit.length?explicit:listed,issues};}
 function dispatch(r){const d=driverIds.get(r.driverId),matches=[...(names.get(norm(r.driver))?.values()||[])],vehicles=plates.get(normalizePlate(r.vehicleNo))||[],issues=[];if(r.driverId&&!d)issues.push('기사 연결 확인');if(matches.length>1||d&&matches.length===1&&matches[0].id!==d.id)issues.push('기사 식별 불일치');if(r.vehicleNo&&!vehicles.length)issues.push('차량 원장 미등록');if(vehicles.length>1)issues.push('차량번호 중복');if(d&&vehicles.length===1&&vehicles[0].driverId&&vehicles[0].driverId!==d.id)issues.push('차량 담당 기사와 다름');return {issues,driver:d||matches.length===1&&matches[0]||null,vehicle:vehicles.length===1?vehicles[0]:null};}
 return {vehicle,driver,dispatch};
}
