import {evaluationMonthRange} from '../../core/evaluation-period.js';
import {OPERATIONS,departmentMatch} from '../../core/operation-profile.js';
import {driverQualificationFields,collectDriverQualifications,driverQualificationSummary} from '../driver-qualification-fields.js';
import {crewHistoryView} from '../crew-history-view.js';
import {operationProfileFields,readOperationProfile,operationBadge} from '../operation-profile-fields.js';
import {canImportContacts} from '../../core/driver-contact-store.js';
import {openContactImport} from './driver-contact-import-ui.js';
import {createFleetLinks} from '../../core/operating-status.js';
import {ensureWorkspaceStores,ensureReferenceHistory,confirmSupabaseSaved,retrySupabase} from '../../core/supabase-cloud.js';
import {canOpenPage} from '../../core/workspace-access.js';
import {workspaceProfile,supabaseMode} from '../../core/supabase-session.js';
import {performancePanel} from '../performance-summary.js';
import {openDriverReviews} from '../driver-reviews.js';
import { fleetClass, fleetUsage, parseFleetRoster, previewFleetRoster, applyFleetRoster, setFixedCharter, FLEET_LABELS } from '../../core/fleet.js';
import { getSetting } from '../../core/db.js';
import {
  $, $$, esc, icon, nf, num, str, norm, normalizePlate, openModal, openDrawer, confirmBox, toast,
  exportXlsx, debounce, unique, shortDate, gradeOf, timeAgo, todayStr, round, readFile,
} from '../../core/utils.js';
import { state, saveDriver, deleteDriver, driversFromDispatch, registerDriversFromDispatch, driverByName, reloadAll, saveSettings } from '../../core/data.js';
import { evaluate, periodRange, METRIC_LABELS } from '../../core/evaluation.js';
import { pageHead, searchInput, kpi, sectionHead, metricBars, gradePill, field, banner } from '../components.js';

import {canCheckUsage,openUsageEditor,usageSummary} from '../system-use.js';
import { scheduleLabel } from '../../core/schedule.js';
import {referenceList,referenceSheet} from '../../core/dispatch-reference-store.js';
import {metroRoster,rosterMonth,rosterSheets} from '../../core/metro-fixed.js';

const REGIONS = ['서울', '경기', '인천', '강원', '충청', '경상', '대구', '부산', '전라', '광주', '제주'];

