import {canonical,text} from './kgm-model.js';
import {fleetRows} from './shared-fleet.js';
import {loadPolicy} from './schedule.js';
import {normalizePlate} from './utils.js';
import {assignedDriver} from './dispatch-metrics.js';
const phone=v=>text(v).replace(/\D/g,'');
const names=d=>[d.name,...(d.aliases||[])].map(canonical).filter(Boolean);
const activeBooking=b=>!['completed','delivered','완료','returned','cancelled','canceled'].includes(b.status);
export function planKgmAssignments(kgm,fleet){
 if(kgm.day!==fleet.day)throw Error('가용 현황과 배차 기준일이 다릅니다. 다시 조회하세요.');
 const drivers=fleet.drivers||[],resources=kgm.resources||[],fleetList=fleetRows(fleet),plans=[],blocked=[],groups=new Map();
 const pending=(kgm.orders||[]).filter(o=>o.status==='pending'&&!o.resourceId);
 for(const order of pending){
  const raw=order.sourceDriver||order.source?.sourceDriver||'',tp=canonical(order.sourceTp||order.source?.sourceTp),p=phone(order.sourcePhone||order.source?.sourcePhone);
  const item={order,sourceDriver:raw,sourceTp:order.sourceTp||order.source?.sourceTp||'',driver:null,resource:null,vehicle:null};
  const hold=reason=>blocked.push({...item,reason});
  if(!assignedDriver({driver:raw})){hold('엑셀 기사 실명 확인 필요');continue;}
  const masters=drivers.filter(d=>names(d).includes(canonical(raw))),named=resources.filter(r=>canonical(r.driverName)===canonical(raw));
  if(masters.length>1){hold('동명이인·별칭 중복: 명부에서 확인');continue;}
  const driver=masters[0];item.driver=driver;
  if(driver&&driver.status!=='active'){hold('비활동 기사');continue;}
  if(driver&&p&&phone(driver.phone)&&p!==phone(driver.phone)){hold('엑셀·기사 명부 연락처 불일치');continue;}
  const linked=resources.filter(r=>driver&&r.masterDriverId===driver.id),candidates=[...new Map([...named,...linked].map(r=>[r.id,r])).values()];
  if(candidates.length>1){hold('KGM 기사·차량 중복: 사용할 장비 확인');continue;}
  let resource=candidates[0];item.resource=resource;
  if(resource){
   if(!resource.active){hold('KGM 명단 사용 중지');continue;}
   if(tp&&canonical(resource.tp)!==tp){hold('엑셀 TP와 등록 KGM TP 불일치');continue;}
   if(driver&&resource.masterDriverId&&resource.masterDriverId!==driver.id){hold('KGM 연결 기사 불일치');continue;}
   if(driver&&phone(driver.phone)&&phone(resource.phone)&&phone(driver.phone)!==phone(resource.phone)){hold('KGM·공통 기사 연락처 불일치');continue;}
   if(p&&phone(resource.phone)&&p!==phone(resource.phone)){hold('KGM 연락처 불일치');continue;}
   if(resource.availability!=='available'){hold('KGM 가용 상태 확인 필요');continue;}
  }else if(!driver){hold('기존 기사 명부에 일치하는 기사 없음');continue;}
  const matches=driver?fleetList.filter(r=>r.driver?.id===driver.id):fleetList.filter(r=>normalizePlate(r.equipment.plateNo)&&normalizePlate(r.equipment.plateNo)===normalizePlate(resource.vehicleNo));
  if(matches.length>1){hold('기사 연결 장비가 여러 대: 운행 장비 확인');continue;}
  const vehicle=matches[0];item.vehicle=vehicle?.equipment;
  if(driver&&!vehicle){hold('기사·운송차량 연결 필요');continue;}
  if(vehicle){
   if(driver&&vehicle.driver?.id!==driver.id){hold('차량 담당 기사 불일치');continue;}
   if(['review','unavailable','conflict'].includes(vehicle.key)){hold([...vehicle.issues,vehicle.schedule.reason].filter(Boolean).join(' · '));continue;}
   if(vehicle.bookings.some(b=>b.department!=='kgm'&&activeBooking(b))){hold('다른 운영 부서 배차 확인 필요');continue;}
   if(resource&&normalizePlate(resource.vehicleNo)!==normalizePlate(vehicle.equipment.plateNo)){hold('KGM·공통 차량번호 불일치');continue;}
  }
  if(resource&&driver&&!resource.masterDriverId){
   if(Number(resource.busy)>0){hold('진행 중 KGM 배차 완료 후 공통 기사 연결 필요');continue;}
   resource={...resource,masterDriverId:driver.id,linkMaster:true};item.resource=resource;
  }
  if(!resource){
   if(!tp||!/^[\p{L}\p{N} -]{1,30}$/u.test(item.sourceTp)){hold('KGM TP번호 확인 필요');continue;}
   if(resources.some(r=>canonical(r.tp)===tp||r.active&&normalizePlate(r.vehicleNo)===normalizePlate(vehicle.equipment.plateNo))){hold('기존 KGM TP·차량 연결 중복');continue;}
   resource={id:null,tp:item.sourceTp,driverName:driver.name,phone:driver.phone||'',vehicleNo:vehicle.equipment.plateNo,capacity:loadPolicy(driver,[vehicle.equipment]).capacity,active:true,masterDriverId:driver.id,revision:0,availability:'available',availabilityRevision:0,newResource:true};item.resource=resource;
  }
  const cap=Math.min(Number(resource.capacity)||0,vehicle?loadPolicy(driver||vehicle.driver,[vehicle.equipment]).capacity:20),maxTurns=driver?loadPolicy(driver,vehicle?[vehicle.equipment]:[]).maxTurns:3;
  if(!Number.isInteger(cap)||cap<1||cap>20){hold('회전당 적재 한도 1~20대 확인 필요');continue;}
  const key=resource.id||'master:'+driver.id;
  let group=groups.get(key);
  if(!group){group={key,resource,capacity:cap,maxTurns,items:[],slots:new Map()};for(const existing of kgm.orders.filter(o=>o.resourceId===resource.id&&['assigned','transit','completed'].includes(o.status))){const turn=Number(existing.turn),slot=group.slots.get(turn)||[];slot.push(existing);group.slots.set(turn,slot);}groups.set(key,group);}
  if(canonical(group.resource.tp)!==tp&&tp){hold('동일 기사에게 서로 다른 TP가 기재됨');continue;}
  const identity=o=>canonical(o.model)+'|'+canonical(o.chassis);let turn=0;
  for(let n=1;n<=maxTurns;n++){const slot=group.slots.get(n)||[];if(slot.length<cap&&!slot.some(o=>identity(o)===identity(order))){turn=n;slot.push(order);group.slots.set(n,slot);break;}}
  if(!turn){hold('일일 회전·적재 한도 초과: 수동 검토');continue;}
  const planned={...item,resource:group.resource,turn,reason:group.resource.newResource?'공통 기사·차량에서 KGM 명단 등록 후 배차':'등록 KGM 가용 차량에 배차'};group.items.push(planned);plans.push(planned);
 }
 // A TP cannot be silently shared by two different newly registered drivers.
 const tpGroups=new Map();for(const g of groups.values()){const k=canonical(g.resource.tp);tpGroups.set(k,[...(tpGroups.get(k)||[]),g]);}
 const duplicate=new Set([...tpGroups.values()].filter(v=>v.length>1).flatMap(v=>v.flatMap(g=>g.items)));
 return {day:kgm.day,plans:plans.filter(p=>!duplicate.has(p)),blocked:[...blocked,...[...duplicate].map(p=>({...p,reason:'동일 TP에 서로 다른 기사: 자동배차 보류'}))],pending:pending.length,skipped:kgm.orders.length-pending.length};
}

