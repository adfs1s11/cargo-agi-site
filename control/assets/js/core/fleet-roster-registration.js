import {norm,normalizePlate,uid} from './utils.js';
import {validDriverName} from './driver-master.js';
import {equipmentHistory,driverHistory} from './crew-history.js';
import {equipmentStructure} from './equipment-policy.js';
const digits=v=>String(v||'').replace(/\D/g,'');
const person=v=>norm(v).replace(/\s+/g,'').replace(/(?:개별화물|개별|GCC|H1)$/i,'');
const names=d=>[d.name,...(d.aliases||[])].map(person);
export function rosterStructure(row){return /^(?:\d+(?:\.\d+)?)톤$/.test(String(row.vehicleType||'').replace(/\s/g,''))?'대형트럭':equipmentStructure({sourceRoster:row});}
export function scopeRoster(parsed,values){
 if(parsed.scope!=='kgm')return parsed;
 const rows=parsed.rows.filter(r=>/KG|KGM/i.test(r.department||'')),extra=[];
 for(const r of rows){const e=values.equipment.find(e=>normalizePlate(e.plateNo)===normalizePlate(r.plate)),old=values.drivers.find(d=>d.id===e?.driverId);if(!old||names(old).includes(person(r.name)))continue;const matches=parsed.rows.filter(x=>names(old).includes(person(x.name))&&normalizePlate(x.plate)!==normalizePlate(r.plate)&&(!digits(old.phone)||digits(old.phone)===digits(x.phone)));if(matches.length===1&&!rows.some(x=>x.plate===matches[0].plate)&&!extra.some(x=>x.plate===matches[0].plate))extra.push(matches[0]);}
 return {...parsed,rows:[...extra,...rows],relatedTransfers:extra.length};
}
export function planRosterRegistration(parsed,values){
 parsed=scopeRoster(parsed,values);
 const drivers=structuredClone(values.drivers||[]),equipment=structuredClone(values.equipment||[]),changes=[],held=[],summary={newDrivers:0,updatedDrivers:0,newEquipment:0,updatedEquipment:0};
 const now=new Date().toISOString(),sourcePhones=new Map();
 for(const r of parsed.rows){const p=digits(r.phone);if(p)sourcePhones.set(p,[...(sourcePhones.get(p)||[]),r]);}
 for(const r of parsed.rows){
  const plate=normalizePlate(r.plate),p=digits(r.phone),hold=reason=>held.push({...r,reason});
  if(!validDriverName(r.name)){hold('실제 기사 이름 확인 필요');continue;}
  if(!/^01[016789]\d{7,8}$/.test(p)||sourcePhones.get(p)?.length!==1){hold('휴대폰 번호 누락·중복 확인 필요');continue;}
  const eqs=equipment.filter(e=>normalizePlate(e.plateNo)===plate);if(eqs.length>1){hold('같은 차량번호가 여러 건 등록됨');continue;}
  const phoneMatches=drivers.filter(d=>digits(d.phone)===p);
  if(phoneMatches.length>1){hold('기존 기사 연락처 중복');continue;}
  let d=phoneMatches[0],e=eqs[0];
  if(d&&!names(d).includes(person(r.name))){hold('같은 연락처의 기존 기사 이름이 다름');continue;}
  if(!d){const candidates=drivers.filter(d=>names(d).includes(person(r.name))&&(normalizePlate(d.vehicleNo)===plate||(parsed.reviewCrewChanges&&parsed.rows.filter(x=>person(x.name)===person(r.name)).length===1)));if(candidates.length>1){hold('동일 이름·차량의 기사 중복');continue;}d=candidates[0];if(d&&digits(d.phone)&&digits(d.phone)!==p){hold('기존 기사와 파일의 연락처가 다름');continue;}}
  if(e?.driverId&&e.driverId!==d?.id&&drivers.some(x=>x.id===e.driverId)){const old=drivers.find(x=>x.id===e.driverId),moves=parsed.rows.filter(x=>names(old).includes(person(x.name))&&normalizePlate(x.plate)!==plate&&(!digits(old.phone)||digits(old.phone)===digits(x.phone)));if(!parsed.reviewCrewChanges||moves.length!==1||normalizePlate(old.vehicleNo)!==normalizePlate(moves[0].plate)){hold('차량에 연결된 기존 기사가 다름 · 기존 기사의 새 차량과 승무 변경 검토 필요');continue;}}
  const priorVehicles=equipment.filter(x=>d&&x.driverId===d.id&&normalizePlate(x.plateNo)!==plate);if(priorVehicles.length&&!parsed.reviewCrewChanges){hold('기존 기사의 차량 이동 · 승무 변경 검토 필요');continue;}
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
  for(const other of priorVehicles){const replacement=parsed.rows.some(x=>normalizePlate(x.plate)===normalizePlate(other.plateNo)&&person(x.name)!==person(r.name));if(!replacement){const cleared=equipmentHistory(other,{...other,driverId:'',driverName:'',updatedAt:now},{actor:parsed.actor,sourceFile:parsed.fileName,reason:'운영 명단에 따른 다른 차량 이동'});equipment[equipment.findIndex(x=>x.id===other.id)]=cleared;changes.push({store:'equipment',key:other.id,before:other,after:cleared});}}
  const meta={actor:parsed.actor,sourceFile:parsed.fileName,sourceOperatingSince:r.operatingSince,reason:'운영 현황 명단 확인 · 승무 연결/변경'};d=driverHistory(beforeDriver,d,meta);e=equipmentHistory(beforeEquipment,e,meta);drivers[drivers.findIndex(x=>x.id===d.id)]=d;equipment[equipment.findIndex(x=>x.id===e.id)]=e;
  changes.push({store:'drivers',key:d.id,before:beforeDriver,after:d},{store:'equipment',key:e.id,before:beforeEquipment,after:e});
 }
 return {changes,held,summary,drivers,equipment,selectedRows:parsed.rows,relatedTransfers:parsed.relatedTransfers||0};
}
