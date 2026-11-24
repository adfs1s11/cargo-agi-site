import {canonical,delta,overlayChanges,recordKey} from './cloud-model.js';

const newPlan = c => c.store==='safety' && c.before===null && c.after?.recordType==='vehicleSafety' &&
 c.after.kind==='plan' && c.after.status==='draft' && c.after.vehicleId && c.after.plan?.workbookFields;
export const onlyNewPlans = changes => !!changes?.length && changes.every(newPlan);

function checkPlanSources(base,latest,changes){
 const plans=changes.filter(newPlan).map(c=>c.after);
 if(!plans.length)return;
 const ids=new Set(plans.map(p=>p.vehicleId));
 const fields=['safety','equipment','drivers','products','meta'];
 if(!fields.every(s=>base.loadedStores.includes(s)))throw Error('계획서와 연결된 자료를 모두 조회한 뒤 저장 상태를 확인하세요.');
 for(const c of delta(base.records,latest.records,fields)){
  const related=c.store==='safety'?[c.before,c.after].some(r=>r?.kind==='plan'&&ids.has(r.vehicleId)):
   c.store==='equipment'?ids.has(c.key):
   c.store==='meta'?/^(vehicleSafety|safetyTraining:)/.test(c.key):true;
  if(related)throw Error('계획서 또는 연결된 차량·기사·상품차량·안전 자료가 변경되었습니다. 작업 백업 후 최신 내용과 대조하세요.');
 }
}

export function rebasePendingRecords(base,latest,local){
 if(base.manifest.baseImportId!==latest.manifest.baseImportId||canonical(base.manifest.profile)!==canonical(latest.manifest.profile)||canonical(base.loadedStores)!==canonical(latest.loadedStores))throw Error('원장 기준 또는 권한이 변경됐습니다. 작업을 백업한 뒤 관리자에게 확인하세요.');
 const changes=delta(base.records,local,base.loadedStores);
 checkPlanSources(base,latest,changes);
 for(const c of changes){
  const remote=(latest.records[c.store]||[]).find(r=>recordKey(c.store,r)===c.key)??null;
  if(canonical(remote)!==canonical(c.before))throw Error('같은 자료가 다른 곳에서도 변경되어 자동으로 합치지 않았습니다. 입력은 보관 중입니다. 작업 백업 후 관리자에게 확인하세요.');
 }
 return {records:overlayChanges(latest.records,changes),changes};
}