export async function executeKgmAssignments(plan,{write,onProgress=()=>{}}){
 const groups=new Map();for(const p of plan.plans){const key=p.resource.id||p.resource.masterDriverId;if(!groups.has(key))groups.set(key,{resource:{...p.resource},items:[]});groups.get(key).items.push(p);}
 let assigned=0;const completed=[];
 for(const group of groups.values()){
  const r=group.resource;
  try{
   if(r.newResource){r.id=crypto.randomUUID();await write('resource',{...r,revision:0},crypto.randomUUID());await write('availability',{id:r.id,day:plan.day,revision:0,state:'available',note:'엑셀 기사 자동매칭: 담당자가 공통 명부·차량·운행일 확인 후 승인'},crypto.randomUUID());}
   else if(r.linkMaster){await write('resource',r,crypto.randomUUID());}
   const turns=new Map();for(const p of group.items)turns.set(p.turn,[...(turns.get(p.turn)||[]),{id:p.order.id,revision:p.order.revision}]);
   for(const [turn,orders]of turns){await write('assign',{day:plan.day,resourceId:r.id,turn,orders},crypto.randomUUID());assigned+=orders.length;completed.push(...orders.map(o=>o.id));onProgress(assigned,plan.plans.length);}
  }catch(e){return {assigned,completed,error:'일부 처리 후 중단했습니다. 서버 재조회 후 남은 건을 다시 매칭하세요. '+(e.message||e)};}
 }
 return {assigned,completed,error:''};
}
