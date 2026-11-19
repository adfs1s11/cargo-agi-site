export const EQUIPMENT_SAFETY_FIELDS=[['deckLift','2층 인양장치명'],['deckFall','2층 낙하방지 장치명'],['fallProtect','추락방지 시설유무'],['fallProtectionNote','추락방지 시설 상세'],['specialInspection','장비 점검일'],['specialInspectionResult','장비 점검 결과']];
export function equipmentSafetyValues(e={},legacy={}){return Object.fromEntries(EQUIPMENT_SAFETY_FIELDS.map(([k])=>[k,String(e.equipmentSafety?.[k]??e[k]??legacy?.[k]??'').trim()]));}
export function cleanEquipmentSafety(value,today){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('안전장치 입력 형식을 확인하세요.');
 const out={};for(const [k,label]of EQUIPMENT_SAFETY_FIELDS){const v=value[k]??'';if(typeof v!=='string'||v.length>500)throw Error(label+'은 500자 이내로 입력하세요.');out[k]=v.trim();}
 if(!['','있음','없음','해당없음','확인중'].includes(out.fallProtect))throw Error('추락방지 시설유무를 선택하세요.');
 if(!['','양호','보완 필요','부적합','확인중'].includes(out.specialInspectionResult))throw Error('장비 점검 결과를 선택하세요.');
 const date=out.specialInspection;if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>today))throw Error('장비 점검일은 실제 점검한 날짜로 입력하세요. 미래 날짜는 입력할 수 없습니다.');
 if(['양호','보완 필요','부적합'].includes(out.specialInspectionResult)&&!date)throw Error('점검 결과를 입력할 때는 실제 장비 점검일도 입력하세요.');return out;
}
export function equipmentSafetyPlan(e){const v=equipmentSafetyValues(e),defined=!!e.equipmentSafety||EQUIPMENT_SAFETY_FIELDS.some(([k])=>Object.hasOwn(e,k));if(!defined)return {};
 const linked={C39:[v.deckLift?'2층 인양: '+v.deckLift:'2층 인양: 미입력',v.deckFall?'2층 낙하방지: '+v.deckFall:'2층 낙하방지: 미입력','추락방지: '+(v.fallProtect||'미확인')+(v.fallProtectionNote?' / '+v.fallProtectionNote:'')].join('\n'),C41:v.specialInspectionResult||'점검 결과 미입력',H41:v.specialInspection||'점검일 미입력'};
 if(![v.deckLift,v.deckFall,v.fallProtect,v.fallProtectionNote].some(Boolean))delete linked.C39;
 if(!v.specialInspectionResult)delete linked.C41;if(!v.specialInspection)delete linked.H41;return linked;
}
