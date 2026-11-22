import {esc,openModal} from '../../core/utils.js';
import {state} from '../../core/data.js';
import {workspaceProfile,supabaseMode} from '../../core/supabase-session.js';
import {VARIANT_LABELS,SOP_DEFAULTS,applyPlanVariant,inferPlanVariant,sopHeader} from '../../core/safety-plan-variants.js';
import {canEditPlans,latestVehiclePlan,preparePlanFill,savePlanDrafts} from '../../core/safety-plan-store.js';
import {safetyDocuments} from '../../core/vehicle-safety.js';
import {confirmEquipmentSync} from './equipment-card.js';

export function variantEditorMarkup(cells,equipment){
 const inferred=inferPlanVariant(equipment,cells),variant=cells.PLAN_VARIANT||'';
 return `<input type="hidden" name="SOP_READY" value="1"><details class="sp-card" open><summary>차량 유형별 4·5번 · 작업절차(SOP)</summary><p class="sp-muted">제공하신 두 샘플의 위험성평가 점수를 구분합니다. 5번 안전기준과 13단계 작업절차는 두 샘플이 동일합니다. 샘플 적용 시 기존 4·5번과 작업절차를 교체하고 5번과 작업절차의 기존 확인·보완 표시는 보존합니다. 직접 추가한 위험요인 18~20번은 보존합니다.</p><div class="sp-grid"><label>계획서 유형<select name="PLAN_VARIANT" id="sp-variant"><option value="">유형 선택 필요</option>${Object.entries(VARIANT_LABELS).map(([key,label])=>`<option value="${key}" ${variant===key?'selected':''}>${label}</option>`).join('')}</select></label><label>위험성평가 구분<select name="RISK_BASIS"><option value="">미구분 · 확인 필요</option><option value="sample" ${cells.RISK_BASIS==='sample'?'selected':''}>제공 샘플 점수 · 현장 재평가 전</option><option value="field" ${cells.RISK_BASIS==='field'?'selected':''}>현장 재평가 입력 · 승인 별도</option></select></label></div><p class="sp-muted">등록 차량 기준: ${esc(VARIANT_LABELS[inferred]||'차량 타입 미등록 · 비세이프티로더 기본 적용')}</p><button type="button" class="btn btn-ghost" id="sp-variant-apply">선택 유형 샘플로 4·5번·작업절차 채우기</button><p id="sp-variant-status" role="status"></p><h3>작업절차 담당자 · 차량 연결</h3><pre id="sp-sop-header">${esc(headerText(cells))}</pre><p class="sp-muted">담당자·연락처·작업장소·작성일은 위 기본정보 및 참여 인원에서 수정하면 함께 반영됩니다. ‘확인’은 계획에 반영된 단계입니다. 현장에서 확인한 절차는 O로 입력하고 보완·미조치는 △·X로 표시합니다. 아래 작업절차는 차량별로 수정·저장·엑셀 일괄 업로드가 가능합니다.</p>${Array.from({length:13},(_,i)=>{const r=i+7;return `<details class="sp-risk"><summary>${i+1}. ${esc(cells['SOP_C'+r]||SOP_DEFAULTS['SOP_C'+r])}</summary><div class="sp-grid">${[['C','단계'],['D','작업내용'],['E','위험요소'],['F','관리요소·작업방법']].map(([c,label])=>`<label>${label}<textarea name="SOP_${c+r}" rows="3">${esc(cells['SOP_'+c+r]||(!variant?SOP_DEFAULTS['SOP_'+c+r]||'':''))}</textarea></label>`).join('')}<label>절차 확인<select name="SOP_G${r}">${['확인','O','△','X','미확인'].map(v=>`<option value="${v}" ${String(cells['SOP_G'+r]||'확인').replace('○','O')===v?'selected':''}>${v}</option>`).join('')}</select></label></div></details>`;}).join('')}</details>`;
}
function headerText(cells){const h=sopHeader(cells);return h.B2+'\n작업장소: '+h.D3+'\n관리감독자: '+h.F3+'\n안전보건관리책임자: '+h.F4+'\n'+h.B21;}
export function bindVariantEditor(form,equipment,collect,changed,setCells){
 const updateHeader=()=>{form.querySelector('#sp-sop-header').textContent=headerText(collect());};
 form.addEventListener('input',updateHeader);form.addEventListener('change',updateHeader);
 form.querySelector('#sp-variant-apply').onclick=()=>{
  const inferred=inferPlanVariant(equipment,collect()),variant=form.elements.PLAN_VARIANT.value||inferred||'other';
  const status=form.querySelector('#sp-variant-status');if(!variant){status.textContent='먼저 차량 유형을 선택하세요.';return;}if(inferred&&inferred!==variant){status.textContent='등록 차량 구조와 선택 유형이 다릅니다. 차량 정보를 먼저 확인하세요.';return;}
  if(!confirm('4·5번의 기존 위험성평가와 작업절차를 선택한 샘플로 바꿉니다. 아직 저장하지 않은 해당 항목의 수정도 바뀝니다. 적용할까요?'))return;
  const next=applyPlanVariant(collect(),variant);for(const [name,value] of Object.entries(next)){const input=form.elements.namedItem(name);if(input&&'value' in input)input.value=String(value);}
  setCells(next);for(const title of form.querySelectorAll('[data-risk-title]')){const r=Number(title.dataset.riskTitle);title.textContent=(r-44)+'. '+(next['B'+r]||'추가 작업')+' · '+(next['C'+r]||'추가 위험요인');}changed();updateHeader();status.textContent=VARIANT_LABELS[variant]+' 샘플 반영 · 저장 전. 점수는 참고값이며 기존 확인값과 예외를 유지합니다.';
 };
}

