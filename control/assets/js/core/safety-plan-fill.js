import {equipmentSafetyPlan} from './equipment-safety.js';
import {cleanPlanCells,normalizePlanPlate,PLAN_CELLS,unpack} from './safety-plan-workbook.js';
import {registrationValues} from './vehicle-registration.js';

// The example is a writing reference. Names, contacts, loads, dates, signatures and
// actual inspection/education outcomes must come from the vehicle record or a person.
export const EXAMPLE_TEXT_CELLS=['C9','H9','C11','H11','C12','C23','B26','H31','H32','B78','B89'];
const legacyDefaults={C9:['테슬라 차량 상·하차 및 운송'],C11:['상품차량 승차·고박·운송·하차'],H11:['신호수 유도·표준작업절차 적용']};
export function readPlanReference(bytes){
 unpack(bytes);if(!globalThis.XLSX)throw Error('엑셀 읽기 기능을 불러오지 못했습니다.');const book=XLSX.read(bytes,{type:'array'}),sheet=book.Sheets['작성예시'];
 if(!sheet||!book.Sheets['안전작업계획서'])throw Error('작성예시와 안전작업계획서 시트가 있는 양식을 선택하세요.');
 const cells={};for(const a of PLAN_CELLS)cells[a]=sheet[a]?.f?'':sheet[a]?.v??'';
 return cleanPlanCells(cells);
}
export function resolvePlanDriver(equipment,drivers,selectedId=''){
 if(selectedId){const d=drivers.find(d=>d.id===selectedId);return d?{driver:d,basis:'계획서에서 선택한 기사',warnings:[]}:{driver:null,basis:'선택 기사 확인 필요',warnings:['계획서에서 선택한 기사 정보가 현재 명부에 없습니다.']};}
 const linked=drivers.find(d=>d.id===equipment.driverId);
 if(linked)return {driver:linked,basis:'차량에 연결된 기사',warnings:equipment.driverName&&linked.name!==equipment.driverName?['차량의 기사 표시 이름과 연결된 기사 이름이 다릅니다. 연결 관계를 확인하세요.']:[]};
 const plate=normalizePlanPlate(equipment.plateNo),matches=drivers.filter(d=>plate&&[d.vehicleNo,d.plateNo].some(v=>normalizePlanPlate(v)===plate));
 if(matches.length===1&&(!equipment.driverName||matches[0].name===equipment.driverName))return {driver:matches[0],basis:'차량번호·기사 이름 대조',warnings:[]};
 const named=drivers.filter(d=>equipment.driverName&&d.name===equipment.driverName&&!d.vehicleNo&&!d.plateNo);
 if(!matches.length&&named.length===1)return {driver:named[0],basis:'기사 이름 일치·명부 차량번호 미등록',warnings:['기사 명부에 차량번호가 없습니다. 연결 정보를 확인하세요.']};
 return {driver:null,basis:'차량 등록 이름만 확인',warnings:[matches.length?'차량번호에 연결된 기사가 중복되거나 차량의 기사 이름과 다릅니다. 기사를 선택하세요.':'연결된 기사 명부가 없습니다. 기사 이름은 차량 등록값을 사용하며 연락처는 확인이 필요합니다.']};
}
const empty=v=>v==null||String(v).trim()==='';
const placeholder=v=>empty(v)||/^(운전자 확인 필요|모델·연식 확인|구조 확인 필요|보험 증빙 미등록|검사 증빙 미등록|지정 필요)$/.test(String(v));
export function fillPlanFromRecords(input,equipment,drivers,example,{selectedDriverId='',refreshLinked=false}={}){
 const cells=cleanPlanCells(input),before={...cells},resolved=resolvePlanDriver(equipment,drivers,selectedDriverId),warnings=[...resolved.warnings];
 for(const a of EXAMPLE_TEXT_CELLS)if(empty(cells[a])||legacyDefaults[a]?.includes(String(cells[a])))cells[a]=example[a]||cells[a];
 for(let r=45;r<=61;r++)for(const c of ['B','C','H','K'])if(empty(cells[c+r]))cells[c+r]=example[c+r]||'';
 for(let r=17;r<=22;r++)if(empty(cells['G'+r]))cells['G'+r]=example['G'+r]||'';
 // Never reuse the example's location, work period, mass, plate, staff or pass marks.
 if(empty(cells.H10))cells.H10='최초 양식 보고 · 별도 기간 없음';
 if(empty(cells.C13))cells.C13='현장 제한속도 확인 후 적용 (작성예시: 일반주행로 15km/h, 상·하차 구역 10km/h)';
 if(empty(cells.C31))cells.C31='테슬라 상품차량 (출고 차종·제원 확인)';
 if(empty(cells.C32))cells.C32='출고 차종별 제원표 확인';
 cells.H36=equipment.plateNo;
 const d=resolved.driver,roster=equipment.sourceRoster||{},registration=registrationValues(equipment);
 if(d&&!d.phone)warnings.push('연결된 기사 명부에 연락처가 없습니다. 연락처를 확인하세요.');
 const linked={...equipmentSafetyPlan(equipment),C20:d?.name||equipment.driverName||'',E20:d?.phone||'',C36:equipment.structure||equipment.type||'',C37:[registration.model,roster.manufacturer,registration.manufacturedAt?'제작 '+registration.manufacturedAt:roster.vehicleYear].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' / '),C40:equipment.insuranceExpiry?'보험 만료일 '+equipment.insuranceExpiry:'',H40:registration.inspectionExpiry?'검사 만료일 '+registration.inspectionExpiry:'',H38:Number(equipment.capacity)>0?Number(equipment.capacity):'',C38:''};
 // The vehicle registration and vehicle edit fields both explicitly use kilograms.
 if(Number(registration.maxLoadKg)>0)linked.C38=Number(registration.maxLoadKg);
 for(const [a,v] of Object.entries(linked))if(!empty(v)&&(refreshLinked||placeholder(cells[a])))cells[a]=v;
 if(refreshLinked&&empty(linked.E20)&&(d||linked.C20&&linked.C20!==before.C20))cells.E20='';
 if(d&&before.C20&&before.C20!==d.name&&!placeholder(before.C20)&&!refreshLinked){warnings.push('저장된 운전자 이름과 현재 기사 명부가 다릅니다. ‘차량·기사 최신정보 반영’으로 확인하세요.');cells.E20=before.E20;}
 if(refreshLinked&&!d)warnings.push('기사 명부 연결이 확인되지 않았습니다. 운전자 연락처를 직접 확인하세요.');
 const changes=PLAN_CELLS.filter(a=>String(before[a])!==String(cells[a])).map(a=>({cell:a,before:before[a],after:cells[a]}));
 return {cells:cleanPlanCells(cells),changes,warnings,driverId:d?.id||'',driverBasis:resolved.basis,vehicleId:equipment.id};
}
const LINKED_CELLS=['H36','C20','E20','C36','C37','C38','H38','C40','H40','C39','C41','H41'];
export function planLinkedValues(equipment,drivers,selectedDriverId=''){
 const values=fillPlanFromRecords({},equipment,drivers,{}, {selectedDriverId,refreshLinked:true}).cells;
 return Object.fromEntries(LINKED_CELLS.map(key=>[key,values[key]]));
}
export function planVehicleChanges(cells,equipment,drivers,selectedDriverId=''){
 const linked=new Set(LINKED_CELLS);
 return fillPlanFromRecords(cells,equipment,drivers,{}, {selectedDriverId,refreshLinked:true}).changes.filter(c=>linked.has(c.cell));
}
export function planRecordChanges(record,equipment,drivers){
 if(!record?.plan?.workbookFields||!equipment)return [];
 const updated=equipment.updatedAt&&equipment.updatedAt>record.createdAt||drivers.some(d=>d.id===(record.plan.selectedDriverId||equipment.driverId)&&d.updatedAt>record.createdAt);
 const current=planLinkedValues(equipment,drivers,record.plan.selectedDriverId),basis=record.plan.linkedSource;
 const changed=new Set(record.plan.pendingVehicleReview||[]);
 if(basis)for(const key of LINKED_CELLS)if(String(basis[key]??'')!==String(current[key]??''))changed.add(key);
 const differences=planVehicleChanges(record.plan.workbookFields,equipment,drivers,record.plan.selectedDriverId);
 const changes=differences.filter(c=>changed.has(c.cell)||!basis&&updated);
 if(equipment.registration){const values=registrationValues(equipment);for(const [key,value] of Object.entries(values))if(!empty(value)&&String(value)!==String(record.vehicleSnapshot?.[key]??''))changes.push({cell:'registration.'+key,before:record.vehicleSnapshot?.[key]??'',after:value});}
 return changes;
}
