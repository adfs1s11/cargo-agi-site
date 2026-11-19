import {state,saveEquipment,safetyForPlate} from '../../core/data.js';
import {EQUIPMENT_SAFETY_FIELDS,equipmentSafetyValues} from '../../core/equipment-safety.js';
import {equipmentSafetyFields,readEquipmentSafety} from '../equipment-safety-fields.js';
import {workspaceProfile} from '../../core/supabase-session.js';
import {canOpenPage} from '../../core/workspace-access.js';
import {esc,nf,openModal,todayStr,toast,exportXlsx} from '../../core/utils.js';
import {equipmentAlerts,EQUIPMENT_STATUS,SERVICE_TYPES} from '../../core/equipment-management.js';
import {equipmentServiceRecords,addEquipmentService,canManageEquipment} from '../../core/equipment-service-store.js';
import {supabaseMode} from '../../core/supabase-session.js';
import {confirmSupabaseSaved} from '../../core/supabase-cloud.js';
import {REGISTRATION_FIELDS,registrationValues} from '../../core/vehicle-registration.js';
export async function confirmEquipmentSync(){
 if(!supabaseMode())return;
 await confirmSupabaseSaved();
}
export async function openEquipmentCard(equipment){
 const editable=canManageEquipment(),records=await equipmentServiceRecords(equipment.id);
 const matching=safetyForPlate(equipment.plateNo),legacy=matching.length===1?matching[0]:null,safetyValues=equipmentSafetyValues(equipment,legacy);
 const alerts=editable?equipmentAlerts(equipment,todayStr()):[];
 const input=(name,label,type='text',extra='')=>`<label class="field">${label}<input class="input" name="${name}" type="${type}" ${extra}></label>`;
 openModal({title:equipment.plateNo+' · 장비 관리 카드',size:'wide',sub:'차량 정보와 정비 기록을 함께 확인합니다.',body:`
  <div class="form-grid"><div><b>운행 상태</b><p>${esc(EQUIPMENT_STATUS[equipment.status]||'확인 필요')}</p></div><div><b>기사</b><p>${esc(equipment.driverName||'이름 조회 정보 없음')}</p></div></div>
  ${editable?`<div role="status">${alerts.length?alerts.map(a=>`<p class="badge ${a.level==='overdue'?'red':'amber'}">${esc(a.label)}</p>`).join(' '):'<p class="badge green">보험·검사 30일 이내 만료 없음</p>'}</div><p>보험 ${esc(equipment.insuranceExpiry||'미확인')} · 검사 ${esc(equipment.inspectionExpiry||'미확인')}</p>`:'<p>현재 계정에는 차량 기본정보만 제공됩니다. 만료일·정비 이력 확인과 수정은 관리자에게 요청하세요.</p>'}
  ${(!supabaseMode()||canOpenPage(workspaceProfile()?.role,'vehicle-safety'))?`<p><a id="equipment-plan-link" class="btn btn-primary" href="#/vehicle-safety?plans=1&vehicle=${encodeURIComponent(equipment.id)}" data-link>안전작업계획서 확인·수정·다운로드</a></p>`:''}
  ${equipment.registration?`<h3>등록증에서 확인한 차량 제원</h3><div class="form-grid">${REGISTRATION_FIELDS.filter(([k])=>k!=='plateNo').map(([k,label])=>`<div><b>${esc(label)}</b><p>${esc(String(registrationValues(equipment)[k]??'')||'미확인')}</p></div>`).join('')}</div><p class="small muted">원본 대조 ${esc(equipment.registration.confirmedAt?.slice(0,10)||'')} · ${esc(equipment.registration.confirmedBy||'')}</p>`:''}
  ${editable?`<form id="equipment-safety-form">${equipmentSafetyFields(equipment,legacy)}<p class="small muted">저장 후 안전작업계획서에서 ‘차량·기사 최신정보 반영’을 누르고 새 버전을 저장하세요. 기존 제출본은 유지됩니다.</p><p id="equipment-safety-status" role="status"></p><button class="btn btn-primary" type="submit">안전장치·점검 정보 저장</button></form>`:`<h3>안전장치 · 장비 점검</h3><div class="form-grid">${EQUIPMENT_SAFETY_FIELDS.map(([k,label])=>'<div><b>'+label+'</b><p>'+esc(safetyValues[k]||'미입력')+'</p></div>').join('')}</div>`}
  <h3>정비·점검 이력</h3>
  ${records===null?'<p>이 계정에는 정비 이력 조회 권한이 없습니다.</p>':records.length?`<div class="table-scroll"><table class="data"><thead><tr><th>정비일 / 구분</th><th>내용 / 업체</th><th>주행거리</th><th>공급가</th><th>다음 점검</th></tr></thead><tbody>${records.map(r=>`<tr><td>${esc(r.date)}<br>${esc(SERVICE_TYPES[r.kind]||r.kind)}</td><td style="white-space:normal;min-width:180px">${esc(r.description)}<br><small>${esc(r.vendor||'업체 미입력')} · ${esc(r.actorName)}</small></td><td>${r.odometer===null?'미입력':nf(r.odometer)+' km'}</td><td>${r.supplyCost===null?'미입력':nf(r.supplyCost)+'원'}</td><td>${esc(r.nextDue||'미설정')}</td></tr>`).join('')}</tbody></table></div><button class="btn btn-ghost" id="equipment-service-export">정비 이력 내보내기</button>`:'<p>등록된 정비 이력이 없습니다. 기록 없음은 점검 완료를 뜻하지 않습니다.</p>'}
  ${editable?`<details style="margin-top:18px"><summary><b>정비 이력 추가</b></summary><p class="small muted">실제 수행한 작업만 기록하세요. 금액은 부가세 별도 공급가이며, 비워 두면 미입력으로 보존합니다. 기존 이력과 차량 운행 상태는 자동 변경하지 않습니다.</p><form id="equipment-service-form"><div class="form-grid">
   ${input('date','정비일','date',`value="${todayStr()}" max="${todayStr()}" required`)}<label class="field">정비 구분<select class="select" name="kind">${Object.entries(SERVICE_TYPES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
   ${input('vendor','정비 업체','text','maxlength="200"')}${input('odometer','누적 주행거리 (km)','number','min="0" step="1"')}${input('supplyCost','정비 공급가 (원, 부가세 별도)','number','min="0" step="1"')}${input('nextDue','다음 점검 예정일','date')}
   <label class="field full">정비 내용<textarea class="textarea" name="description" required maxlength="2000" placeholder="고장 증상, 실제 작업 및 교환 부품"></textarea></label>
  </div><p id="equipment-service-error" role="alert" style="color:var(--danger,#b42318)"></p><button class="btn btn-primary" type="submit">정비 이력 저장</button></form></details>`:''}`,
  foot:'<button class="btn btn-ghost" data-close>닫기</button>',onMount(el,close){
   const safetyForm=el.querySelector('#equipment-safety-form');if(safetyForm){let applied=false;safetyForm.onsubmit=async event=>{event.preventDefault();const b=safetyForm.querySelector('[type=submit]'),status=safetyForm.querySelector('[role=status]');if(b.disabled)return;b.disabled=true;status.textContent='저장 확인 중…';try{if(!applied){const current=state.equipment.find(e=>e.id===equipment.id);if(!current)throw Error('차량이 삭제되었거나 조회 권한이 변경되었습니다.');if(current.updatedAt!==equipment.updatedAt)throw Error('다른 화면에서 차량이 수정되었습니다. 관리 카드를 다시 열고 확인하세요.');await saveEquipment({...current,equipmentSafety:readEquipmentSafety(safetyForm)});applied=true;for(const f of safetyForm.querySelectorAll('input,select'))f.disabled=true;}await confirmEquipmentSync();const actual=state.equipment.find(e=>e.id===equipment.id);close();toast(supabaseMode()?'안전장치·점검 정보의 서버 저장을 확인했습니다.':'안전장치·점검 정보를 이 PC에 저장했습니다.','success');await openEquipmentCard(actual);}catch(e){status.textContent=e.message;b.textContent=applied?'서버 저장 다시 확인':'안전장치·점검 정보 저장';}finally{b.disabled=false;}};}
   el.querySelector('#equipment-plan-link')?.addEventListener('click',()=>close());
   const exportButton=el.querySelector('#equipment-service-export');if(exportButton)exportButton.onclick=()=>exportXlsx({'정비 이력':[['차량번호','정비일','구분','내용','업체','누적 주행거리(km)','공급가(부가세 별도)','다음 점검일','작성자'],...records.map(r=>[equipment.plateNo,r.date,SERVICE_TYPES[r.kind],r.description,r.vendor,r.odometer??'',r.supplyCost??'',r.nextDue,r.actorName])]},`M&M_정비이력_${equipment.plateNo}.xlsx`);
   const form=el.querySelector('#equipment-service-form');if(!form)return;let applied=false;
   form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('[type=submit]'),error=el.querySelector('#equipment-service-error');if(button.disabled)return;button.disabled=true;error.textContent='';
    try{if(!applied){await addEquipmentService(equipment.id,Object.fromEntries(new FormData(form)));applied=true;for(const field of form.querySelectorAll('input,textarea,select'))field.disabled=true;}await confirmEquipmentSync();close();toast(supabaseMode()?'정비 이력의 서버 저장을 확인했습니다.':'정비 이력을 이 PC에 저장했습니다.','success');await openEquipmentCard(equipment);}
    catch(e){error.textContent=e.message;button.textContent=applied?'서버 저장 다시 확인':'정비 이력 저장';}finally{button.disabled=false;}
   };
  }
 });
}
