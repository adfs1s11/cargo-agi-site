import {equipmentStructure} from './equipment-policy.js';
import {classifyOrder, compatible} from './dispatch-profile.js';
import {norm} from './utils.js';

// Explicit pairs are confined to this planning session. Never treat a broad dispatch region as distance.
export function nearbyGroups(text='') {
  return text.split(/\r?\n/).map(line=>new Set(line.split('|').map(norm).filter(Boolean))).filter(group=>group.size>1);
}
function district(place) {
  const match=String(place||'').trim().match(/(?:^|\s)(서울(?:특별시)?|부산(?:광역시)?|대구(?:광역시)?|인천(?:광역시)?|대전(?:광역시)?|울산(?:광역시)?|광주광역시|[가-힣]{2,6}시)\s+([가-힣]{1,5}구)(?:\s|$)/);
  return match ? match[1].replace(/특별시|광역시$/,'')+' '+match[2] : '';
}
function proximity(a,b,groups) {
  const x=norm(a),y=norm(b);
  if(!x||!y)return Infinity;
  if(x===y)return 0;
  if(groups.some(group=>group.has(x)&&group.has(y)))return 1;
  const area=district(a);
  return area&&area===district(b)?1:Infinity;
}
export function routePriority(a,b,groups=[]) {
  const start=proximity(a.origin,b.origin,groups),end=proximity(a.destination,b.destination,groups);
  return end===Infinity||start===Infinity?Infinity:start===1?3:end===1?2:1;
}
export function targetCapacity(e,registered) {
  const type=equipmentStructure(e);
  const standard=type==='풀트레일러'?7:type==='세미트레일러'?6:/파비스|pavise/i.test(e?.model||'')?5:0;
  return standard&&registered?Math.min(standard,registered):standard||registered||0;
}
// Each selected vehicle receives one unoccupied turn. Every order's count is indivisible.
export function packRoutes(orders,vehicles,products=[],nearby=[]) {
  const pool=new Map(orders.map(r=>[r.id,r]));
  const profiles=new Map(orders.map(r=>[r.id,classifyOrder(r,products)]));
  const slots=vehicles.map(v=>{
    if(!Number.isInteger(v.target)||v.target<1||v.target>50||v.capacity>0&&v.target>v.capacity)throw Error('차량별 목표 적재 대수를 확인하세요.');
    return {...v,orders:[],count:0,weight:0,priority:1};
  });
  const routeKey=r=>JSON.stringify([norm(r.origin),norm(r.destination)]);
  for(let tier=1;tier<=3;tier++){
    for(const slot of slots){
      if(slot.count===slot.target||tier>1&&!slot.orders.length)continue;
      const eligible=[...pool.values()].filter(r=>norm(r.origin)&&norm(r.destination)&&Number.isInteger(Number(r.count))&&Number(r.count)>0&&Number(r.count)<=slot.target-slot.count&&compatible(profiles.get(r.id),{...slot.driver,equipment:slot.equipment}));
      const volumes=new Map();
      for(const r of eligible){const key=routeKey(r);volumes.set(key,(volumes.get(key)||0)+Number(r.count));}
      eligible.sort((a,b)=>volumes.get(routeKey(b))-volumes.get(routeKey(a))||routeKey(a).localeCompare(routeKey(b),'ko')||String(a.id).localeCompare(String(b.id)));
      for(const r of eligible){
        if(slot.count+Number(r.count)>slot.target)continue;
        const weight=(Number(profiles.get(r.id).weightKg)||0)*Number(r.count);
        if(slot.equipment.maxLoadKg>0&&slot.weight+weight>slot.equipment.maxLoadKg)continue;
        if(slot.orders.some(other=>routePriority(other,r,nearby)>tier))continue;
        slot.orders.push(r);slot.count+=Number(r.count);slot.weight+=weight;slot.priority=tier;pool.delete(r.id);
        if(slot.count===slot.target)break;
      }
    }
  }
  return {groups:slots.filter(slot=>slot.orders.length),remaining:[...pool.values()]};
}
