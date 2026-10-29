import {norm} from './utils.js';
import {transportKey} from './dispatch-identity.js';
import {availabilityOn,equipmentFor,loadPolicy,effectiveOrders,allocateTurn} from './schedule.js';
import {classifyOrder,compatible} from './dispatch-profile.js';

export const formationKey=p=>JSON.stringify([p.date,p.driverId,norm(p.vehicleNo),Number(p.turn)]);
export function orderSnapshot(r){return JSON.stringify(['id','date','vin','brand','model','note','customer','origin','destination','count','driver','driverId','vehicleNo','turn','departTime','status','transportType','requiredEquipment','weightKg','cargoClass'].map(k=>r[k]??''));}
export function resolveFormationDriver(row,drivers){
  if(row.driverId){const exact=drivers.find(d=>d.id===row.driverId);if(exact)return exact;}
  const name=norm(row.driver);if(!name)return null;
  const matches=drivers.filter(d=>norm(d.name)===name||(d.aliases||[]).some(a=>norm(a)===name));return matches.length===1?matches[0]:null;
}
export function formationGroups(date,data){
 const groups=new Map(),unassigned=[],unknown=[];
 for(const row of effectiveOrders(date,data.dispatch,data.assignments)){
  if(!row.driver&&!row.driverId){unassigned.push(row);continue;}
  const driver=resolveFormationDriver(row,data.drivers),vehicleNo=row.vehicleNo||driver?.vehicleNo||equipmentFor(driver||{},data.equipment)?.plateNo||'',turn=Number(row.turn);
  if(!driver||!vehicleNo||!Number.isInteger(turn)||turn<1){unknown.push(row);continue;}
  const key=formationKey({date,driverId:driver.id,vehicleNo,turn});if(!groups.has(key))groups.set(key,{key,date,driverId:driver.id,driverName:driver.name,vehicleNo,turn,orders:[]});groups.get(key).orders.push(row);
 }
 return {groups:[...groups.values()].map(g=>({...g,count:g.orders.reduce((n,r)=>n+(Number.isInteger(Number(r.count))?Number(r.count):0),0),capacity:loadPolicy(data.drivers.find(d=>d.id===g.driverId),data.equipment).capacity,origins:[...new Set(g.orders.map(r=>r.origin))],destinations:[...new Set(g.orders.map(r=>r.destination))]})).sort((a,b)=>a.driverName.localeCompare(b.driverName,'ko')||a.turn-b.turn),unassigned,unknown};
}
export function formationProblems(plan,data){
 const issues=[],driver=data.drivers.find(d=>d.id===plan.driverId),ids=plan.orderIds||[],idSet=new Set(ids),orders=data.dispatch.filter(r=>idSet.has(r.id));
 if(!driver)return ['등록된 기사를 선택하세요.'];
 if(!ids.length||idSet.size!==ids.length||orders.length!==ids.length)issues.push('선택 운송이 없거나 삭제·중복된 자료가 있습니다.');
 if(orders.some(r=>r.date!==plan.date||['cancelled','notshipped','support'].includes(r.status)))issues.push('다른 일자 또는 취소·미출고·지원 운송이 포함되어 있습니다.');
 if((data.closings||[]).some(c=>c.status==='closed'&&c.month===plan.date.slice(0,7)))issues.push('마감된 월은 편성할 수 없습니다.');
 if((data.settlements||[]).some(s=>idSet.has(s.orderId)&&['confirmed','closed'].includes(s.status)))issues.push('확정 정산이 연결된 운송은 변경할 수 없습니다.');
 if(orders.some(r=>plan.orderSnapshots?.[r.id]!==orderSnapshot(r)))issues.push('검토한 이후 원본 운송이 변경되었습니다. 다시 불러오세요.');
 const status=availabilityOn(driver,plan.date,data.equipment);if(!status.available)issues.push(status.reason);
 const eq=equipmentFor(driver,data.equipment),policy=loadPolicy(driver,data.equipment),turn=Number(plan.turn);
 if(!eq||!norm(plan.vehicleNo)||norm(plan.vehicleNo)!==norm(eq.plateNo))issues.push('기사에게 연결된 운송차량을 확인하세요.');
 if(!policy.capacity)issues.push('실제 적재 가능 대수가 미설정입니다. 차량·기사 제원을 확인하세요.');
 if(!Number.isInteger(turn)||turn<1||turn>policy.maxTurns)issues.push(`일일 ${policy.maxTurns}회전 한도를 확인하세요. 3회전 초과는 스케줄의 예외 사유가 필요합니다.`);
 if(orders.some(r=>Number(plan.orderTurns?.[r.id])!==turn))issues.push('한 편성에는 같은 회전만 포함할 수 있습니다.');
 if(orders.some(r=>!Number.isInteger(Number(r.count))||Number(r.count)<1))issues.push('운송 대수가 미확인된 자료가 있습니다.');
 const count=orders.reduce((n,r)=>n+Number(r.count||0),0);if(policy.capacity&&count>policy.capacity)issues.push(`적재 한도 초과: ${count}대 / ${policy.capacity}대`);
 if(Number(plan.totalCount)!==count||Number(plan.totalTurns)!==1)issues.push('편성 대수·배차 건수가 실제 선택 운송과 다릅니다.');
 const keys=new Set();for(const r of orders){const k=transportKey(r);if(!k||keys.has(k))issues.push('차대번호·구간 누락 또는 동일 운송 중복이 있습니다.');keys.add(k);}
 if(new Set(orders.map(r=>norm(r.origin))).size>1||orders.some(r=>!norm(r.origin)||!norm(r.destination)))issues.push('동일 회전은 한 상차지로 편성하세요. 다중 상차는 별도 운행계획 검토가 필요합니다.');
 if(new Set(orders.map(r=>norm(r.destination))).size>1&&(!plan.routeReviewed||!String(plan.routeNote||'').trim()))issues.push('복수 도착지의 운행 동선 확인과 검토 내용을 입력하세요.');
 if(new Set(orders.map(r=>r.departTime).filter(Boolean)).size>1&&(!plan.routeReviewed||!String(plan.routeNote||'').trim()))issues.push('출발시간이 다른 운송이 포함되어 있습니다. 같은 회전으로 운행 가능한지 검토 내용을 입력하세요.');
 const otherPlans=data.assignments.filter(p=>p.id!==plan.id&&p.status==='confirmed');
 if(otherPlans.some(p=>(p.orderIds||[]).some(id=>idSet.has(id))))issues.push('다른 확정 배차에 포함된 운송이 있습니다.');
 if(otherPlans.some(p=>p.formation&&formationKey(p)===formationKey(plan)))issues.push('이 기사·차량·회전은 이미 확정되었습니다. 해당 편성을 열어 추가하세요.');
 const effective=effectiveOrders(plan.date,data.dispatch,data.assignments.filter(p=>p.id!==plan.id));
 const other=effective.filter(r=>!idSet.has(r.id)),booked=other.filter(r=>resolveFormationDriver(r,data.drivers)?.id===driver.id);
 if(orders.some(r=>{const current=effective.find(o=>o.id===r.id);return current?.driver&&resolveFormationDriver(current,data.drivers)?.id!==driver.id;}))issues.push('이미 다른 기사에게 배정된 운송은 기존 배차에서 변경 후 편성하세요.');
 if(orders.some(r=>r.vehicleNo&&norm(r.vehicleNo)!==norm(plan.vehicleNo)))issues.push('원본 운송차량과 편성 차량이 다릅니다. 기존 차량 배정을 확인하세요.');
 if(booked.some(r=>!Number.isInteger(Number(r.turn))||Number(r.turn)<1))issues.push('이 기사에게 회전이 미입력된 기존 운송이 있습니다. 먼저 회전을 확인하세요.');
 if(booked.some(r=>Number(r.turn)>policy.maxTurns))issues.push('기존 운송이 일일 회전 한도를 초과합니다. 스케줄 예외를 확인하세요.');
 if(booked.some(r=>Number(r.turn)===turn))issues.push('같은 회전의 다른 운송이 있습니다. 해당 회전 전체를 포함해서 편성하세요.');
 if(other.some(r=>norm(r.vehicleNo)===norm(plan.vehicleNo)&&norm(plan.vehicleNo)&&resolveFormationDriver(r,data.drivers)?.id!==driver.id&&(!Number(r.turn)||Number(r.turn)===turn)))issues.push('다른 기사와 같은 차량·회전이 겹칩니다.');
 const context={...driver,equipment:eq};if(orders.some(r=>!compatible(classifyOrder(r,data.products||[]),context)))issues.push('차량 구조·상품차종·숙련도·시간 또는 안전 조건을 충족하지 못합니다.');
 const knownWeight=orders.reduce((n,r)=>n+Number(classifyOrder(r,data.products||[]).weightKg||0)*Number(r.count||0),0);if(eq?.maxLoadKg&&knownWeight>Number(eq.maxLoadKg))issues.push('확인된 적재 중량이 장비 허용 중량을 초과합니다.');
 return [...new Set(issues)];
}
export function proposeFormations(date,driverId,ids,data){
 const driver=data.drivers.find(d=>d.id===driverId);if(!driver)throw Error('기사를 먼저 선택하세요.');
 const policy=loadPolicy(driver,data.equipment),idSet=new Set(ids);if(!policy.capacity)throw Error('실제 적재 가능 대수를 먼저 설정하세요.');
 const booked=effectiveOrders(date,data.dispatch,data.assignments).filter(r=>!idSet.has(r.id)&&resolveFormationDriver(r,data.drivers)?.id===driverId);
 const selected=data.dispatch.filter(r=>idSet.has(r.id));if(!selected.length)throw Error('운송을 선택하세요.');
 const groups=new Map(),held=[];for(const order of [...selected].sort((a,b)=>norm(a.origin).localeCompare(norm(b.origin))||norm(a.destination).localeCompare(norm(b.destination)))){
   if(order.date!==date||['cancelled','notshipped','support'].includes(order.status)){held.push({id:order.id,reason:'일자·운송 상태 확인'});continue;}
   const turn=allocateTurn(booked,{...order,turn:''},policy);if(turn===null){held.push({id:order.id,reason:'상차 한도·회전 한도·기존 미확인 회전 확인'});continue;}
   if(!groups.has(turn))groups.set(turn,[]);groups.get(turn).push(order);booked.push({...order,turn});
 }
 return {groups:[...groups].map(([turn,orders])=>({turn,orders})),held};
}
