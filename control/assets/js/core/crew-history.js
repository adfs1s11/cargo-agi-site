import {uid,normalizePlate} from './utils.js';
export function crewChanged(a,b){return (a?.driverId||'')!==(b?.driverId||'')||(a?.driverName||'')!==(b?.driverName||'');}
export function crewEvent(before,after,meta={}){return {id:uid('crew'),recordedAt:new Date().toISOString(),effectiveDate:meta.effectiveDate||'',reason:meta.reason||'운영 명단 반영',actor:meta.actor||'관리자',sourceFile:meta.sourceFile||'',sourceOperatingSince:meta.sourceOperatingSince||'',plateNo:after.plateNo,previousDriverId:before?.driverId||'',previousDriverName:before?.driverName||'',driverId:after.driverId||'',driverName:after.driverName||''};}
export function equipmentHistory(before,after,meta){return crewChanged(before,after)?{...after,crewHistory:[...(before?.crewHistory||[]),crewEvent(before,after,meta)]}:after;}
export function driverHistory(before,after,meta={}){return normalizePlate(before?.vehicleNo)!==normalizePlate(after.vehicleNo)?{...after,vehicleHistory:[...(before?.vehicleHistory||[]),{id:uid('move'),recordedAt:new Date().toISOString(),effectiveDate:meta.effectiveDate||'',reason:meta.reason||'운영 명단 반영',actor:meta.actor||'관리자',sourceFile:meta.sourceFile||'',sourceOperatingSince:meta.sourceOperatingSince||'',previousPlate:before?.vehicleNo||'',plateNo:after.vehicleNo||''}]}:after;}
export function planCrewChange(previous,row,values,meta){
 const drivers=structuredClone(values.drivers),equipment=structuredClone(values.equipment),changes=[];
 if(!crewChanged(previous,row))return [{store:'equipment',after:row}];
 if(!/^\d{4}-\d{2}-\d{2}$/.test(meta.effectiveDate||'')||!meta.reason?.trim())throw Error(' 승무 변경일과 변경 사유를 입력하세요.');
 const incoming=drivers.find(d=>d.id===row.driverId);if(row.driverId&&!incoming)throw Error('선택한 기사를 명부에서 찾을 수 없습니다.');
 for(const e of equipment){if(e.id===row.id||!incoming||e.driverId!==incoming.id)continue;changes.push({store:'equipment',after:equipmentHistory(e,{...e,driverId:'',driverName:'',updatedAt:row.updatedAt},meta)});}
 for(const d of drivers){let plate=d.vehicleNo;if(d.id===incoming?.id)plate=row.plateNo;else if(d.id===previous?.driverId&&normalizePlate(d.vehicleNo)===normalizePlate(previous.plateNo))plate='';if(plate!==d.vehicleNo)changes.push({store:'drivers',after:driverHistory(d,{...d,vehicleNo:plate,updatedAt:row.updatedAt},meta)});}
 changes.push({store:'equipment',after:equipmentHistory(previous,row,meta)});return changes;
}
