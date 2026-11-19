import {createFleetLinks} from './operating-status.js';
export const phoneId=value=>String(value||'').replace(/[^0-9]/g,'').replace(/^82/,'0');
export function accountPreview(drivers,equipment,existing=[]){
 const phones=new Map(),links=createFleetLinks(drivers,equipment);
 for(const d of drivers){const p=phoneId(d.phone);if(p)phones.set(p,(phones.get(p)||0)+1);}
 return drivers.map(d=>{const phone=phoneId(d.phone),old=existing.find(a=>a.driver_id===d.id),reasons=[];
  if(old)reasons.push('기존 계정 유지');if(d.status!=='active')reasons.push('활동 상태 확인');if(!/^010\d{8}$/.test(phone))reasons.push('휴대폰 번호 확인');if(phones.get(phone)>1)reasons.push('휴대폰 번호 중복');
  const candidates=equipment.filter(e=>e.driverId===d.id&&links.vehicle(e).issues.length===0),vehicles=candidates.length===1?candidates:[];
  return {driverId:d.id,name:d.name,phone,vehicleIds:vehicles.map(e=>e.id),vehicleLabels:vehicles.map(e=>e.plateNo),eligible:!reasons.length,reasons,note:vehicles.length?'연결 차량 업무 조회':'차량 연결 보류 · 본인 배차·공지·할 일만 이용'};
 }).sort((a,b)=>a.name.localeCompare(b.name,'ko',{numeric:true}));
}
