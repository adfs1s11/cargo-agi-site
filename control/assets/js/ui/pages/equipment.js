import {openFleetIntegrity} from '../fleet-integrity-view.js';
import {crewHistoryView} from '../crew-history-view.js';
import {ensureWorkspaceStores} from '../../core/supabase-cloud.js';
import {operationProfileFields,readOperationProfile,operationBadge} from '../operation-profile-fields.js';
import {OPERATIONS,departmentMatch} from '../../core/operation-profile.js';
import {equipmentSafetyFields,readEquipmentSafety} from '../equipment-safety-fields.js';
import {createFleetLinks} from '../../core/operating-status.js';
import {workspaceProfile} from '../../core/supabase-session.js';
import {canOpenPage} from '../../core/workspace-access.js';
import {openOcrVehicles} from './ocr-vehicles.js';
import {openEquipmentCard,confirmEquipmentSync} from './equipment-card.js';
import {canManageEquipment} from '../../core/equipment-service-store.js';
import {equipmentAlerts} from '../../core/equipment-management.js';
import {supabaseMode} from '../../core/supabase-session.js';
import {vehicleSafetyBlock} from '../../core/vehicle-safety-policy.js';
import { EQUIPMENT_STRUCTURES, CAPACITY_CATEGORIES, equipmentStructure, capacityCategory, capacityLabel, capacityFromSelection } from '../../core/equipment-policy.js';
import { openFleetManager } from './drivers.js';
import { fleetClass } from '../../core/fleet.js';
import {
  $, esc, icon, nf, num, normalizePlate, openModal, confirmBox, toast, exportXlsx, debounce, todayStr, diffDays, ddayLabel, dday, addDays,
} from '../../core/utils.js';
import { state, saveEquipment, deleteEquipment, safetyForPlate, importEquipmentFromSafety } from '../../core/data.js';
import { safetySummary } from '../../core/safety.js';
import { pageHead, searchInput, kpi, sectionHead, banner, field } from '../components.js';
import { optionList } from '../../core/utils.js';


const TYPES = EQUIPMENT_STRUCTURES;