export function openVariantBatch(onDone){
 if(!canEditPlans())throw Error('관리자 권한이 필요합니다.');
 openModal({title:'차량별 4·5번·작업절차 샘플 일괄 적용',size:'wide',sub:'기존 작성본은 이전 이력으로 보존하며 선택 차량만 새 초안으로 저장합니다.',body:`<div class="sp-center"><p class="sp-alert">등록된 차량 구조로 세이프티로더와 비세이프티로더를 나눕니다. 4번 점수는 제공 샘플의 참고값입니다. 5번은 제출 작성 기본값을 적용하고 기존 X·△와 차량 원장 예외를 유지합니다. 작업절차의 빈칸은 계획 확인으로 채우고 △·X는 유지합니다. 담당자·차량 제원·직접 추가한 위험요인은 보존하며 기사 최신정보를 연결합니다. 차량 타입이 미등록이면 비세이프티로더 샘플을 기본 적용합니다. 차량 원장의 타입은 바꾸지 않습니다.</p><label>등록·수정자<input id="sv-actor" value="${esc(workspaceProfile()?.name||'')}"></label><button class="btn btn-primary" id="sv-preview">차량별 적용 내용 미리보기</button><p class="sp-error" id="sv-error" role="alert"></p><div id="sv-result"></div></div>`,foot:'<button class="btn btn-ghost" data-close>닫기</button>',onMount(el){
  let busy=false,prepared=[],applied=false;
  const run=fn=>async()=>{if(busy)return;busy=true;el.querySelector('#sv-error').textContent='';try{await fn();}catch(e){el.querySelector('#sv-error').textContent=e.message;}finally{busy=false;}};
  el.querySelector('#sv-preview').onclick=run(async()=>{
   const docs=await safetyDocuments();prepared=[];
   for(const eq of state.equipment){const record=latestVehiclePlan(docs,eq.id),inferred=inferPlanVariant(eq,record?.plan?.workbookFields),variant=inferred||'other';const filled=await preparePlanFill(record,eq,{refreshLinked:true});const cells=applyPlanVariant(filled.cells,variant);const already=record?.plan?.workbookFields&&Object.entries(cells).every(([k,v])=>String(record.plan.workbookFields[k]??'')===String(v??''));
    prepared.push({vehicleId:eq.id,plate:eq.plateNo,variant,defaulted:!inferred,cells,expectedId:record?.id||'',selectedDriverId:record?.plan?.selectedDriverId||'',fillWarnings:filled.warnings,sourceNotes:record?.plan?.sourceNotes||'',name:'유형별 샘플 · 2026-11-18',already});
   }
   const valid=prepared.filter(p=>!p.error&&!p.already);el.querySelector('#sv-result').innerHTML=`<h3>적용 대상 ${valid.length}대 · 비세이프티로더 기본 적용 ${prepared.filter(p=>p.defaulted&&!p.already).length}대 · 동일 ${prepared.filter(p=>p.already).length}대</h3><div class="sp-scroll" style="max-height:420px"><table><thead><tr><th>선택</th><th>차량</th><th>적용 유형</th><th>확인 사항</th></tr></thead><tbody>${prepared.map((p,i)=>`<tr><td><input type="checkbox" data-variant-row="${i}" aria-label="${esc(p.plate)} 적용" ${p.error||p.already?'disabled':'checked'}></td><td>${esc(p.plate)}</td><td>${esc(VARIANT_LABELS[p.variant]||'미확인')}</td><td>${esc(p.error||(p.already?'동일 내용 저장됨':[p.defaulted?'차량 타입 미등록 · 비세이프티로더 기본 적용':'새 초안 · 5번 기존 확인값 보존',...(p.fillWarnings||[])].join(' / ')))}</td></tr>`).join('')}</tbody></table></div><button id="sv-save" class="btn btn-primary" ${valid.length?'':'disabled'}>선택 차량에 적용하고 서버 저장</button><p id="sv-status" role="status"></p>`;
   el.querySelector('#sv-save').onclick=run(async()=>{const button=el.querySelector('#sv-save');button.disabled=true;try{if(!applied){const inputs=[...el.querySelectorAll('[data-variant-row]:checked')].map(c=>prepared[Number(c.dataset.variantRow)]);await savePlanDrafts(inputs,el.querySelector('#sv-actor').value);applied=true;el.querySelectorAll('[data-variant-row],#sv-preview,#sv-actor').forEach(c=>c.disabled=true);}await confirmEquipmentSync();el.querySelector('#sv-status').textContent=supabaseMode()?'서버 저장 확인 완료 · 차량별 4·5번과 작업절차 다운로드에 반영됩니다.':'이 PC에 저장 완료';button.textContent='적용 완료';await onDone?.();}catch(e){button.disabled=false;button.textContent=applied?'서버 저장 다시 확인':'선택 차량에 적용하고 서버 저장';throw e;}});
  });
 }});
}
