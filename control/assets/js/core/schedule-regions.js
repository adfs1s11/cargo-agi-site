import {norm} from './utils.js';

export const PRIORITY_REGIONS={capital:'수도권',gyeongsang:'경상권',chungcheongHonam:'충청/호남',other:'기타'};
const regionNames={capital:['수도권','서울','경기','인천'],gyeongsang:['경상','경상권','경북','경남','경상북도','경상남도','부산','대구','울산'],chungcheongHonam:['충청/호남','충청','충청권','충북','충남','대전','세종','호남','전라','전북','전남','광주']};
export function priorityFor(driver){
 const explicit=driver.schedule?.priorityRegion;
 if(Object.hasOwn(PRIORITY_REGIONS,explicit||''))return {region:explicit,source:'직접 지정'};
 const groups=new Set((driver.preferred||[]).map(v=>Object.entries(regionNames).find(([,names])=>names.includes(String(v).trim()))?.[0]||'other'));
 return groups.size===1?{region:[...groups][0],source:'선호 권역 기준'}:{region:'other',source:groups.size?'복수 권역 · 우선 지정 필요':'선호 권역 미등록'};
}
export function regionalSchedule(input,orders=[],equipment=[]){
 const linked=new Set(input.map(r=>norm(r.equipment?.plateNo)||r.equipment?.id).filter(Boolean));
 input=[...input,...equipment.filter(e=>!linked.has(norm(e.plateNo)||e.id)).map(e=>({driver:{id:'',name:e.driverName||'기사 미연결',vehicleNo:e.plateNo,preferred:[]},equipment:e,available:false,free:false,canAssign:false,conflict:false,review:true,reason:'기사 명부 연결 확인 필요',capacity:Number(e.capacity)||0,maxTurns:3,usedTurns:0,remainingTurns:0,remainingCount:0,count:0,orders:0,turns:[],booked:[],fromEquipment:true}))];
 const keys=new Map();
 const keyFor=r=>norm(r.equipment?.plateNo)||r.equipment?.id||'';
 for(const r of input){const k=keyFor(r);if(k)keys.set(k,[...(keys.get(k)||[]),r]);}
 const rows=input.map(r=>{const shared=keyFor(r)&&keys.get(keyFor(r)).length>1;return {...r,...priorityFor(r.driver),...(shared?{region:'other',source:'동일 장비 기사 연결 중복',available:false,canAssign:false,free:false,conflict:true,reason:'동일 장비 기사 연결 중복 확인 필요'}:{})};});
 const byOrder=new Map();
 for(const r of rows)for(const o of r.booked){if(!byOrder.has(o.id))byOrder.set(o.id,[]);byOrder.get(o.id).push(r);}
 const orderRegion=o=>{const matches=byOrder.get(o.id)||[];return matches.length===1?matches[0].region:'other';};
 const summarize=list=>{
  const groups=new Map();for(const r of list){const k=keyFor(r);if(k&&!groups.has(k))groups.set(k,r);}
  const equipment=[...groups.values()],available=equipment.filter(r=>r.available),known=available.filter(r=>r.capacity>0);
  return {drivers:list.filter(r=>!r.fromEquipment).length,equipment:equipment.length,available:available.length,tripCapacity:known.reduce((n,r)=>n+r.capacity,0),dailyCapacity:known.reduce((n,r)=>n+r.capacity*r.maxTurns,0),remaining:equipment.filter(r=>r.canAssign).reduce((n,r)=>n+r.remainingCount,0),unknownCapacity:equipment.filter(r=>!r.capacity).length,unlinked:list.filter(r=>!r.equipment).length,review:list.filter(r=>r.conflict||r.review||!r.equipment).length};
 };
 const summary=summarize(rows),regions=Object.fromEntries(Object.keys(PRIORITY_REGIONS).map(key=>[key,summarize(rows.filter(r=>r.region===key))]));
 const scopedOrders=region=>orders.filter(o=>!region||orderRegion(o)===region);
 return {rows,summary,regions,summarize,scopedOrders,orderRegion};
}
