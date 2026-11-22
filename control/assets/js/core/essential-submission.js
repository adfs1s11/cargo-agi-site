import {restoreEssentialChecks,normalizedCheck}from'./essential-checks.js';
import {equipmentSafetyValues}from'./equipment-safety.js';
import {safetyLoadCheck}from'./safety-load.js';
export const ESSENTIAL_POLICY='submission-default-v1';
export function submissionEssentials(input={},equipment={},plan={}){
 const cells=restoreEssentialChecks(input,plan),reasons=new Map(),general=[],defaulted=[];
 const flag=(index,message,value='△')=>{const row=68+index,old=reasons.get(row);reasons.set(row,{value:old?.value==='X'?'X':value,messages:[...(old?.messages||[]),message]});};
 const v=equipmentSafetyValues(equipment),broken=/미설치|설치\s*예정|고장|파손|부적합|불량|작동\s*불가/;
 if(v.fallProtect==='없음'||broken.test(v.fallProtectionNote)||/추락방지[^\n]*(?:없음|미설치|설치\s*예정)/.test(String(cells.C39||''))){flag(2,'추락방지 시설 없음·보완 기록 확인');flag(4,'추락방지 시설 보완 및 상부 작업 가능 여부 확인');}
 if(broken.test(v.deckLift)){flag(0,'인양장치 이상 기록 확인');flag(1,'인양장치·정지 후 지지장치 보완 확인');}
 if(broken.test(v.deckFall)||v.deckFall==='없음')flag(1,'낙하방지 장치 보완 기록 확인');
 if(equipment.vehicleSafetyHold?.active===true||v.specialInspectionResult==='부적합'){for(let i=0;i<8;i++)flag(i,'장비 작업중지·부적합 기록 해소 확인');}
 else if(v.specialInspectionResult==='보완 필요')general.push('장비 점검 결과 보완 필요 · 차량 원장의 조치 기록을 확인하세요.');
 const load=safetyLoadCheck({unitWeightKg:cells.C33,units:cells.H38||cells.F33,maxLoadKg:cells.C38,maxUnits:cells.H38});
 if(load==='초과-작업불가')flag(6,'적재중량·적재대수 한도 초과','X');else if(load==='확인 필요')flag(6,'상품차량 중량·장비 적재중량·최대 적재 대수 확인 필요');
 for(let r=68;r<=75;r++){const key='J'+r;cells[key]=normalizedCheck(cells[key]);if(!cells[key]){cells[key]='O';defaulted.push(r);}const issue=reasons.get(r);if(issue&&cells[key]!=='X')cells[key]=issue.value;}
 const exceptions=[];for(let r=68;r<=75;r++){const value=cells['J'+r];if(['X','△'].includes(value))exceptions.push({row:r,no:r-67,value,reason:reasons.get(r)?.messages.join(' / ')||(value==='X'?'기존 미조치 기록 · 조치 후 확인값 수정':'기존 주의 기록 · 보완 후 확인값 수정')});}
 return {cells,defaulted,exceptions,general,policy:ESSENTIAL_POLICY};
}
export function completeSelectedEssentials(input,equipment,rows,acknowledged){
 if(!acknowledged)throw Error('선택한 항목의 실제 보완 완료를 확인하세요.');if(!rows.length)throw Error('조치 완료로 변경할 항목을 선택하세요.');const cells={...input};for(const r of rows){if(!Number.isInteger(r)||r<68||r>75)throw Error('안전기준 선택을 확인하세요.');cells['J'+r]='O';}return submissionEssentials(cells,equipment);
}
