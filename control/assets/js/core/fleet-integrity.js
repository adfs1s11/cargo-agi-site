import {normalizePlate,norm} from './utils.js';
export function fleetIntegrity(data){
 const drivers=data.drivers||[],equipment=data.equipment||[],issues=[],byId=new Map(drivers.map(d=>[d.id,d])),byPlate=new Map(),phones=new Map(),names=new Map();
 const add=(severity,code,subject,message,driverId='',equipmentId='')=>issues.push({severity,code,subject,message,driverId,equipmentId});
 for(const d of drivers){const phone=String(d.phone||'').replace(/\D/g,'');if(phone){if(!phones.has(phone))phones.set(phone,[]);phones.get(phone).push(d);}for(const n of new Set([d.name,...d.aliases||[]].map(norm).filter(Boolean))){if(!names.has(n))names.set(n,[]);names.get(n).push(d);}}
 for(const e of equipment){const plate=normalizePlate(e.plateNo);if(!byPlate.has(plate))byPlate.set(plate,[]);byPlate.get(plate).push(e);const d=byId.get(e.driverId);
  if(e.driverId&&!d)add('conflict','missing-driver',plate,'연결된 기사 번호가 기사 원장에 없습니다.',e.driverId,e.id);
  if(d&&e.driverName&&![d.name,...d.aliases||[]].map(norm).includes(norm(e.driverName)))add('conflict','name-mismatch',plate,'연결 기사 번호와 표시 이름이 다릅니다.',d.id,e.id);
  if(d&&d.vehicleNo&&normalizePlate(d.vehicleNo)!==plate)add('conflict','primary-plate-mismatch',plate,'기사 명부의 현재 차량은 '+d.vehicleNo+'입니다.',d.id,e.id);
  if(!e.driverId)add('review','unlinked-equipment',plate,(names.get(norm(e.driverName))||[]).length>1?'동명이인입니다. 연락처·차량번호를 대조해 선택하세요.':e.driverName?'기사 이름만 입력되어 있습니다. 기사 번호 연결 확인이 필요합니다.':'배정 기사가 없습니다.','',e.id);
 }
 for(const [plate,rows]of byPlate)if(plate&&rows.length>1)for(const e of rows)add('conflict','duplicate-plate',plate,'같은 전체 차량번호 '+rows.length+'건이 있습니다.','',e.id);
 for(const [phone,rows]of phones)if(rows.length>1)for(const d of rows)add('review','duplicate-phone',d.name,'같은 연락처를 쓰는 기사 '+rows.length+'명. 기사 앱 계정은 자동 병합하지 않습니다.',d.id);
 for(const d of drivers){const owned=equipment.filter(e=>e.driverId===d.id);if(owned.filter(e=>e.status!=='idle').length>1)add('review','multiple-vehicles',d.name,'휴차 외 차량이 '+owned.filter(e=>e.status!=='idle').length+'대 연결되어 있습니다.',d.id);const listed=byPlate.get(normalizePlate(d.vehicleNo))||[];if(d.vehicleNo&&listed.length===1&&listed[0].driverId&&listed[0].driverId!==d.id)add('conflict','other-driver-vehicle',d.name,'기사의 명부 차량이 다른 기사 번호에 연결되어 있습니다.',d.id,listed[0].id);}
 return {driverCount:drivers.length,equipmentCount:equipment.length,conflicts:issues.filter(i=>i.severity==='conflict').length,reviews:issues.filter(i=>i.severity==='review').length,unlinked:equipment.filter(e=>!e.driverId).length,unregisteredDriverVehicles:drivers.filter(d=>d.vehicleNo&&!byPlate.has(normalizePlate(d.vehicleNo))).length,missingCapacity:equipment.filter(e=>!(Number(e.capacity)>0)).length,missingInsurance:equipment.filter(e=>!e.insuranceExpiry).length,missingInspection:equipment.filter(e=>!e.inspectionExpiry).length,missingPhone:drivers.filter(d=>!String(d.phone||'').replace(/\D/g,'')).length,issues};
}
