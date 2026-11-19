import {registrationValues} from './vehicle-registration.js';
import {equipmentSafetyValues} from './equipment-safety.js';
// Read-only projection: equipment remains the vehicle source of truth.
export const safetyPlate=v=>String(v??'').normalize('NFC').replace(/[\s-]/g,'').toUpperCase();
export function safetyVehicleYear(value,currentYear=new Date().getFullYear()){
 const text=String(value??'').trim();let m=text.match(/^(19\d{2}|20\d{2})(?=$|[.\-/년\s])/),y=m?Number(m[1]):null;
 if(y===null){m=text.match(/^(\d{2})(?:년|[.\-/]|$)/);if(m){const n=Number(m[1]);y=n<=currentYear%100?2000+n:1900+n;}}
 return y!==null&&y>=1950&&y<=currentYear?y:'';
}
export function safetyFleet(equipment=[],records=[],drivers=[],year=new Date().getFullYear()){
 const legacy=records.filter(r=>r.recordType!=='vehicleSafety'), used=new Set(), byPlate=new Map(), counts=new Map(), byDriver=new Map(drivers.map(d=>[d.id,d]));
 for(const r of legacy){const p=safetyPlate(r.plateNo);if(p){if(!byPlate.has(p))byPlate.set(p,[]);byPlate.get(p).push(r);}}
 for(const e of equipment){const p=safetyPlate(e.plateNo);if(p)counts.set(p,(counts.get(p)||0)+1);}
 const rows=equipment.map((e,index)=>{
  const p=safetyPlate(e.plateNo), matches=byPlate.get(p)||[], linked=counts.get(p)===1&&matches.length===1?matches[0]:null;
  if(linked)used.add(linked);
  const reg=registrationValues(e),y=[reg.manufacturedAt,e.year,e.sourceRoster?.vehicleYear,linked?.year].map(v=>safetyVehicleYear(v,year)).find(Boolean)||'',age=y?year-y:null;
  const kg=Number(reg.maxLoadKg),hasWeight=Object.hasOwn(e,'maxLoadKg')||Object.hasOwn(e.registration?.fields||{},'maxLoadKg');
  const tonnage=Number.isFinite(kg)&&kg>0?kg/1000:hasWeight?'':linked?.tonnage||'';
  const safety=equipmentSafetyValues(e,linked);
  if(e.equipmentSafety){const result=safety.specialInspectionResult,date=safety.specialInspection;safety.specialInspection=result==='양호'?date:result==='부적합'?'부적합 '+date:result==='보완 필요'?'보완 필요 '+date:date?'확인중 · 점검일 '+date:'';}
  return {...linked,...safety,id:'fleet:'+e.id,equipmentId:e.id,safetyRecordId:linked?.id||'',no:index+1,plateNo:e.plateNo||'',
   company:e.company??linked?.company??'',ownership:e.ownership??linked?.ownership??'',bodyType:e.structure||linked?.bodyType||'',year:y,
   ageBand:age===null||age<0?'':age<=5?'5년 이내':age<=10?'6년~10년':age<=15?'11년~15년':'16년 이상',
   tonnage,maxLoadKg:Number.isFinite(kg)&&kg>0?kg:'',manufacturedAt:reg.manufacturedAt||'',model:reg.model||'',capacity:e.capacity??0,active:e.status==='active',operating:e.status==='active'?'○':'',fleetStatus:({active:'운행',idle:'휴차',maintenance:'정비',pending:'확인 필요'})[e.status]||'확인 필요',
   driverName:byDriver.get(e.driverId)?.name||e.driverName||'',regularInspection:reg.inspectionExpiry||linked?.regularInspection||'',inspectionExpiry:reg.inspectionExpiry||'',insuranceExpiry:e.insuranceExpiry||'',
   noSafetyRecord:!linked&&!Object.values(safety).some(Boolean),linkIssue:counts.get(p)>1?'차량번호 중복':matches.length>1?'점검 기록 중복 확인':'',sourceFile:linked?.sourceFile||'운송차량 자동 연동'};
 });
 return [...rows,...legacy.filter(r=>!used.has(r)).map(r=>({...r,id:'legacy:'+r.id,safetyRecordId:r.id,unlinked:true,linkIssue:'차량 연결 확인'}))];
}
