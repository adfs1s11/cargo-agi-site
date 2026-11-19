import {norm,normalizePlate,uid} from './utils.js';
import {equipmentStructure} from './equipment-policy.js';
const digits=v=>String(v||'').replace(/\D/g,'');
const person=v=>norm(v).replace(/\s+/g,'').replace(/(?:개별화물|개별|GCC|H1)$/i,'');
const names=d=>[d.name,...(d.aliases||[])].map(person);
export function rosterStructure(row){return /^(?:\d+(?:\.\d+)?)톤$/.test(String(row.vehicleType||'').replace(/\s/g,''))?'대형트럭':equipmentStructure({sourceRoster:row});}
export function planRosterRegistration(parsed,values){
 const drivers=structuredClone(values.drivers||[]),equipment=structuredClone(values.equipment||[]),changes=[],held=[],summary={newDrivers:0,updatedDrivers:0,newEquipment:0,updatedEquipment:0};
 const now=new Date().toISOString(),sourcePhones=new Map();
 for(const r of parsed.rows){const p=digits(r.phone);if(p)sourcePhones.set(p,[...(sourcePhones.get(p)||[]),r]);}
 for(const r of parsed.rows){
  const plate=normalizePlate(r.plate),p=digits(r.phone),hold=reason=>held.push({...r,reason});
  if(!/^01[016789]\d{7,8}$/.test(p)||sourcePhones.get(p)?.length!==1){hold('휴대폰 번호 누락·중복 확인 필요');continue;}
  const eqs=equipment.filter(e=>normalizePlate(e.plateNo)===plate);if(eqs.length>1){hold('같은 차량번호가 여러 건 등록됨');continue;}
  const phoneMatches=drivers.filter(d=>digits(d.phone)===p);
  if(phoneMatches.length>1){hold('기존 기사 연락처 중복');continue;}
  let d=phoneMatches[0],e=eqs[0];
  if(d&&!names(d).includes(person(r.name))){hold('같은 연락처의 기존 기사 이름이 다름');continue;}
  if(!d){const candidates=drivers.filter(d=>names(d).includes(person(r.name))&&normalizePlate(d.vehicleNo)===plate);if(candidates.length>1){hold('동일 이름·차량의 기사 중복');continue;}d=candidates[0];if(d&&digits(d.phone)&&digits(d.phone)!==p){hold('기존 기사와 파일의 연락처가 다름');continue;}}
  if(e?.driverId&&e.driverId!==d?.id&&drivers.some(x=>x.id===e.driverId)){hold('차량에 연결된 기존 기사가 다름');continue;}
  const structure=rosterStructure(r);if(!structure){hold('장비 구조 확인 필요');continue;}
  const isNewDriver=!d,beforeDriver=d;
  d={...(d||{}),id:d?.id||uid('drv'),name:d?.name||r.name,phone:d?.phone||r.phone,vehicleNo:plate,type:d?.type||'용차',status:d?.status||'active',aliases:d?.aliases||[],preferred:d?.preferred||[],avoid:d?.avoid||[],schedule:d?.schedule||{mode:'oncall',weekdays:[],exceptions:{},maxTurns:3,capacity:0},createdAt:d?.createdAt||now,updatedAt:now};
  if(!names(d).includes(person(r.name)))d.aliases=[...d.aliases,r.name];
  d.sourceRoster=r;
  const isNewEquipment=!e,beforeEquipment=e,profile=e?.operationProfile||{},kgm=/KG|KGM/i.test(r.department||'');
  e={...(e||{}),id:e?.id||uid('eqp'),plateNo:plate,driverId:d.id,driverName:d.name,type:e?.type||'카캐리어',structure,model:e?.model||[r.vehicleType,r.manufacturer].filter(Boolean).join(' / '),manufacturer:e?.manufacturer||r.manufacturer||'',capacity:e?.capacity||0,status:e?.status||'pending',insuranceExpiry:e?.insuranceExpiry||'',inspectionExpiry:e?.inspectionExpiry||'',sourceRoster:r,createdAt:e?.createdAt||now,updatedAt:now};
  if(kgm)e.operationProfile={...profile,primary:'kgm',team:/수출/.test(r.department)?'수출':'내수',preferred:[...new Set([...(profile.preferred||[]),...(profile.primary&&profile.primary!=='kgm'?[profile.primary]:[])])].filter(x=>x!=='kgm')};
  if(isNewDriver){drivers.push(d);summary.newDrivers++;}else{drivers[drivers.findIndex(x=>x.id===d.id)]=d;summary.updatedDrivers++;}
  if(isNewEquipment){equipment.push(e);summary.newEquipment++;}else{equipment[equipment.findIndex(x=>x.id===e.id)]=e;summary.updatedEquipment++;}
  changes.push({store:'drivers',key:d.id,before:beforeDriver,after:d},{store:'equipment',key:e.id,before:beforeEquipment,after:e});
 }
 return {changes,held,summary,drivers,equipment};
}
