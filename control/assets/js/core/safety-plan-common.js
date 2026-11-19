import {SOP_DEFAULTS} from './safety-plan-variants.js';

// Contact values belong in the private workspace, never in the public application bundle.
export const PLAN_COMMON_KEY='vehicleSafetyPlanCommon:v1';
export const PLAN_COMMON_FIELDS=[
 ['C17','관리감독자'],['E17','관리감독자 연락처'],
 ['D85','안전보건관리책임자'],['G85','안전보건관리책임자 연락처'],
 ['C18','작업지휘자'],['E18','작업지휘자 연락처'],
 ['C19','신호수(유도자)'],['E19','신호수(유도자) 연락처'],
];
export function validatePlanCommon(input){
 const cells={};
 for(const [key,label] of PLAN_COMMON_FIELDS){
  const value=String(input?.[key]??'').trim();
  if(!value||value.length>150)throw Error(label+' 공통 정보를 입력하세요.');
  if(label.includes('연락처')&&!/^[+()\d\s-]{8,30}$/.test(value))throw Error(label+'를 확인하세요.');
  cells[key]=value;
 }
 return cells;
}
export function applyPlanCommon(input,common){
 const next={...input};
 if(common?.cells)Object.assign(next,validatePlanCommon(common.cells));
 // Repair incomplete SOP text without inventing inspection outcomes or changing custom text.
 for(const [key,value] of Object.entries(SOP_DEFAULTS))if(!key.startsWith('SOP_G')&&!String(next[key]??'').trim())next[key]=value;
 return next;
}
export function planCommonChanges(cells,common){
 if(!common?.cells)return [];
 const next=applyPlanCommon(cells,common);
 return Object.keys(next).filter(key=>String(cells?.[key]??'')!==String(next[key]??'')).map(key=>({cell:key,before:cells?.[key]??'',after:next[key]}));
}