import {closingContactAccess} from '../../core/closing-contacts.js';
import {openClosingContact} from '../closing-contacts.js';
export default function renderDrivers(view,ctx={}) {
  const fleetLinks=createFleetLinks(state.drivers,state.equipment),initialQuery=ctx.params?.get('q')||new URLSearchParams(location.hash.split('?')[1]).get('q')||'';
  const canReadMetro=supabaseMode()&&canOpenPage(workspaceProfile()?.role,'dispatch-reference');
  const ui = { q: initialQuery, status: initialQuery?'':'active', fleet:'', department:'', metro:false };
  let metroIds=new Set();
  const vehicleLink=(plate,label=plate)=>!supabaseMode()||canOpenPage(workspaceProfile()?.role,'equipment')?`<a class="link" href="#/equipment?q=${encodeURIComponent(plate)}">${esc(label)}</a>`:esc(label);
  const range = evaluationMonthRange(todayStr().slice(0,7));
  const ev = evaluate(range);
  const scoreMap = new Map(ev.results.filter(r=>r.driverId).map((r) => [r.driverId, r]));

  view.innerHTML = `
    ${pageHead('기사 관리', '기사 정보와 선호 권역, 평가등급, 사고 이력을 함께 관리합니다.', `
      <button class="btn btn-primary" id="btn-period-review">실적·정기 평가</button><button class="btn btn-primary" id="btn-fleet">용차 분류·명단 관리</button><a class="btn btn-ghost" href="#/schedule" data-link>기사 스케줄 · 가용 현황</a>
      <button class="btn btn-ghost" id="btn-auto">${icon('refresh')} 배차판에서 자동 등록</button>
      ${canImportContacts()?'<button class="btn btn-primary" id="btn-contact-import">연락처 엑셀 업로드</button>':''}
      <button class="btn btn-ghost" id="btn-export">${icon('download')} 내보내기</button>
      <button class="btn btn-primary" id="btn-add">${icon('plus')} 기사 추가</button>`)}
    <div class="grid grid-4" style="margin-bottom:14px">
      ${kpi({ label: '등록 기사', value: nf(state.drivers.length), unit: '명', iconName: 'users', foot: `활동 <b>${nf(state.drivers.filter((d) => d.status === 'active').length)}</b>명` })}
      ${kpi({ label: '평가 평균', value: `${ev.summary.avgScore}`, unit: '점', iconName: 'chart', foot: `이번 달 · ${nf(ev.summary.activeDrivers)}명` })}
      ${kpi({ label: 'A등급 이상', value: nf(ev.summary.distribution.S + ev.summary.distribution.A), unit: '명', iconName: 'target', tone: 'good', foot: `S ${ev.summary.distribution.S} · A ${ev.summary.distribution.A}` })}
      ${kpi({ label: '사고·클레임', value: nf(ev.summary.incidents), unit: '건', iconName: 'alert', tone: ev.summary.incidents ? 'warn' : '', foot: `비용 ${nf(ev.summary.incidentCost / 10000)}만원` })}
    </div>
    <div class="toolbar" style="margin-bottom:12px">
      ${searchInput('f-q', '이름·연락처·차량번호 검색',ui.q)}
      ${canReadMetro?`<select class="select select-sm" id="f-metro" aria-label="수도권 고정 기사 필터" disabled><option value="">전체 운영 구분</option><option value="metro">수도권 고정 기사</option></select><a class="btn btn-ghost btn-sm" href="#/dispatch-reference?tab=people">수도권 고정 명단</a><span class="small muted" id="f-metro-status" role="status">순번표 확인 중…</span>`:''}
      <select class="select select-sm" id="f-status">
        <option value="active">활동 중</option>
        <option value="">전체</option>
        <option value="inactive">비활동</option>
      </select>
      <select class="select select-sm" id="f-fleet"><option value="">전체 용차 구분</option>${Object.entries(FLEET_LABELS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><select class="select select-sm" id="f-operation" aria-label="주력·지원 부서 필터"><option value="">전체 주력·지원 부서</option>${Object.entries(OPERATIONS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><div style="flex:1"></div>
      <span class="small muted" id="cnt"></span>
    </div>
    <div class="table-wrap">
      <div class="table-scroll">
        <table class="data">
          <thead><tr>
            <th style="width:34px"></th><th>기사</th><th>연락처</th><th>차량번호</th><th>고용 유형 / 회사 구분</th>
            <th>선호 권역</th><th class="num">이번 달 / 편성</th><th>등급</th><th class="num">사고</th><th>상태</th><th style="width:44px"></th>
          </tr></thead>
          <tbody id="tbody"></tbody>
        </table>
      </div>
    </div>
    <div class="section">
      <div class="insight">${icon('info')}<div><b>평가 등급</b>은 이번 달 배차 실적(운송량·근무일수·효율·도착지/거래처 다양성·브랜드 참여)에서 사고·클레임 감점을 반영해 자동 계산됩니다. 확정 편성의 기사 배정을 실적에 반영하고, 회전은 VIN 행 수가 아닌 동일 회전 묶음으로 계산합니다. 참고 이력 포함 지표는 검토용이며 기본 등급과 구분합니다.</div></div>
    </div>
  `;

  $('#f-status').value=ui.status;
  $('#btn-period-review').onclick=()=>openDriverReviews();
  const renderRows = () => {
    const q = ui.q.trim().toLowerCase();
    let rows = state.drivers.filter((d) => (!ui.status || d.status === ui.status) && (!ui.fleet || fleetClass(d,state.equipment,state.settings.fleet).code===ui.fleet));
    if(ui.metro)rows=rows.filter(d=>metroIds.has(d.id));
    if(ui.department)rows=rows.filter(d=>departmentMatch(d,ui.department)||fleetLinks.driver(d).vehicles.some(e=>departmentMatch(e,ui.department)));
    if (q) rows = rows.filter((d) => `${d.name} ${d.phone} ${d.vehicleNo} ${d.type} ${(d.aliases || []).join(' ')}`.toLowerCase().includes(q));
    rows.sort((a, b) => {
      const sa = scoreMap.get(a.id)?.total || 0;
      const sb = scoreMap.get(b.id)?.total || 0;
      return sb - sa || a.name.localeCompare(b.name, 'ko');
    });
    $('#cnt').textContent = `${rows.length}명`;
    const tbody = $('#tbody');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="11"><div class="empty"><div class="icon">${icon('users')}</div><h4>기사가 없습니다</h4><p>기사를 추가하거나 배차판에서 자동 등록하세요.</p><button class="btn btn-primary" id="empty-add">${icon('plus')} 기사 추가</button></div></td></tr>`;
      $('#empty-add')?.addEventListener('click', () => openEditor());
      return;
    }
    tbody.innerHTML = rows.map((d) => {
      const s = scoreMap.get(d.id),linked=fleetLinks.driver(d);
      const rated=!!(s?.count||s?.usage.checked),grade=rated?s.grade:'-';
      return `<tr class="clickable" data-id="${d.id}">
        <td><span class="grade ${grade}" style="width:24px;height:24px;border-radius:7px">${grade}</span></td>
        <td><div class="t-title">${esc(d.name)}</div>${metroIds.has(d.id)?'<span class="badge blue">수도권 고정</span>':''}<div class="small">${operationBadge(d)}</div><div class="tiny muted">${esc(d.type)}${d.aliases?.length ? ` · 별칭 ${d.aliases.length}` : ''}</div></td>
        <td class="small num">${esc(d.phone || '-')}</td>
        <td class="mono small">${d.vehicleNo?vehicleLink(d.vehicleNo):'<span class="muted">명부 차량 미입력</span>'}${linked.vehicles.filter(e=>normalizePlate(e.plateNo)!==normalizePlate(d.vehicleNo)).map(e=>`<div>${vehicleLink(e.plateNo,'현황: '+e.plateNo)}</div>`).join('')}${linked.vehicles.map(e=>'<div style="margin:4px 0">'+operationBadge(e)+'</div>').join('')}${linked.issues.map(message=>`<div class="op-link-warning">${esc(message)}</div>`).join('')}</td>
        <td><span class="tag">${esc(d.type || '-')}</span><div class="small strong">${esc(fleetClass(d,state.equipment,state.settings.fleet).label)}</div></td>
        <td>${(d.preferred || []).slice(0, 3).map((r) => `<span class="tag" style="margin-right:3px">${esc(r)}</span>`).join('') || '<span class="muted small">-</span>'}</td>
        <td class="num"><b>${nf(s?.count || 0)}</b><span class="tiny muted">대</span><div class="tiny muted">${nf(s?.days || 0)}일 · 기록상 ${nf(s?.turns||0)}배차</div><div class="tiny muted">미확인 ${nf(s?.performance?.unclassifiedRecords||0)}건 · 회전당 ${s?.performance?.avgPerTrip??'-'}대</div></td>
        <td>${rated ? `<span class="strong">${s.total}</span><span class="tiny muted">점</span>` : '<span class="muted small">-</span>'}</td>
        <td class="num">${s?.incidents ? `<span class="badge red">${s.incidents}</span>` : '<span class="muted">0</span>'}</td>
        <td><span class="badge ${d.status === 'active' ? 'green' : 'gray'}">${d.status === 'active' ? '활동' : '비활동'}</span></td>
        <td><button class="icon-btn" data-edit="${d.id}" title="수정">${icon('edit')}</button></td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
      tr.onclick = (e) => {
        if (e.target.closest('[data-edit],a')) return;
        const d = state.drivers.find((x) => x.id === tr.dataset.id);
        if (d) openDriverDrawer(d);
      };
    });
    tbody.querySelectorAll('[data-edit]').forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); const d = state.drivers.find((x) => x.id === b.dataset.edit); if (d) openEditor(d); };
    });
  };

  function openDriverDrawer(d) {
    const s = scoreMap.get(d.id);
    const eq = state.equipment.filter((e) => e.driverId === d.id || normalizePlate(e.plateNo) === normalizePlate(d.vehicleNo));
    const inc = (s?.incidentList||[]).slice(0,5);
    const trips = (s?.recent || []).slice(0, 8);
    openDrawer({
      title: d.name,
      sub: `${d.type} · ${d.phone || '연락처 없음'}`,
      wide: true,
      body: `
        <div class="driver-hero">
          <div class="avatar-lg">${esc(d.name.slice(0, 1))}</div>
          <div class="info">
            <strong>${esc(d.name)}</strong>
            <small>${esc(d.vehicleNo || '차량 미지정')} · ${esc(d.type)} · 입사 ${d.joinedAt ? shortDate(d.joinedAt) : '-'}</small>
          </div>
          <div class="score">
            <b>${s?.count||s?.usage.checked?s.total:'-'}</b>
            <small>${s?.count||s?.usage.checked?`${s.grade}등급 · ${s.count}대 / ${s.days}일`:'운영 실적 확인 전'}</small>
          </div>
        </div>
        ${s ? `<div class="card card-pad" style="margin-top:14px">
          <div class="row-between" style="margin-bottom:10px"><strong style="font-size:12.5px">지표별 점수</strong><span class="tiny muted">이번 달 · 감점 ${s.penalty}</span></div>
          <div class="stack" style="gap:9px">${metricBars(s.subscores, ev.weights, METRIC_LABELS)}</div><p class="small muted">${usageSummary(s)} · 사고·클레임 예상 감점 ${s.incidentEstimate}점 (총점 미반영)</p>
        </div>` : ''}
        ${performancePanel(s?.performance,'운영 배차 · 확정 편성 반영')}${performancePanel(s?.historyPerformance,'참고 이력 포함 · 검토용(중복 제거)')}
        <div class="section">
          <div class="section-head"><h3>기본 정보</h3></div>
          <div class="grid grid-2" style="gap:0 18px">
            ${[...driverQualificationSummary(d),['연락처', d.phone || '-'], ['차량번호', d.vehicleNo || '-'], ['유형', d.type || '-'], ['차량 용차 구분', fleetClass(d,state.equipment,state.settings.fleet).label], ['상태', d.status === 'active' ? '활동' : '비활동'], ['선호 권역', (d.preferred || []).join(', ') || '-'], ['기피 권역', (d.avoid || []).join(', ') || '-'], ['별칭', (d.aliases || []).join(', ') || '-'], ['메모', d.memo || '-']].map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--line-2)"><span class="small muted">${k}</span><span class="small strong" style="text-align:right">${esc(v)}</span></div>`).join('')}
          </div>
        </div>
        ${eq.length ? `<div class="section"><div class="section-head"><h3>운송차량</h3></div>${eq.map((e) => `<div class="file-card" style="margin-bottom:6px"><div class="fi">${icon('truck')}</div><div class="meta"><strong>${esc(e.plateNo)} · ${esc(e.model)}</strong><small>${esc(e.type)} · 적재 ${e.capacity}대 · 보험 ${esc(e.insuranceExpiry || '-')} / 검사 ${esc(e.inspectionExpiry || '-')}</small></div></div>`).join('')}</div>` : ''}
        ${inc.length ? `<div class="section"><div class="section-head"><h3>최근 사고·클레임</h3><span class="hint">${s?.incidents || 0}건</span></div>${inc.map((i) => `<div class="file-card" style="margin-bottom:6px"><span class="badge ${i.type === '사고' ? 'red' : 'purple'}">${esc(i.type)}</span><div class="meta"><strong>${esc(i.description)}</strong><small>${shortDate(i.date)} · ${esc(i.severity)} · ${nf(i.cost)}원 · ${i.status === 'closed' ? '완료' : '진행'}</small></div></div>`).join('')}</div>` : ''}
        ${trips.length ? `<div class="section"><div class="section-head"><h3>최근 배차</h3></div>${trips.map((t) => `<div class="row" style="justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line-2);gap:8px"><div style="flex:1;min-width:0"><div class="small strong" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.destination || '-')}</div><div class="tiny muted">${shortDate(t.date)} · ${esc(t.customer || '')}</div></div><span class="tag">${nf(num(t.count) || 1)}대</span></div>`).join('')}</div>` : ''}
      `,
      foot: `${canCheckUsage()?'<button class="btn btn-ghost" id="driver-use">시스템 활용 확인</button>':''}<button class="btn btn-ghost" id="d-close">닫기</button><button class="btn btn-primary" id="d-period-review">실적·정기 평가</button><button class="btn btn-primary" id="d-edit">${icon('edit')} 수정</button>`,
      onMount(el, close) {
        if(canCheckUsage())el.querySelector('#driver-use').onclick=()=>{close();openUsageEditor(()=>renderDrivers(view,ctx),{driverId:d.id});};
        el.querySelector('#d-close').onclick = close;
        el.querySelector('#d-period-review').onclick=()=>{close();openDriverReviews(d.id);};
        el.querySelector('#d-edit').onclick = () => { close(); openEditor(d); };
      },
    });
  }

  function openEditor(d = null) {
    const data = d || { name: '', phone: '', vehicleNo: '', type: '개별', status: 'active', preferred: [], avoid: [], aliases: [], joinedAt: todayStr(), memo: '' };
    const currentFleet=fleetClass(data,state.equipment,state.settings.fleet);
    const editFleet=!!d&&!!currentFleet.code&&(!supabaseMode()||workspaceProfile()?.role==='admin');
    const prefSet = new Set(data.preferred || []);
    const avoidSet = new Set(data.avoid || []);
    const { el, close } = openModal({
      title: d ? '기사 수정' : '기사 추가',
      sub: '선호 권역은 가배차 추천에 직접 반영됩니다.',
      size: 'wide',
      body: `
        <div class="form-grid">
          ${field('기사 이름', `<input class="input" id="d-name" value="${esc(data.name)}" placeholder="예: 김민준">`, { req: true })}
          ${closingContactAccess()?field('매입 마감 이메일',d?'<button class="btn" type="button" id="d-closing-email">이메일 입력·수정</button>':'<span class="small muted">기사 등록 후 입력할 수 있습니다.</span>'):''}
          ${field('하차지 선호', `<select class="select" id="d-stop-pref"><option value="">미등록</option><option value="single" ${data.stopPreference==='single'?'selected':''}>단일 하차 선호</option><option value="multi" ${data.stopPreference==='multi'?'selected':''}>복수 하차 가능</option><option value="either" ${data.stopPreference==='either'?'selected':''}>무관</option></select>`)}
          ${field('연락처', `<input class="input" id="d-phone" value="${esc(data.phone)}" placeholder="010-0000-0000">`)}
          <p class="field full small muted">승무 변경: 장비 관리 → 차량 수정 → 배정 기사에서 변경일·사유를 입력하세요.</p>${crewHistoryView(data.vehicleHistory,'driver')}${field('차량번호', `<input class="input" id="d-vehicle" ${d?'readonly title="승무 변경은 장비 관리에서 변경일·사유와 함께 기록합니다."':''} value="${esc(data.vehicleNo)}" placeholder="경기12가3456">`)}
          ${field('고용 유형', `<select class="select" id="d-type">${['개별', '협력', '직영', '용차'].map((t) => `<option ${t === data.type ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
          ${field('차량 용차 구분', editFleet?`<select class="select" id="d-fleet-class">${Object.entries(FLEET_LABELS).map(([code,label])=>`<option value="${code}" ${currentFleet.code===code?'selected':''}>${esc(label)}</option>`).join('')}</select>`:`<strong>${esc(currentFleet.label)}</strong>`,{help:d?(editFleet?'연결 차량의 운영 명단에 반영됩니다.':currentFleet.code?'관리자가 변경할 수 있습니다.':'기사와 운송차량 연결을 확인하세요.'):'기사 등록·차량 연결 후 변경할 수 있습니다.'})}
          ${editFleet?'<label class="field full" style="display:none" id="d-fleet-reason-wrap">용차 구분 변경 사유<input class="input" id="d-fleet-reason" maxlength="300" placeholder="예: 고정 운행 계약 변경"></label>':''}
          ${field('숙련도 (1 초급 ~ 5 숙련)', `<input class="input" type="number" id="d-skill" min="1" max="5" value="${data.skillLevel || 1}">`)}
          ${field('출발지 거점', `<input class="input" id="d-base" value="${esc(data.baseOrigin || '')}" placeholder="배차 출발지와 같은 명칭">`)}
          ${field('가능 상품분류 (쉼표 구분)', `<input class="input" id="d-classes" value="${esc((data.supportedClasses || []).join(', '))}" placeholder="세단, SUV, 대형SUV">`)}
          ${field('운행 가능 시작', `<input class="input" type="time" id="d-from" value="${esc(data.availableFrom || '')}">`)}
          ${field('운행 가능 종료', `<input class="input" type="time" id="d-to" value="${esc(data.availableTo || '')}">`)}
          <div class="full insight">운행 스케줄: ${esc(scheduleLabel(data))} · 날짜별 출근·휴무는 ‘기사 스케줄’ 메뉴에서 설정하세요.</div>
          ${field('입사일', `<input class="input" type="date" id="d-joined" value="${esc(data.joinedAt)}">`)}
          ${field('활동 상태', `<select class="select" id="d-status"><option value="active" ${data.status === 'active' ? 'selected' : ''}>활동</option><option value="inactive" ${data.status !== 'active' ? 'selected' : ''}>비활동</option></select>`)}
          <div class="full">
            <label class="small strong" style="font-size:11px;color:var(--muted)">선호 권역</label>
            <div class="chips" style="margin-top:6px" id="pref-chips">${REGIONS.map((r) => `<button type="button" class="chip-toggle ${prefSet.has(r) ? 'on' : ''}" data-pref="${r}">${r}</button>`).join('')}</div>
          </div>
          <div class="full">
            <label class="small strong" style="font-size:11px;color:var(--muted)">기피 권역</label>
            <div class="chips" style="margin-top:6px" id="avoid-chips">${REGIONS.map((r) => `<button type="button" class="chip-toggle ${avoidSet.has(r) ? 'on' : ''}" data-avoid="${r}">${r}</button>`).join('')}</div>
          </div>
          ${field('배차판 별칭', `<input class="input" id="d-aliases" value="${esc((data.aliases || []).join(', '))}" placeholder="예: 김민준개별, 김민준(경기)">`, { full: true, help: '쉼표로 구분 · 배차판의 운전자명과 자동 매칭됩니다.' })}
          ${operationProfileFields(data)}
          ${driverQualificationFields(data)}
          ${field('메모', `<textarea class="textarea" id="d-memo" placeholder="특이사항, 자격, 담당 노선 등">${esc(data.memo)}</textarea>`, { full: true })}
        </div>`,
      foot: `${d ? '<button class="btn btn-danger" id="d-del" style="margin-right:auto">삭제</button>' : ''}
        <p id="d-save-status" role="status" style="flex-basis:100%;margin:0"></p><button class="btn btn-ghost" data-close>닫기</button><button class="btn btn-primary" id="d-save">저장</button>`,
      onMount(_el, _close) {
        const fleetSelect=_el.querySelector('#d-fleet-class'),reasonWrap=_el.querySelector('#d-fleet-reason-wrap');
        if(fleetSelect)fleetSelect.onchange=()=>{reasonWrap.style.display=fleetSelect.value===currentFleet.code?'none':'';};
        const emailButton=_el.querySelector('#d-closing-email');
        if(emailButton)emailButton.onclick=()=>openClosingContact('driver',d,()=>toast('매입 마감 이메일을 저장했습니다.','success'));
        _el.querySelectorAll('[data-pref]').forEach((b) => b.onclick = () => { b.classList.toggle('on'); prefSet.has(b.dataset.pref) ? prefSet.delete(b.dataset.pref) : prefSet.add(b.dataset.pref); });
        _el.querySelectorAll('[data-avoid]').forEach((b) => b.onclick = () => { b.classList.toggle('on'); avoidSet.has(b.dataset.avoid) ? avoidSet.delete(b.dataset.avoid) : avoidSet.add(b.dataset.avoid); });
        let applied=false;
        _el.querySelector('#d-save').onclick = async () => {
          const button=_el.querySelector('#d-save'),status=_el.querySelector('#d-save-status');
          if(button.disabled)return;button.disabled=true;
          try{
          if(!applied){
          const name = _el.querySelector('#d-name').value.trim();
          if (!name) throw Error('기사 이름을 입력하세요.');
          const dup = state.drivers.find((x) => norm(x.name) === norm(name) && x.id !== d?.id);
          if (dup) throw Error('같은 이름의 기사가 이미 있습니다. 별칭을 사용하세요.');
          await saveDriver({
            ...(d || {}),
            name,
            skillLevel: num(_el.querySelector('#d-skill').value), baseOrigin: _el.querySelector('#d-base').value.trim(), supportedClasses: _el.querySelector('#d-classes').value.split(',').map(s=>s.trim()).filter(Boolean), availableFrom: _el.querySelector('#d-from').value, availableTo: _el.querySelector('#d-to').value,
            operationProfile: readOperationProfile(_el),
            qualifications: collectDriverQualifications(_el),
            phone: _el.querySelector('#d-phone').value.trim(),
            vehicleNo: _el.querySelector('#d-vehicle').value.trim(),
            type: _el.querySelector('#d-type').value,
            joinedAt: _el.querySelector('#d-joined').value,
            status: _el.querySelector('#d-status').value,
            stopPreference: _el.querySelector('#d-stop-pref').value,
            preferred: [...prefSet],
            avoid: [...avoidSet],
            aliases: _el.querySelector('#d-aliases').value.split(',').map((s) => s.trim()).filter(Boolean),
            memo: _el.querySelector('#d-memo').value.trim(),
          },fleetSelect&&fleetSelect.value!==currentFleet.code?{from:currentFleet.code,to:fleetSelect.value,plate:currentFleet.plate,reason:_el.querySelector('#d-fleet-reason').value}:null);
          applied=true;for(const field of _el.querySelectorAll('input,select,textarea,[data-pref],[data-avoid],#d-del'))field.disabled=true;
          }else if(supabaseMode())await retrySupabase();
          status.textContent='입력을 보관했습니다. 서버 저장 확인 중…';
          if(supabaseMode())await confirmSupabaseSaved();
          _close();
          toast(supabaseMode()?'기사 정보의 서버 저장을 확인했습니다.':'기사 정보를 이 PC에 저장했습니다.', 'success');
          renderDrivers(view);
          }catch(error){status.textContent=error.message;status.style.color='var(--danger,#b42318)';button.textContent=applied?'서버 저장 다시 확인':'저장';}
          finally{button.disabled=false;}
        };
        if (d) _el.querySelector('#d-del').onclick = async () => {
          if (!(await confirmBox(`${d.name} 기사를 삭제할까요? 배차 이력은 유지됩니다.`, { title: '기사 삭제', ok: '삭제', danger: true }))) return;
          await deleteDriver(d.id);
          _close();
          toast('삭제했습니다.', 'success');
          renderDrivers(view);
        };
      },
    });
  }

  function openAutoRegister() {
    const unknown = driversFromDispatch();
    if (!unknown.length) return toast('배차판의 모든 기사가 이미 등록되어 있습니다.', 'success');
    const selected = new Set(unknown.map((u) => u.name));
    openModal({
      title: '배차판에서 기사 자동 등록',
      sub: `배차판에만 있는 운전자 ${unknown.length}명을 찾았습니다.`,
      size: 'wide',
      body: `<div class="stack" style="gap:6px;max-height:380px;overflow:auto">
        ${unknown.map((u) => `<label class="file-card" style="cursor:pointer">
          <input type="checkbox" data-name="${esc(u.name)}" checked style="width:15px;height:15px;accent-color:#1487c9">
          <span class="meta"><strong>${esc(u.name)}</strong><small>${nf(u.count)}대 · 최근 ${esc(u.lastDate)} · ${esc(u.plates.slice(0, 2).join(', ') || '차량 미상')}</small></span>
        </label>`).join('')}
      </div>
      <div class="tiny muted" style="margin-top:8px">등록 후 기사 관리에서 연락처·선호 권역을 보완하세요.</div>`,
      foot: `<button class="btn btn-ghost" data-close>취소</button><button class="btn btn-primary" id="auto-ok">선택 등록</button>`,
      onMount(el, close) {
        el.querySelectorAll('[data-name]').forEach((cb) => cb.onchange = () => { cb.checked ? selected.add(cb.dataset.name) : selected.delete(cb.dataset.name); });
        el.querySelector('#auto-ok').onclick = async () => {
          const n = await registerDriversFromDispatch([...selected]);
          close();
          toast(`${n}명을 등록했습니다.`, 'success');
          renderDrivers(view);
        };
      },
    });
  }

  $('#btn-contact-import')?.addEventListener('click',()=>openContactImport(()=>renderDrivers(view,ctx)));
  $('#btn-add').onclick = () => openEditor();
  $('#btn-auto').onclick = openAutoRegister;
  $('#btn-export').onclick = () => {
    const rows = [['평가시작일','평가종료일','주력운영부서','운영팀','지원부서','회사 용차 구분', '이름', '연락처', '차량번호', '유형', '상태', '선호권역', '기피권역', '등급', '점수', '선택월운송', '근무일', '사고','기록상배차건수','회전당운송','편성미확인건수','회전확인률','한도기록적재율','시스템 활용 점수','확인 사용일','확인 미사용일','사고·클레임 예상 감점','참고포함운송(검토용)','참고포함배차(검토용)']];
    for (const d of state.drivers) {
      const s = scoreMap.get(d.id);
      rows.push([range.from,range.to,OPERATIONS[d.operationProfile?.primary]||'',d.operationProfile?.team||'',(d.operationProfile?.preferred||[]).map(k=>OPERATIONS[k]||k).join('/'),fleetClass(d,state.equipment,state.settings.fleet).label,d.name, d.phone, d.vehicleNo, d.type, d.status, (d.preferred || []).join('/'), (d.avoid || []).join('/'), s?.grade || '', s?.total || 0, s?.count || 0, s?.days || 0, s?.incidents || 0,s?.turns||0,s?.performance?.avgPerTrip??'',s?.performance?.unclassifiedRecords||0,s?.performance?.coverage||0,s?.performance?.utilization??'',s?.subscores.systemUse??'미확인',s?.usage.used||0,s?.usage.unused||0,s?.incidentEstimate||0,s?.historyPerformance?.units||0,s?.historyPerformance?.tripCount||0]);
    }
    exportXlsx({ 기사: rows }, 'M&M_기사목록.xlsx');
  };
  $('#f-q').addEventListener('input', debounce((e) => { ui.q = e.target.value; renderRows(); }, 180));
  $('#f-status').addEventListener('change', (e) => { ui.status = e.target.value; renderRows(); });

  $('#btn-fleet').onclick=()=>openFleetManager(()=>renderDrivers(view));
  $('#f-operation').onchange=e=>{ui.department=e.target.value;renderRows();};
  $('#f-fleet').onchange=e=>{ui.fleet=e.target.value;renderRows();};
  renderRows();
  if(canReadMetro){
    const filter=view.querySelector('#f-metro'),status=view.querySelector('#f-metro-status');
    filter.onchange=()=>{
      ui.metro=filter.value==='metro';
      if(ui.metro){ui.status='';view.querySelector('#f-status').value='';}
      renderRows();
    };
    (async()=>{
      const book=(await referenceList()).find(b=>b.kind==='metro'&&rosterSheets(b).length);
      if(!status.isConnected)return;
      if(!book){status.textContent='등록된 월별 순번표가 없습니다.';return;}
      const {name}=rosterSheets(book)[0],sheet=await referenceSheet(book.id,name);
      if(!status.isConnected)return;
      const members=metroRoster(sheet,state.drivers);
      metroIds=new Set(members.map(p=>p.driver?.id).filter(Boolean));filter.disabled=false;
      status.textContent=`${rosterMonth(name)} 명단 ${members.length}명 · 명부 연결 ${metroIds.size}명`;
      renderRows();
    })().catch(e=>{if(status.isConnected)status.textContent='순번표 조회 실패 · '+e.message;});
  }
}

export async function openFleetManager(onChanged,{registerMissing=false}={}) {
  try{if(supabaseMode())await ensureWorkspaceStores(registerMissing?['settings','drivers','equipment']:['settings','drivers','equipment','dispatch']);if(!registerMissing)await ensureReferenceHistory(p=>toast('용차 분석 이력 준비 '+p.loaded.toLocaleString()+'건','info',1200));}catch(e){toast(e.message,'warn');return;}
  const date=state.workdate || todayStr();let parsed=null,version=0;
  openModal({title:'용차 분류 · 운영 명단 관리',sub:'차량번호로 용차A·B를 연결하고, 그 외 용차C 중 고정용차를 별도 지정합니다.',size:'xwide',
    body:`<div class="insight"><b>분류 기준</b><br>용차A·B: 회사 운영 명단의 차량번호와 구분을 우선합니다. C: 명단 외 장비입니다. C 고정용차: 담당자가 사유와 함께 확정합니다. 기사 이름만 유사한 경우나 차량 변경은 자동 병합하지 않습니다.<br>고용 유형·평가 등급·출근 스케줄과 별도이며, 명단에서 빠졌다고 기존 A·B를 자동 강등하지 않습니다.</div><h4>운영 현황 명단 반영</h4><p class="small muted" id="fl-meta">현재 명단 기준일 ${esc(state.settings.fleet?.asOf || '미등록')} · ${(state.settings.fleet?.roster || []).length}대 · 공용 원장에 저장되어 직원들이 함께 사용합니다.</p><label>반영할 업무 <select class="select" id="fl-department"><option value="all">전체 운영 명단</option><option value="kgm">KGM 기사·차량만</option></select></label><input type="file" id="fl-file" accept=".xls,.xlsx"><div id="fl-preview" style="margin:14px 0"></div><div class="divider"></div><h4>용차C 고정용차 검토</h4><p class="small muted">검토 기준 기본값: 최근 90일 운송일 20일 이상 + 최근 30일 운송일 5일 이상. 아래에서 조정·저장할 수 있습니다. 한 회전의 여러 대수보다 실제 운행일을 우선하며, 후보일 뿐 자동 확정하지 않습니다.</p><div class="form-grid">${field('최근 90일 최소 운송일', `<input class="input" type="number" min="1" max="90" id="fl-days" value="${state.settings.fleet?.policy?.minDays || 20}">`)}${field('최근 30일 최소 운송일',`<input class="input" type="number" min="1" max="30" id="fl-recent" value="${state.settings.fleet?.policy?.recentDays || 5}">`)}</div><button class="btn btn-ghost" id="fl-policy">검토 기준 저장</button><p class="small muted">조회 기준일 ${esc(date)} · 차량번호 없는 이력은 빈도 산정에서 제외합니다. 기존 명단 분류는 현재 기준입니다.</p><div id="fl-usage"></div>`,
    foot:'<button class="btn btn-primary" data-close>닫기</button>',
    onMount(el) {
      const refresh=async()=>{const settings=await getSetting('settings',{});state.settings.fleet=settings.fleet || {};await reloadAll();el.querySelector('#fl-meta').textContent=`현재 명단 기준일 ${state.settings.fleet.asOf || '미등록'} · ${(state.settings.fleet.roster || []).length}대 · 공용 원장 반영 대상`;onChanged();};
      const usage=()=>{if(registerMissing){el.querySelector('#fl-usage').innerHTML='<p class="small muted">등록 작업에서는 대용량 운송 이력을 읽지 않습니다. 기존 고정용차 검토는 기사 관리에서 사용할 수 있습니다.</p>';return;}
        const minDays=Number(el.querySelector('#fl-days').value),recentDays=Number(el.querySelector('#fl-recent').value);
        if(!Number.isInteger(minDays)||minDays<1||minDays>90||!Number.isInteger(recentDays)||recentDays<1||recentDays>30)return;
        const rows=fleetUsage(state.dispatch,state.transportHistory,date,{minDays,recentDays});
        const byPlate=new Map(rows.map(r=>[r.plate,r]));
        for(const d of state.drivers) {const plate=normalizePlate(d.vehicleNo);if(plate&&!byPlate.has(plate))byPlate.set(plate,{plate,days:0,recent:0,count:0,names:[d.name],lastDate:'',candidate:false});}
        for(const [plate,f] of Object.entries(state.settings.fleet?.fixed || {}))if(f.enabled&&!byPlate.has(plate))byPlate.set(plate,{plate,days:0,recent:0,count:0,names:[],lastDate:'',candidate:false});
        const list=[...byPlate.values()].filter(r=>['C','CF'].includes(fleetClass({plateNo:r.plate},[],state.settings.fleet).code));
        el.querySelector('#fl-usage').innerHTML=`<div class="scroll-x" style="max-height:350px;overflow:auto"><table class="data"><thead><tr><th>차량 / 기사</th><th>현재 구분</th><th>90일 운송일 / 대수</th><th>30일 운송일</th><th>검토</th><th></th></tr></thead><tbody>${list.map(r=>{const c=fleetClass({plateNo:r.plate},[],state.settings.fleet);return `<tr><td>${esc(r.plate)}<div class="small muted">${r.names.map(esc).join(', ')}</div></td><td>${esc(c.label)}<div class="small muted">${esc(c.reason)}</div></td><td>${nf(r.days)}일 / ${nf(r.count)}대</td><td>${nf(r.recent)}일</td><td>${r.candidate?'빈도 기준 충족':'담당자 확인'}</td><td><button class="btn btn-sm btn-ghost" data-fixed="${esc(r.plate)}" data-enabled="${c.code!=='CF'}">${c.code==='CF'?'고정용차 해제':'고정용차 지정'}</button></td></tr>`;}).join('') || '<tr><td colspan="6">용차C 차량이 없습니다. 배차 이력이나 차량번호를 먼저 등록하세요.</td></tr>'}</tbody></table></div>`;
        el.querySelectorAll('[data-fixed]').forEach(b=>b.onclick=()=>{
          const enabled=b.dataset.enabled==='true',plate=b.dataset.fixed;
          openModal({title:`${plate} · 고정용차 ${enabled?'지정':'해제'}`,sub:'용차C 안에서만 적용하며 일일 회전 한도와 출근일은 변경하지 않습니다.',body:field('변경 사유','<input class="input" id="fl-fixed-reason" maxlength="300" placeholder="담당자 확인 사유">'),foot:'<button class="btn btn-ghost" data-close>취소</button><button class="btn btn-primary" id="fl-fixed-save">저장</button>',onMount(form,close){form.querySelector('#fl-fixed-save').onclick=async()=>{try{await setFixedCharter(plate,enabled,form.querySelector('#fl-fixed-reason').value);await refresh();usage();close();toast('고정용차 구분을 저장했습니다.','success');}catch(e){toast(e.message,'warn');}};}});
        });
      };
      el.querySelector('#fl-policy').onclick=async()=>{const minDays=Number(el.querySelector('#fl-days').value),recentDays=Number(el.querySelector('#fl-recent').value);if(!Number.isInteger(minDays)||minDays<1||minDays>90||!Number.isInteger(recentDays)||recentDays<1||recentDays>30)return toast('운송일 기준을 확인하세요.','warn');await saveSettings({fleet:{policy:{minDays,recentDays}}});toast('검토 기준을 저장했습니다.','success');};
      el.querySelector('#fl-days').oninput=usage;el.querySelector('#fl-recent').oninput=usage;usage();
      el.querySelector('#fl-department').onchange=()=>{parsed=null;el.querySelector('#fl-file').value='';el.querySelector('#fl-preview').textContent='범위를 선택한 뒤 파일을 선택하세요.';};
      el.querySelector('#fl-file').onchange=async e=>{
        const file=e.target.files?.[0],current=++version;parsed=null;const box=el.querySelector('#fl-preview');box.textContent='';if(!file)return;
        if(file.size>20*1024*1024){box.textContent='20MB 이하 명단을 선택하세요.';return;}
        try {
          const buffer=await readFile(file);if(current!==version)return;parsed=parseFleetRoster(buffer,file.name);if(el.querySelector('#fl-department').value==='kgm')parsed={...parsed,scope:'kgm'};if(!parsed.rows.length)throw Error('선택한 업무의 기사·차량 명단이 없습니다.');parsed.reviewCrewChanges=true;const expected=await previewFleetRoster(parsed);if(current!==version)return;
          box.innerHTML=`<p><b>${esc(file.name)}</b> · 기준일 ${esc(parsed.asOf)} · 용차A ${expected.selectedRows.filter(r=>r.grade==='A').length}대 · 용차B ${expected.selectedRows.filter(r=>r.grade==='B').length}대 · 관련 차량 이동 ${expected.relatedTransfers}대 · 원본 보류 ${parsed.held.length}건</p><p class="insight">미등록 기사·장비 등록 선택 시: 신규 기사 ${expected.summary.newDrivers}명 · 기존 기사 ${expected.summary.updatedDrivers}명 · 신규 장비 ${expected.summary.newEquipment}대 · 기존 장비 ${expected.summary.updatedEquipment}대 · 연결 보류 ${expected.held.length}건</p><p>기존 기사의 차량 이동은 원본의 새 차량까지 함께 검토합니다. 변경 이력은 별도로 보존하며 정확한 변경일은 미확인으로 기록합니다.</p><label class="check"><input type="checkbox" id="fl-crew-confirm">미리보기의 기사·차량 변경 및 관련 이동을 확인했습니다.</label>${expected.held.map(r=>`<p class="small">${esc(r.plate)} / ${esc(r.name)} · ${esc(r.reason)}</p>`).join('')}<div class="scroll-x" style="max-height:260px;overflow:auto"><table class="data"><thead><tr><th>구분</th><th>차량번호</th><th>기사</th><th>소속 / 운영부서</th><th>원본 차종</th></tr></thead><tbody>${expected.changes.filter(c=>c.store==='equipment').map(c=>c.after.sourceRoster).map(r=>`<tr><td>${esc(FLEET_LABELS[r.grade])}</td><td>${esc(r.plate)}</td><td>${esc(r.name)}</td><td>${esc(r.affiliation)} / ${esc(r.department)}</td><td>${esc(r.vehicleType)} / ${esc(r.manufacturer)}</td></tr>`).join('')}</tbody></table></div>${parsed.held.map(r=>`<p class="small">${esc(r.sheet || r.sourceSheet)} ${nf(r.row || r.sourceRow)}행 · ${esc(r.reason)}</p>`).join('')}<label class="check" style="margin:10px 0"><input type="checkbox" id="fl-register" ${registerMissing?'checked':''}>미등록 기사·장비도 등록 (기사: 출근일 별도 지정 / 장비: 가동 상태 확인 필요·적재 대수 미설정)</label><p class="small muted">이름·연락처·차량번호를 대조해 공통 명부에 연결합니다. 5톤·8.9톤 등은 대형트럭으로 분류하고 원문을 보존합니다. 기존 출근·적재·보험·검사·점검 내용은 유지하며, 새 항목은 미확인으로 둡니다. 다른 기사에게 연결된 차량·연락처 충돌은 보류합니다.</p><label class="check"><input type="checkbox" id="fl-confirm">현재 회사 명단이며 구분·차량번호를 확인했습니다.</label><button class="btn btn-primary" id="fl-apply" disabled>명단 구분 반영</button>`;
          el.querySelector('#fl-confirm').onchange=e=>el.querySelector('#fl-apply').disabled=!e.target.checked;
          el.querySelector('#fl-apply').onclick=async()=>{
            const b=el.querySelector('#fl-apply');b.disabled=true;el.querySelector('#fl-file').disabled=true;
            try {if(supabaseMode())await confirmSupabaseSaved();if(!el.querySelector('#fl-crew-confirm').checked)throw Error('기사·차량 변경 검토를 확인하세요.');const r=await applyFleetRoster(parsed,el.querySelector('#fl-register').checked);await refresh();if(supabaseMode())await confirmSupabaseSaved();box.innerHTML=`<p class="insight">명단 ${r.fleet.roster.length}대 반영 · 기존 기사 연결 ${r.matched}명 · 신규 기사 ${r.registered}명 · 신규 장비 ${r.equipment}대 · 기존 장비 ${r.equipmentUpdated||0}대 · 기사 연결 보류 ${r.held}건</p>${r.heldDetails.map(x=>`<p class="small">${esc(x.plate)} · ${esc(x.name)} · ${esc(x.reason)}</p>`).join('')}`;usage();toast('공통 기사·차량 명부의 서버 저장을 확인했습니다.','success');}
            catch(e){b.disabled=false;toast(e.message,'warn');}finally{el.querySelector('#fl-file').disabled=false;}
          };
        }catch(e){box.textContent=e.message;}
      };
    }
  });
}