export default function renderEquipment(view,ctx={}) {
  const fleetLinks=createFleetLinks(state.drivers,state.equipment);
  const editable=canManageEquipment(), planAccess=!supabaseMode()||canOpenPage(workspaceProfile()?.role,'vehicle-safety');
  let filteredRows=[];
  const ui = { q: ctx.params?.get('q')||new URLSearchParams(location.hash.split('?')[1]).get('q')||'', status: '', structure:'', capacity:'', attention:'',operation:'' };
  const safetyFor = (e) => {
    const rows = safetyForPlate(e.plateNo);
    return rows.length ? { row: rows[0], sum: safetySummary(rows[0]) } : null;
  };
  const safetyAttention = state.equipment.filter((e) => {
    const s = safetyFor(e);
    return s && s.sum.attention > 0;
  }).length;
  const expiring = state.equipment.filter((e) => {
    const a = dday(e.insuranceExpiry), b = dday(e.inspectionExpiry);
    return (a !== null && a <= 30) || (b !== null && b <= 30);
  });

  view.innerHTML = `
    ${pageHead('장비 관리', '차량번호를 누르면 관리 카드와 정비 이력을 확인할 수 있습니다.', `
      ${editable?'<button class="btn btn-primary" id="btn-fleet-integrity">기사·차량 연계 점검</button>':''}<button class="btn btn-primary" id="btn-ocr-vehicles">등록증 OCR · 장비정보</button>
      ${planAccess?'<a class="btn btn-primary" href="#/vehicle-safety?plans=1" data-link>차량별 안전작업계획서</a>':''}
      ${planAccess?'<button class="btn btn-ghost" id="btn-tesla-pool">테슬라 고정풀 안전관리 현황 엑셀</button>':''}
      <button class="btn btn-ghost" id="btn-fleet-import">${icon('upload')} 운영현황 엑셀 반영</button>
      <a class="btn btn-ghost" href="#/safety" data-link>${icon('shield')} 안전점검</a>
      <button class="btn btn-ghost" id="btn-safety-import">${icon('download')} 안전차량 반영</button>
      <button class="btn btn-ghost" id="btn-export">${icon('download')} 내보내기</button>
      <button class="btn btn-primary" id="btn-add">${icon('plus')} 차량 추가</button>`)}
    <div class="grid grid-4" style="margin-bottom:14px">
      ${kpi({ label: '등록 차량', value: nf(state.equipment.length), unit: '대', iconName: 'truck', foot: `가동 <b>${nf(state.equipment.filter((e) => e.status === 'active').length)}</b>대 · 상태 확인 ${nf(state.equipment.filter(e=>e.status==='pending').length)}대` })}
      ${kpi({ label: '총 적재 능력', value: nf(state.equipment.reduce((s, e) => s + (num(e.capacity) || 0), 0)), unit: '대', iconName: 'grid', foot: `1회 기준 합계 · 미설정 ${nf(state.equipment.filter(e=>!num(e.capacity)).length)}대` })}
      ${kpi({ label: '만료 임박', value: nf(expiring.length), unit: '대', iconName: 'warning', tone: expiring.length ? 'warn' : 'good', foot: '보험·검사 30일 이내' })}
      ${kpi({ label: '정비·휴차', value: nf(state.equipment.filter((e) => ['maintenance','idle'].includes(e.status)).length), unit: '대', iconName: 'clock', foot: '가배차에서 제외' })}
    </div>
    ${expiring.length ? banner(`보험·검사가 30일 이내인 차량이 <b>${expiring.length}대</b> 있습니다. 만료 전 갱신해 주세요.`, 'warn') : ''}
    ${safetyAttention ? banner(`Tesla 안전점검에서 확인·조치가 필요한 차량이 <b>${safetyAttention}대</b> 있습니다. <a class="link" href="#/safety" data-link>안전점검 열기 →</a>`, 'warn') : ''}
    <div class="toolbar" style="margin-bottom:12px">
      ${searchInput('f-q', '차량번호·모델·기사 검색',ui.q)}
      <select class="select select-sm" id="f-operation" aria-label="주력·지원 운영 부서"><option value="">전체 운영 부서</option>${Object.entries(OPERATIONS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><select class="select select-sm" id="f-status">
        <option value="">전체 상태</option>
        <option value="pending">상태 확인 필요</option><option value="active">가동</option>
        <option value="maintenance">정비</option>
        <option value="idle">휴차</option>
      </select>
      <select class="select select-sm" id="f-structure" aria-label="장비 구조·용도 필터"><option value="">전체 장비 구조·용도</option>${TYPES.map(t=>`<option>${t}</option>`).join('')}<option value="unknown">구조 확인 필요</option></select>
      <select class="select select-sm" id="f-capacity" aria-label="적재량 필터"><option value="">전체 적재량</option>${CAPACITY_CATEGORIES.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}<option value="unset">미설정</option><option value="review">기존 적재량 확인 필요</option></select>
      <div style="flex:1"></div>
      ${editable?'<select class="select select-sm" id="f-attention" aria-label="장비 확인 사항"><option value="">전체 확인 사항</option><option value="overdue">보험·검사 만료</option><option value="due">30일 이내 만료</option><option value="unknown">정보 확인 필요</option></select>':''}
      <span class="small muted" id="cnt"></span>
    </div>
    <div class="table-wrap">
      <div class="table-scroll">
        <table class="data">
          <thead><tr><th>차량번호</th><th>장비 구조·용도 / 모델</th><th class="num">적재량 구분</th><th>배정 기사</th><th>보험 만료</th><th>검사 만료</th><th>안전점검</th><th>상태</th><th style="width:44px"></th></tr></thead>
          <tbody id="tbody"></tbody>
        </table>
      </div>
    </div>
  `;

  if(!editable){for(const id of ['btn-ocr-vehicles','btn-fleet-import','btn-safety-import','btn-add'])view.querySelector('#'+id)?.setAttribute('hidden','');}
  if(!editable){view.querySelectorAll('.kpi')[2]?.setAttribute('hidden','');}
  view.querySelector('#btn-fleet-integrity')?.addEventListener('click',()=>openFleetIntegrity().catch(e=>toast(e.message,'error')));
  view.querySelector('#btn-tesla-pool')?.addEventListener('click',()=>import('../tesla-pool-export.js').then(m=>m.openTeslaPoolExport()).catch(e=>toast(e.message,'error')));
  $('#btn-ocr-vehicles').onclick = () => {if(editable)openOcrVehicles({onSaved:()=>renderEquipment(view)}).catch(e=>toast(e.message,'error'));};
  const renderRows = () => {
    const q = ui.q.trim().toLowerCase();
    let rows = state.equipment.filter(e=>departmentMatch(e,ui.operation)).filter((e) => !ui.status || e.status === ui.status);
    if(ui.structure)rows=rows.filter(e=>ui.structure==='unknown'?!equipmentStructure(e):equipmentStructure(e)===ui.structure);
    if(ui.capacity)rows=rows.filter(e=>capacityCategory(e.capacity)===ui.capacity);
    if(ui.attention)rows=rows.filter(e=>equipmentAlerts(e,todayStr()).some(a=>a.level===ui.attention));
    if (q) rows = rows.filter((e) => `${e.plateNo} ${e.model} ${e.driverName} ${fleetLinks.vehicle(e).name} ${equipmentStructure(e)}`.toLowerCase().includes(q));
    rows.sort((a, b) => a.plateNo.localeCompare(b.plateNo, 'ko'));
    filteredRows=rows;
    $('#cnt').textContent = `${rows.length}대`;
    const tbody = $('#tbody');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="empty"><div class="icon">${icon('truck')}</div><h4>등록된 차량이 없습니다</h4><p>카캐리어·탁송 차량을 등록하면 가배차에서 적재량과 가동 상태를 반영합니다.</p><button class="btn btn-primary" id="empty-add">${icon('plus')} 차량 추가</button></div></td></tr>`;
      if(!editable)$('#empty-add')?.setAttribute('hidden','');
      $('#empty-add')?.addEventListener('click', () => openEditor());
      return;
    }
    tbody.innerHTML = rows.map((e) => {
      const ins = dday(e.insuranceExpiry), insp = dday(e.inspectionExpiry);
      const saf = safetyFor(e),linked=fleetLinks.vehicle(e);
      const roster=fleetClass(e,[],state.settings.fleet).source||e.sourceRoster;
      return `<tr class="clickable" data-id="${e.id}">
        <td><button class="btn btn-sm btn-ghost" data-card="${esc(e.id)}" aria-label="${esc(e.plateNo)} 관리 카드">${esc(e.plateNo)}</button><div style="margin:5px 0">${operationBadge(e)}</div><div class="tiny muted">${esc(e.memo || '')}</div>${editable?equipmentAlerts(e,todayStr()).map(a=>`<div class="tiny ${a.level==='overdue'?'text-danger':'muted'}">${esc(a.label)}</div>`).join(''):''}</td>
        <td><div class="small">${esc(equipmentStructure(e)||'구조 확인 필요')}</div><div class="tiny muted">원본 참고: ${esc(e.model || '-')}</div>${roster?.vehicleYear?`<div class="tiny muted">년식 ${esc(roster.vehicleYear)}</div>`:''}<div class="small strong">${esc(fleetClass(e,[],state.settings.fleet).label)}</div></td>
        <td class="num">${esc(capacityLabel(e.capacity))}${capacityCategory(e.capacity)==='7plus'?`<div class="tiny muted">실제 한도 ${nf(e.capacity)}대</div>`:''}</td>
        <td>${linked.name?`<a data-fleet-link class="link" href="#/drivers?q=${encodeURIComponent(linked.name)}">${esc(linked.name)}</a>`:'<span class="muted small">미배정</span>'}${linked.issues.map(message=>`<div class="op-link-warning">${esc(message)}</div>`).join('')}</td>
        <td>${ins === null ? '<span class="muted small">-</span>' : `<span class="badge ${ins < 0 ? 'red' : ins <= 30 ? 'amber' : 'gray'}">${ins < 0 ? `${Math.abs(ins)}일 경과` : `${ins}일 남음`}</span><div class="tiny muted">${esc(e.insuranceExpiry)}</div>`}</td>
        <td>${insp === null ? '<span class="muted small">-</span>' : `<span class="badge ${insp < 0 ? 'red' : insp <= 30 ? 'amber' : 'gray'}">${insp < 0 ? `${Math.abs(insp)}일 경과` : `${insp}일 남음`}</span><div class="tiny muted">${esc(e.inspectionExpiry)}</div>`}</td>
        <td>${saf ? `<span class="badge ${saf.sum.status === 'risk' ? 'red' : saf.sum.status === 'ok' ? 'green' : 'amber'}" title="${esc(saf.row.company || '')}">${esc(saf.sum.label)}</span><div class="tiny muted">${saf.sum.completion}% 완료</div>` : '<span class="muted small">미등록</span>'}</td>
        <td><span class="badge ${e.status === 'active' ? 'green' : e.status === 'maintenance' ? 'amber' : 'gray'}">${e.status === 'active' ? '가동' : e.status === 'maintenance' ? '정비' : e.status === 'pending' ? '확인 필요' : '휴차'}</span></td>
        <td>${planAccess?`<a class="btn btn-sm btn-ghost" data-vehicle-safety href="#/vehicle-safety?plans=1&vehicle=${encodeURIComponent(e.id)}" data-link>계획서 확인·다운로드</a>`:''}${vehicleSafetyBlock(e,todayStr())?`<span class="badge red" title="${esc(vehicleSafetyBlock(e,todayStr()))}">안전 확인 필요</span>`:''}<button class="icon-btn" data-edit="${e.id}">${icon('edit')}</button></td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-fleet-link]').forEach(a=>a.addEventListener('click',e=>e.stopPropagation()));
    tbody.querySelectorAll('[data-vehicle-safety]').forEach(a=>a.addEventListener('click',e=>e.stopPropagation()));
    tbody.querySelectorAll('[data-card]').forEach(button=>button.onclick=async event=>{event.stopPropagation();try{await openEquipmentCard(state.equipment.find(e=>e.id===button.dataset.card));}catch(e){toast(e.message,'error');}});
    if(!editable)tbody.querySelectorAll('[data-edit]').forEach(button=>button.hidden=true);
    tbody.querySelectorAll('tr[data-id]').forEach((tr) => tr.onclick = () => {
      const e = state.equipment.find((x) => x.id === tr.dataset.id);
      if (e) {if(editable)openEditor(e);else openEquipmentCard(e).catch(error=>toast(error.message,'error'));}
    });
  };

  function openEditor(e = null) {
    if(!editable)return toast('장비 정보 변경은 관리자에게 요청하세요.','warn');
    const d = e || { plateNo: '', type: '', structure:'', model: '', capacity: 0, driverId: '', driverName: '', insuranceExpiry: '', inspectionExpiry: '', status: 'pending', memo: '' };
    const saf = e ? safetyFor(e) : null;
    openModal({
      title: e ? '차량 수정' : '차량 추가',
      sub: '장비 구조·용도와 적재량을 별도로 관리합니다. 원본 톤급은 참고 정보로 보존합니다.',
      size: 'wide',
      body: `${saf ? `<div class="insight" style="margin-bottom:12px">${icon('shield')}<div><b>안전점검 연동</b> · ${esc(saf.row.company || '')} · ${esc(saf.sum.label)} · 완료율 ${saf.sum.completion}% <a class="link" href="#/safety?plate=${encodeURIComponent(d.plateNo)}" data-link>상세 →</a></div></div>` : ''}<div class="form-grid">
        ${field('차량번호', `<input class="input" id="e-plate" value="${esc(d.plateNo)}" placeholder="경기12가3456">`, { req: true })}
        ${field('장비 구조·용도', `<select class="select" id="e-type"><option value="">확인 필요</option>${TYPES.map((t) => `<option ${t === equipmentStructure(d) ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
        ${field('제작사명', `<input class="input" id="e-manufacturer" aria-label="제작사명" maxlength="120" value="${esc(d.manufacturer??d.registration?.fields?.manufacturer??d.sourceRoster?.manufacturer??'')}" placeholder="예: 현대자동차, 타타대우, 볼보">`)}
        ${field('모델 / 원본 참고 제원', `<input class="input" id="e-model" value="${esc(d.model)}" placeholder="현대 파비스 등 원본 모델·제원">`)}
        ${field('적재량 구분', `<select class="select" id="e-capacity-category"><option value="unset">미설정</option>${CAPACITY_CATEGORIES.map(([v,l])=>`<option value="${v}" ${v===capacityCategory(d.capacity)?'selected':''}>${l}</option>`).join('')}${capacityCategory(d.capacity)==='review'?'<option value="review" selected>기존 적재량 유지 · 분류 확인 필요</option>':''}</select>`)}
        <div id="e-capacity-actual-wrap" ${capacityCategory(d.capacity)==='7plus'?'':'hidden'}>${field('실제 적재 가능 대수 (7대 이상)', `<input class="input" type="number" id="e-cap" min="7" max="50" step="1" value="${Number(d.capacity)>=7?d.capacity:''}" placeholder="예: 8">`)}<p class="small muted">배차 한도는 실제 대수로 적용합니다.</p></div>
        ${field('가능 상품분류 (쉼표 구분)', `<input class="input" id="e-classes" value="${esc((d.supportedClasses || []).join(', '))}" placeholder="세단, SUV">`)}
        ${field('허용 적재중량 (kg, 미입력 시 제한 없음)', `<input class="input" type="number" id="e-loadkg" min="0" value="${d.maxLoadKg || ''}">`)}
        ${field('배정 기사', `<input class="input" id="e-driver-search" type="search" aria-label="배정 기사 검색" placeholder="기사 이름 또는 차량번호 검색" autocomplete="off" aria-controls="e-driver"><p class="tiny muted" style="margin:6px 0">이름순 정렬 · 한글 가나다 / 영문 ABC</p><select class="select" id="e-driver" size="5" style="height:auto;width:100%" aria-label="배정 기사 선택" aria-describedby="e-driver-count"></select><p class="tiny muted" id="e-driver-count" role="status" style="margin:6px 0"></p>`)}
        ${field('상태', `<select class="select" id="e-status"><option value="pending" ${d.status === 'pending' ? 'selected' : ''}>확인 필요</option><option value="active" ${d.status === 'active' ? 'selected' : ''}>가동</option><option value="maintenance" ${d.status === 'maintenance' ? 'selected' : ''}>정비</option><option value="idle" ${d.status === 'idle' ? 'selected' : ''}>휴차</option></select>`)}
        ${field('보험 만료일', `<input class="input" type="date" id="e-ins" value="${esc(d.insuranceExpiry)}">`)}
        ${field('검사 만료일', `<input class="input" type="date" id="e-insp" value="${esc(d.inspectionExpiry)}">`)}
        ${field('메모', `<textarea class="textarea" id="e-memo" placeholder="정비 이력, 특이사항">${esc(d.memo)}</textarea>`, { full: true })}
      <div class="field full"><details id="e-crew-details"><summary><b>승무 변경 기록 (기사 변경 시 필수)</b></summary><label>승무 변경일<input class="input" id="e-crew-date" type="date" value="${todayStr()}" max="${todayStr()}"></label><label>변경 사유<input class="input" id="e-crew-reason" maxlength="500" placeholder="차량 교체, 매입, 대체 승무 등"></label><p class="small muted">선택한 기사의 기존 차량 연결도 함께 정리하고 이력을 보존합니다. 과거 배차와 제출한 계획서는 유지됩니다.</p></details></div>${operationProfileFields(d)}</div>${crewHistoryView(d.crewHistory)}${equipmentSafetyFields(d,saf?.row)}<p id="e-save-status" role="status" aria-live="polite" style="white-space:pre-wrap"></p>`,
      foot: `${e ? '<button class="btn btn-danger" id="e-del" style="margin-right:auto">삭제</button>' : ''}<button class="btn btn-ghost" data-close>취소</button><button class="btn btn-primary" id="e-save">저장</button>`,
      onMount(el, close) {
        let applied=false;
        const driverSelect=el.querySelector('#e-driver'),driverSearch=el.querySelector('#e-driver-search');
        const driverOrder=new Intl.Collator('ko',{numeric:true,sensitivity:'base'});
        const drivers=[...state.drivers].sort((a,b)=>driverOrder.compare(a.name||'',b.name||'')||driverOrder.compare(a.vehicleNo||'',b.vehicleNo||'')||String(a.id).localeCompare(String(b.id)));
        const searchKey=value=>String(value||'').normalize('NFC').replace(/\s+/g,'').toLocaleLowerCase();
        let selectedDriverId=d.driverId||'';
        const renderDrivers=()=>{
          const q=searchKey(driverSearch.value),matches=drivers.filter(x=>!q||searchKey(x.name).includes(q)||searchKey(x.vehicleNo).includes(q));
          const current=drivers.find(x=>x.id===selectedDriverId);
          const keep=selectedDriverId&&!matches.some(x=>x.id===selectedDriverId)?`<optgroup label="현재 선택 유지"><option value="${esc(selectedDriverId)}" selected>${esc(current?`${current.name} (${current.vehicleNo||'차량 미지정'})`:`${d.driverName||'기존 기사'} (명부 연결 확인 필요)`)}</option></optgroup>`:'';
          driverSelect.innerHTML=optionList(matches.map(x=>({value:x.id,label:`${x.name} (${x.vehicleNo||'차량 미지정'})`})),selectedDriverId,'미배정')+keep;
          driverSelect.value=selectedDriverId;
          el.querySelector('#e-driver-count').textContent=`${q?'검색 결과':'전체'} ${matches.length}명`+(q&&!matches.length?' · 일치하는 기사가 없습니다.':'')+(keep?' · 기존 선택을 유지합니다.':'');
        };
        driverSearch.oninput=renderDrivers;
        driverSelect.onchange=()=>{selectedDriverId=driverSelect.value;el.querySelector('#e-crew-details').open=selectedDriverId!==(d.driverId||'');renderDrivers();};
        renderDrivers();
        el.querySelector('#e-capacity-category').onchange=()=>{el.querySelector('#e-capacity-actual-wrap').hidden=el.querySelector('#e-capacity-category').value!=='7plus';};
        el.querySelector('#e-save').onclick = async () => {
          const button=el.querySelector('#e-save'),saveStatus=el.querySelector('#e-save-status');if(button.disabled)return;button.disabled=true;saveStatus.textContent='입력 내용 확인 중…';
          try{
          if(!applied){
          const plateNo = el.querySelector('#e-plate').value.trim();
          if (!plateNo) throw Error('차량번호를 입력하세요.');
          const structure=el.querySelector('#e-type').value;if(!TYPES.includes(structure)&&!(e&&!structure&&!equipmentStructure(e)))throw Error('장비 구조·용도를 선택하세요.');
          let capacity;try{capacity=capacityFromSelection(el.querySelector('#e-capacity-category').value,el.querySelector('#e-cap').value,d.capacity);}catch(error){throw error;}
          const driverId = el.querySelector('#e-driver').value;
          const driver = state.drivers.find((x) => x.id === driverId);
          await saveEquipment({
            ...(e || {}),
            equipmentSafety:readEquipmentSafety(el),operationProfile:readOperationProfile(el),
            plateNo,
            structure, type:structure==='세이프티로더'?'세이프티로더':'카캐리어',
            manufacturer:el.querySelector('#e-manufacturer').value.trim(),
            model: el.querySelector('#e-model').value.trim(),
            capacity,
            supportedClasses: el.querySelector('#e-classes').value.split(',').map(s=>s.trim()).filter(Boolean), maxLoadKg: Math.max(0,num(el.querySelector('#e-loadkg').value)),
            driverId,crewChange:{effectiveDate:el.querySelector('#e-crew-date').value,reason:el.querySelector('#e-crew-reason').value.trim()},
            driverName: driver?.name || (driverId===(d.driverId||'')?d.driverName||'':''),
            status: el.querySelector('#e-status').value,
            insuranceExpiry: el.querySelector('#e-ins').value,
            inspectionExpiry: el.querySelector('#e-insp').value,
            memo: el.querySelector('#e-memo').value.trim(),
          });
          applied=true;for(const field of el.querySelectorAll('input,textarea,select'))field.disabled=true;
          }
          saveStatus.textContent='입력 내용 보관 완료 · 서버 저장 확인 중…';
          await confirmEquipmentSync();
          close();
          toast(supabaseMode()?'차량 정보의 서버 저장을 확인했습니다. 안전작업계획서는 최신정보를 반영한 뒤 다시 저장하세요.':'차량 정보를 이 PC에 저장했습니다.', 'success',8000);
          renderEquipment(view);
          }catch(error){saveStatus.textContent=error.message;saveStatus.style.color='var(--danger,#b42318)';toast(error.message,'error',8000);button.textContent=applied?'서버 저장 다시 확인':'저장';}finally{button.disabled=false;}
        };
        if (e) el.querySelector('#e-del').onclick = async () => {
          if (!(await confirmBox(`${e.plateNo} 차량을 삭제할까요?`, { title: '차량 삭제', ok: '삭제', danger: true }))) return;
          try{if(supabaseMode())await ensureWorkspaceStores(['dispatch','assignments','drivers','safety','meta']);await deleteEquipment(e.id);await confirmEquipmentSync();}catch(error){return toast(error.message,'error',8000);}
          close();
          toast('삭제했습니다.', 'success');
          renderEquipment(view);
        };
      },
    });
  }

  $('#btn-fleet-import').onclick=()=>openFleetManager(()=>renderEquipment(view),{registerMissing:true});
  $('#btn-safety-import').onclick = () => {
    const companies = [...new Set(state.safety.map((r) => r.company).filter(Boolean))];
    const active = state.safety.filter((r) => r.active);
    openModal({
      title: '안전점검 차량을 운송차량에 반영',
      sub: '안전점검 목록의 차량번호를 기준으로 운송차량을 생성합니다. 이미 등록된 차량은 건드리지 않습니다.',
      body: `<div class="form-grid">
        ${field('운송사', `<select class="select" id="si-company">${companies.map((c) => `<option value="${esc(c)}" ${c === 'M&M' ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`)}
        ${field('대상', `<label class="check" style="height:34px"><input type="checkbox" id="si-active" checked> 운행 중인 차량만</label>`)}
      </div>
      <div class="insight" style="margin-top:12px">${icon('info')}<div>현재 안전점검 <b>${nf(state.safety.length)}대</b> · 운행 <b>${nf(active.length)}대</b> · 등록 차량 <b>${nf(state.equipment.length)}대</b>. 차량번호가 같은 기존 운송차량은 유지됩니다.</div></div>`,
      foot: `<button class="btn btn-ghost" data-close>취소</button><button class="btn btn-primary" id="si-go">${icon('check')} 반영</button>`,
      onMount(el, close) {
        el.querySelector('#si-go').onclick = async () => {
          const company = el.querySelector('#si-company').value;
          const onlyActive = el.querySelector('#si-active').checked;
          close();
          const res = await importEquipmentFromSafety(state.safety, { company, onlyActive });
          toast(`안전점검 차량 ${nf(res.created)}대를 운송차량에 등록했습니다.${res.skipped ? ` (${nf(res.skipped)}대 기존 등록)` : ''}`, 'success', 5000);
          renderEquipment(view);
        };
      },
    });
  };
  $('#btn-add').onclick = () => openEditor();
  $('#btn-export').onclick = () => {
    const rows = [['차량번호', '장비 구조·용도', '모델 / 원본 참고', '적재량 구분', '실제 적재 가능 대수', '기사', '보험만료', '검사만료', '상태', '메모']];
    for (const e of filteredRows) rows.push([e.plateNo, equipmentStructure(e), e.model, capacityLabel(e.capacity), e.capacity, e.driverName, e.insuranceExpiry, e.inspectionExpiry, e.status, e.memo]);
    exportXlsx({ 운송차량: rows }, 'M&M_운송차량.xlsx');
  };
  $('#f-q').addEventListener('input', debounce((ev) => { ui.q = ev.target.value; renderRows(); }, 180));
  $('#f-structure').onchange=e=>{ui.structure=e.target.value;renderRows();};
  $('#f-capacity').onchange=e=>{ui.capacity=e.target.value;renderRows();};
  $('#f-operation').onchange=ev=>{ui.operation=ev.target.value;renderRows();};
  $('#f-status').addEventListener('change', (ev) => { ui.status = ev.target.value; renderRows(); });
  view.querySelector('#f-attention')?.addEventListener('change',event=>{ui.attention=event.target.value;renderRows();});
  renderRows();
}
