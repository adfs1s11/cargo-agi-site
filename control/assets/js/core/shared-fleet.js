import {createFleetLinks} from './operating-status.js';
import {availabilityOn} from './schedule.js';
import {normalizePlate} from './utils.js';
import {operationProfile,departmentMatch} from './operation-profile.js';
export function fleetRows(data,{department='',query='',status=''}={}){
 const links=createFleetLinks(data.drivers,data.equipment),q=query.trim().toLowerCase();
 return data.equipment.map(e=>{
  const link=links.vehicle(e),d=link.driver,issues=[...link.issues];
  if(d&&links.driver(d).vehicles.length>1)issues.push('복수 차량 담당 · 운행 차량 확인');
  const schedule=d?availabilityOn(d,data.day,data.equipment):{available:false,reason:'기사 연결 필요'};
  const bookings=data.bookings.filter(b=>!!d&&b.driverId===d.id||!!e.plateNo&&normalizePlate(b.vehicleNo)===normalizePlate(e.plateNo));
  for(const [field,label] of [['insuranceExpiry','보험'],['inspectionExpiry','검사']]){if(!e[field])issues.push(label+' 만료일 확인');else if(e[field]<data.day)issues.push(label+' 유효기간 경과');}
  if(!Number.isInteger(Number(e.capacity))||Number(e.capacity)<=0)issues.push('적재 한도 확인');
  if(bookings.some(b=>b.uncertain))issues.push('확정 편성 중복 확인');
  const departments=[...new Set(bookings.map(b=>b.department))];
  const conflict=departments.length>1||bookings.length>0&&!schedule.available;
  const key=conflict?'conflict':!schedule.available?'unavailable':issues.length?'review':bookings.length?'booked':'candidate';
  return {equipment:e,driver:d,issues,schedule,bookings,departments,key,preferred:departmentMatch(e,department),profile:operationProfile(e.operationProfile)};
 }).filter(r=>(!department||r.preferred)&&(!status||r.key===status)&&(!q||[r.equipment.plateNo,r.driver?.name,r.driver?.phone,r.profile.team].join(' ').toLowerCase().includes(q)))
 .sort((a,b)=>(a.key==='candidate'?0:1)-(b.key==='candidate'?0:1)||String(a.equipment.plateNo).localeCompare(String(b.equipment.plateNo),'ko',{numeric:true}));
}
export function unlinkedBookings(data){const ids=new Set(data.drivers.map(d=>d.id)),plates=new Set(data.equipment.map(e=>normalizePlate(e.plateNo)).filter(Boolean));return data.bookings.filter(b=>!ids.has(b.driverId)&&!plates.has(normalizePlate(b.vehicleNo))).reduce((n,b)=>n+Number(b.count||0),0);}
