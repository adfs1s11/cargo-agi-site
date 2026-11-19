import {safetyFleet,safetyPlate} from '../../core/safety-fleet.js';
import {workspaceProfile,supabaseMode} from '../../core/supabase-session.js';
import {canOpenPage} from '../../core/workspace-access.js';
import {
  $, $$, esc, icon, nf, num, str, todayStr, readFile, openModal, openDrawer, confirmBox, toast,
  exportXlsx, debounce, dday, addDays,
} from '../../core/utils.js';
import { state, saveSafety, deleteSafety, commitSafety } from '../../core/data.js';
import {
  SAFETY_CHECKS, SAFETY_CHECK_LABELS, SAFETY_SCORE_CHECKS, SAFETY_SOURCE, safetyItem, safetySummary,
  safetySnapshot, parseSafetyWorkbook, toSafetyExportRow, SAFETY_EXPORT_HEADERS, newSafetyDraft,
} from '../../core/safety.js';
import { pageHead, searchInput, kpi, banner, field, sectionHead } from '../components.js';

export default function renderSafety(view, ctx = {}) {
  const params = ctx.params || new URLSearchParams();
  const ui = {
    q: '',
    company: '',
    body: '',
    age: '',
    status: '',
    split: window.innerWidth >= 1500,
    selectedId: null,
    plate: params.get('plate') || '',
  };
  const fleet = safetyFleet(state.equipment,state.safety,state.drivers);
  const planAccess=!supabaseMode()||canOpenPage(workspaceProfile()?.role,'vehicle-safety');
  const snapshot = safetySnapshot(fleet.map(r=>({...r,active:true})));
  snapshot.active=fleet.filter(r=>r.active).length;
  snapshot.inactive=fleet.length-snapshot.active;
  const unchecked=fleet.filter(r=>r.noSafetyRecord).length;
  const bodyTypes = [...new Set(fleet.map((r) => r.bodyType).filter(Boolean))].sort();
  const companies = [...new Set(fleet.map((r) => r.company).filter(Boolean))].sort();
  const ages = ['5년 이내', '6년~10년', '11년~15년', '16년 이상'];

  view.innerHTML = `
    ${pageHead('안전점검', '운송차량에 등록된 모든 차량을 자동으로 연결합니다. 차량별 점검 이력과 안전작업계획서를 확인하세요.', `
      <button class="btn btn-ghost" id="btn-export">${icon('download')} 내보내기</button>
      <button class="btn btn-primary" id="btn-import">${icon('upload')} 안전점검 업로드</button>`)}
    <div class="grid grid-6" style="margin-bottom:14px">
      ${kpi({ label: '등록 차량', value: nf(state.equipment.length), unit: '대', iconName: 'shield', foot: `전체 점검 대상 ${nf(fleet.length)}대 · 미점검 ${nf(unchecked)}대` })}
      ${kpi({ label: '운행 차량', value: nf(snapshot.active), unit: '대', iconName: 'truck', tone: 'good', foot: `미운행·확인불가 <b>${nf(snapshot.inactive)}</b>` })}
      ${kpi({ label: '미점검·확인 필요', value: nf(snapshot.pending), unit: '대', iconName: 'clock', tone: snapshot.pending ? 'warn' : '', foot: '미입력 점검 항목 포함' })}
      ${kpi({ label: '조치 필요', value: nf(snapshot.action), unit: '대', iconName: 'warning', tone: snapshot.action ? 'warn' : 'good', foot: '미설치·설치 예정' })}
      ${kpi({ label: '검사 임박', value: nf(snapshot.dueSoon), unit: '대', iconName: 'calendar', foot: '60일 이내 예정' })}
      ${kpi({ label: '평균 완료율', value: nf(snapshot.avgCompletion), unit: '%', iconName: 'target', foot: '전체 대상 · 5개 핵심 항목' })}
    </div>
    ${snapshot.pending || snapshot.action ? banner(`전체 점검 대상 <b>${nf(snapshot.total)}대</b> 중 확인 필요 <b>${nf(snapshot.pending)}대</b>, 조치 필요 <b>${nf(snapshot.action)}대</b>입니다. 점검 자료가 없는 차량은 미점검으로 표시합니다.`, 'warn') : ''}
    <div class="toolbar" style="margin-bottom:10px">
      ${searchInput('s-q', '차량번호·기사·운송사 검색')}
      <select class="select select-sm" id="s-company"><option value="">전체 운송사</option>${companies.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select>
      <select class="select select-sm" id="s-bodytype"><option value="">전체 차체</option>${bodyTypes.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select>
      <select class="select select-sm" id="s-age"><option value="">전체 연식</option>${ages.map((c) => `<option>${c}</option>`).join('')}</select>
      <select class="select select-sm" id="s-status">
        <option value="">전체 상태</option>
        <option value="unchecked">미점검 (기존 점검표 없음)</option><option value="unlinked">차량 연결 확인</option><option value="active">운행</option>
        <option value="inactive">미운행·확인불가</option>
        <option value="attention">확인·조치 필요</option>
        <option value="pending">확인중</option>
        <option value="risk">조치 필요</option>
        <option value="duesoon">검사 임박</option>
      </select>
      <div class="toolbar-spacer"></div>
      <button class="btn btn-sm btn-ghost" id="btn-split">${icon('split')} <span>분할</span></button>
      <span class="small muted" id="s-count"></span>
    </div>
    <div class="board-work ${ui.split ? 'with-side' : ''}" id="safety-work">
      <div class="board-panel">
        <div class="table-wrap">
          <div class="table-scroll board-scroll" id="safety-scroll">
            <table class="data board-table normal" id="safety-table">
              <thead><tr>
                <th style="width:48px" class="num">No</th>
                <th style="width:92px">운송사</th>
                <th style="width:128px">차량번호</th>
                <th style="width:174px">차체 / 연식</th>
                <th class="num" style="width:66px">적재중량(t)</th>
                <th style="width:94px">2층 낙하</th>
                <th style="width:94px">추락방지</th>
                <th style="width:94px">작업계획</th>
                <th style="width:104px">특장점검</th>
                <th style="width:104px">정기검사</th>
                <th style="width:64px">운행</th>
                <th style="width:82px">상태</th>
              </tr></thead>
              <tbody id="s-body"></tbody>
            </table>
          </div>
          <div class="table-foot" id="s-foot"></div>
        </div>
      </div>
      <aside class="board-side" id="safety-side"></aside>
    </div>
    <div class="section">
      <div class="section-head"><h3>차량 연동 안내</h3><a class="link" href="#/equipment" data-link>운송차량 관리 →</a></div>
      <div class="insight">${icon('info')}<div>운송차량을 등록·수정하면 이 목록에도 반영됩니다. 기존 점검표는 전체 차량번호가 일치하는 경우에만 연결합니다. <b>미점검</b>은 기존 점검표가 없다는 뜻이며 안전 적합 판정이 아닙니다. 차량별 상세에서 <b>점검 작성·이력</b>과 <b>안전작업계획서</b>를 별도로 확인하세요. 검사 만료일은 실제 점검 결과와 구분합니다.</div></div>
    </div>
  `;

  const filtered = () => {
    const q = ui.q.trim().toLowerCase();
    let rows = fleet.slice();
    if (ui.status === 'unchecked') rows=rows.filter(r=>r.noSafetyRecord);
    if (ui.status === 'unlinked') rows=rows.filter(r=>r.unlinked||r.linkIssue);
    if (ui.company) rows = rows.filter((r) => r.company === ui.company);
    if (ui.body) rows = rows.filter((r) => r.bodyType === ui.body);
    if (ui.age) rows = rows.filter((r) => r.ageBand === ui.age);
    if (ui.status === 'active') rows = rows.filter((r) => r.active);
    if (ui.status === 'inactive') rows = rows.filter((r) => !r.active);
    if (ui.status && ['attention', 'pending', 'risk', 'duesoon'].includes(ui.status)) {
      rows = rows.filter((r) => {
        const s = snapshot.summaries.get(r.id) || safetySummary(r);
        if (ui.status === 'attention') return s.attention > 0;
        if (ui.status === 'pending') return s.pending > 0;
        if (ui.status === 'risk') return s.risk > 0 || s.planned > 0;
        if (ui.status === 'duesoon') return s.dueSoon.length > 0;
        return true;
      });
    }
    if (q) rows = rows.filter((r) => `${r.plateNo} ${r.driverName||''} ${r.company} ${r.upfitter} ${r.bodyType} ${r.ownership} ${r.memo}`.toLowerCase().includes(q));
    rows.sort((a, b) => (num(a.no) || 0) - (num(b.no) || 0) || String(a.plateNo).localeCompare(String(b.plateNo), 'ko'));
    return rows;
  };

  const statusBadge = (item) => {
    const cls = item.code === 'risk' || item.code === 'overdue' ? 'red'
      : item.code === 'pending' || item.code === 'planned' || item.code === 'missing' || item.code === 'due' ? 'amber'
        : item.code === 'scheduled' ? 'blue'
          : item.code === 'na' ? 'gray' : 'green';
    return `<span class="badge ${cls}" title="${esc(item.detail || item.raw || '')}">${esc(item.label)}</span>`;
  };

  const renderRows = () => {
    const rows = filtered();
    $('#s-count').textContent = `${nf(rows.length)}대`;
    const tbody = $('#s-body');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="12"><div class="empty"><div class="icon">${icon('shield')}</div><h4>조건에 맞는 차량이 없습니다</h4><p>필터를 초기화하거나 운송차량 메뉴에서 차량 등록 상태를 확인하세요.</p></div></td></tr>`;
      $('#s-foot').innerHTML = '';
      renderSide(null);
      return;
    }
    tbody.innerHTML = rows.map((r) => {
      const s = snapshot.summaries.get(r.id) || safetySummary(r);
      const item = (key) => statusBadge(s.items.find((i) => i.key === key) || safetyItem(r, key));
      return `<tr class="clickable ${ui.selectedId === r.id ? 'selected' : ''}" data-id="${esc(r.id)}">
        <td class="num muted">${esc(r.no || '-')}</td>
        <td class="small">${esc(r.company || '-')}</td>
        <td><div class="t-title mono">${esc(r.plateNo)}</div><div class="tiny muted">${esc(r.driverName || r.ownership || '기사 미연결')}${r.linkIssue ? ' · '+esc(r.linkIssue) : ''}</div></td>
        <td><div class="small">${esc(r.bodyType || '-')}</div><div class="tiny muted">${esc(r.year || '-')}년 · ${esc(r.ageBand || '-')}</div></td>
        <td class="num">${r.tonnage ? `${nf(r.tonnage)}t` : '-'}<div class="tiny muted">${r.capacity?nf(r.capacity)+'대':'미설정'}</div></td>
        <td>${item('deckFall')}</td>
        <td>${item('fallProtect')}</td>
        <td>${item('workPlan')}</td>
        <td>${item('specialInspection')}</td>
        <td>${item('regularInspection')}</td>
        <td><span class="badge ${r.active?'green':'gray'}">${esc(r.fleetStatus||(r.active?'운행':'미운행'))}</span></td>
        <td><span class="badge ${s.status === 'risk' ? 'red' : s.status === 'pending' || s.status === 'planned' ? 'amber' : 'green'}">${esc(r.noSafetyRecord?'미점검':s.label)}</span></td>
      </tr>`;
    }).join('');
    $('#s-foot').innerHTML = `<div class="table-foot"><span class="small muted">총 <b class="num">${nf(rows.length)}</b>대 · 운행 <b>${nf(rows.filter((r) => r.active).length)}</b>대 · 확인·조치 필요 <b>${nf(rows.filter((r) => (snapshot.summaries.get(r.id)?.attention || 0) > 0).length)}</b>대</span><span class="tiny muted">행을 선택하면 상세가 열립니다.</span></div>`;
    if (ui.plate) {
      const match = rows.find((r) => safetyPlate(r.plateNo) === safetyPlate(ui.plate));
      if (match) {
        ui.selectedId = match.id; ui.plate = '';
        ui.split = true;
        $('#safety-work').classList.add('with-side');
        $('#btn-split').classList.add('btn-soft');
        renderRows();
        return;
      }
    }
    if (!ui.selectedId || !rows.some((r) => r.id === ui.selectedId)) ui.selectedId = rows[0].id;
    $$('#s-body tr[data-id]').forEach((tr) => {
      tr.onclick = () => {
        ui.selectedId = tr.dataset.id;
        if (!ui.split) {
          ui.split = true;
          $('#safety-work').classList.add('with-side');
          $('#btn-split').classList.add('btn-soft');
        }
        markSelected();
        renderSide(fleet.find((r) => r.id === ui.selectedId));
      };
    });
    markSelected();
    renderSide(fleet.find((r) => r.id === ui.selectedId));
  };

  const markSelected = () => {
    $$('#s-body tr[data-id]').forEach((tr) => tr.classList.toggle('selected', tr.dataset.id === ui.selectedId));
  };

  function renderSide(record) {
    const side = $('#safety-side');
    if (!side) return;
    if (!ui.split) { side.innerHTML = ''; return; }
    if (!record) {
      side.innerHTML = `<div class="side-empty">${icon('shield')}<strong>차량을 선택하세요</strong><span>안전점검 항목과 운송차량 연결 상태를 확인할 수 있습니다.</span></div>`;
      return;
    }
    const s = safetySummary(record);
    const eq = record.equipmentId ? state.equipment.find(e=>e.id===record.equipmentId) : null;
    const linked = eq?.driverId ? state.drivers.find((d) => d.id === eq.driverId) : null;
    const driverName=linked?.name||eq?.driverName||'';
    side.innerHTML = `
      <div class="side-head">
        <div style="flex:1;min-width:0">
          <div class="row" style="gap:6px"><span class="badge ${s.status === 'risk' ? 'red' : s.status === 'pending' || s.status === 'planned' ? 'amber' : 'green'}">${esc(record.noSafetyRecord?'미점검':s.label)}</span><span class="tag">${esc(record.company || '-')}</span></div>
          <h3 class="mono" style="font-size:19px;font-weight:800;margin-top:7px">${esc(record.plateNo)}</h3>
          <div class="small muted">${esc(record.bodyType || '-')} · ${esc(record.year || '-')}년 · ${esc(record.ageBand || '-')}</div>
        </div>
        <button class="icon-btn" id="side-close" title="닫기">${icon('close')}</button>
      </div>
      <div class="side-body">
        <div class="side-stats">
          <div><span>완료율</span><b>${s.completion}%</b></div>
          <div><span>확인중</span><b class="${s.pending ? 'text-orange' : ''}">${s.pending}</b></div>
          <div><span>조치</span><b class="${s.risk || s.planned ? 'text-red' : ''}">${s.risk + s.planned}</b></div>
        </div>
        <div class="side-section">
          <div class="side-title">안전점검 항목 <span class="tiny muted">${SAFETY_SCORE_CHECKS.length}개 핵심</span></div>
          ${SAFETY_CHECKS.map((key) => {
            const it = safetyItem(record, key);
            const core = SAFETY_SCORE_CHECKS.includes(key);
            return `<div class="safety-row ${core ? '' : 'sub'}">
              <div class="safety-name">${esc(SAFETY_CHECK_LABELS[key])}${core ? '' : '<span class="tiny muted"> · 참고</span>'}</div>
              <div class="safety-val">${statusBadge(it)}<small title="${esc(it.raw)}">${esc(it.raw || '미입력')}</small></div>
            </div>`;
          }).join('')}
        </div>
        <div class="side-section">
          <div class="side-title">차량 정보</div>
          <div class="kv"><span>운송사 / 소속</span><b>${esc(record.company || '-')} · ${esc(record.ownership || '-')}</b></div>
          <div class="kv"><span>적재중량 / 적재</span><b>${record.tonnage ? `${nf(record.tonnage)}t` : '-'} · ${record.capacity?nf(record.capacity)+'대':'미설정'}</b></div>
          <div class="kv"><span>제작연월 / 연식</span><b>${esc(record.manufacturedAt||record.year||'미입력')}</b></div>
          <div class="kv"><span>검사 만료일</span><b>${esc(record.inspectionExpiry || '미입력')}</b></div><div class="kv"><span>특장업체</span><b>${esc(record.upfitter || '-')}</b></div>
          <div class="kv"><span>교체 예정</span><b>${esc(record.replacePlan || '-')}</b></div>
          <div class="kv"><span>운행</span><b>${esc(record.fleetStatus||(record.active?'운행 중':'미운행·확인불가'))}</b></div>
          <div class="kv"><span>원본</span><b class="tiny" style="max-width:190px;text-align:right;word-break:break-all">${esc(record.sourceFile || '-')}</b></div>
        </div>
        <div class="side-section">
          <div class="side-title">운송차량 연결</div>
          ${eq ? `<div class="insight" style="padding:9px 10px">${icon('truck')}<div><b>${esc(eq.plateNo)}</b> · ${esc(eq.type)} ${esc(eq.model || '')}<br><span class="tiny">${driverName ? `배정 기사 ${esc(driverName)}` : '기사 미배정'} · 보험 ${esc(eq.insuranceExpiry || '-')}</span></div></div>` : `<div class="small muted" style="margin-bottom:8px">운송차량에 아직 등록되지 않았습니다.</div>`}
          <a class="btn btn-sm btn-ghost w-full" href="#/equipment?q=${encodeURIComponent(record.plateNo)}" data-link>운송차량 정보 확인·수정</a>
        </div>
        <div class="side-actions">
          ${record.safetyRecordId?'<button class="btn btn-primary" id="edit-safety">기존 점검표 수정</button>':''}
          ${eq&&planAccess?`<a class="btn btn-primary" href="#/vehicle-safety?vehicle=${encodeURIComponent(eq.id)}" data-link>점검 작성·이력</a><a class="btn btn-ghost" href="#/vehicle-safety?plans=1&vehicle=${encodeURIComponent(eq.id)}" data-link>안전작업계획서</a>`:''}
          <button class="btn btn-ghost" id="goto-board">${icon('board')} 배차판에서 보기</button>
        </div>
      </div>`;
    $('#side-close').onclick = () => { ui.split = false; $('#safety-work').classList.remove('with-side'); $('#btn-split').classList.remove('active'); side.innerHTML = ''; };
    if($('#edit-safety')) $('#edit-safety').onclick = () => openEditor(state.safety.find(r=>r.id===record.safetyRecordId));

    $('#goto-board').onclick = () => { location.hash = `#/board?q=${encodeURIComponent(record.plateNo)}`; };
  }

  function openEditor(record) {
    const d = record || newSafetyDraft();
    const text = (id, label, value, help = '') => field(label, `<input class="input" id="${id}" value="${esc(value || '')}">`, { help });
    openModal({
      title: record ? '안전점검 수정' : '안전점검 차량 추가',
      sub: '원본 문구를 유지하면서 확인 결과를 갱신할 수 있습니다.',
      size: 'xwide',
      body: `<div class="form-grid">
        ${text('sa-plate', '차량번호', d.plateNo)}
        ${text('sa-company', '운송사', d.company)}
        ${text('sa-ownership', '소속여부', d.ownership)}
        ${text('sa-body', '차체 구조', d.bodyType)}
        ${text('sa-year', '차량연식', d.year)}
        ${text('sa-age', '연식구분', d.ageBand)}
        ${text('sa-ton', '승인톤수', d.tonnage)}
        ${text('sa-cap', '최대적재수량', d.capacity)}
        ${text('sa-upfitter', '특장장비업체', d.upfitter)}
        ${text('sa-replace', '교체 예정', d.replacePlan)}
        ${field('운행여부', `<select class="select" id="sa-operating"><option value="○" ${d.operating === '○' ? 'selected' : ''}>○ 운행</option><option value="#N/A" ${d.operating !== '○' ? 'selected' : ''}>미운행·확인불가</option></select>`)}
        ${text('sa-memo', '메모', d.memo)}
        ${text('sa-decklift', '2층 인양장치명', d.deckLift)}
        ${text('sa-deckfall', '2층 낙하방지', d.deckFall)}
        ${text('sa-fall', '추락방지', d.fallProtect)}
        ${text('sa-work', '작업계획서', d.workPlan)}
        ${text('sa-special', '특장점검 최근일', d.specialInspection)}
        ${text('sa-regular', '정기검사일', d.regularInspection)}
      </div>`,
      foot: `${record ? '<button class="btn btn-danger" id="sa-del" style="margin-right:auto">삭제</button>' : ''}<button class="btn btn-ghost" data-close>취소</button><button class="btn btn-primary" id="sa-save">저장</button>`,
      onMount(el, close) {
        const val = (id) => el.querySelector(id).value.trim();
        el.querySelector('#sa-save').onclick = async () => {
          if (!val('#sa-plate')) return toast('차량번호를 입력하세요.', 'warn');
          await saveSafety({
            ...(record || {}),
            plateNo: val('#sa-plate'), company: val('#sa-company'), ownership: val('#sa-ownership'), bodyType: val('#sa-body'),
            year: val('#sa-year'), ageBand: val('#sa-age'), tonnage: val('#sa-ton'), capacity: val('#sa-cap'),
            upfitter: val('#sa-upfitter'), replacePlan: val('#sa-replace'), operating: val('#sa-operating'), memo: val('#sa-memo'),
            deckLift: val('#sa-decklift'), deckFall: val('#sa-deckfall'), fallProtect: val('#sa-fall'), workPlan: val('#sa-work'),
            specialInspection: val('#sa-special'), regularInspection: val('#sa-regular'),
            sourceFile: record?.sourceFile || '직접 입력', sourceDate: record?.sourceDate || todayStr(),
          });
          close();
          toast('안전점검 정보를 저장했습니다.', 'success');
          renderSafety(view, ctx);
        };
        if (record) el.querySelector('#sa-del').onclick = async () => {
          if (!(await confirmBox(`${record.plateNo} 안전점검 기록을 삭제할까요?`, { title: '기록 삭제', ok: '삭제', danger: true }))) return;
          await deleteSafety(record.id);
          close();
          toast('삭제했습니다.', 'success');
          renderSafety(view, ctx);
        };
      },
    });
  }

  $('#btn-import').onclick = () => openImport();
  $('#btn-export').onclick = () => {
    const rows = filtered();
    if (!rows.length) return toast('내보낼 데이터가 없습니다.', 'warn');
    exportXlsx({ 안전점검: [SAFETY_EXPORT_HEADERS, ...rows.map(toSafetyExportRow)] }, `M&M_안전점검_${todayStr()}.xlsx`);
  };
  $('#btn-split').onclick = () => {
    ui.split = !ui.split;
    $('#safety-work').classList.toggle('with-side', ui.split);
    $('#btn-split').classList.toggle('active', ui.split);
    renderSide(fleet.find((r) => r.id === ui.selectedId));
    renderRows();
  };
  $('#s-q').addEventListener('input', debounce((e) => { ui.q = e.target.value; renderRows(); }, 180));
  $('#s-company').onchange = (e) => { ui.company = e.target.value; renderRows(); };
  $('#s-bodytype').onchange = (e) => { ui.body = e.target.value; renderRows(); };
  $('#s-age').onchange = (e) => { ui.age = e.target.value; renderRows(); };
  $('#s-status').onchange = (e) => { ui.status = e.target.value; renderRows(); };

  function openImport() {
    const session = { parsed: null, file: null };
    openModal({
      title: '안전점검 업로드',
      sub: 'Tesla 운송사별 카캐리어 고정 Pool 안전관리 원본 형식을 인식합니다.',
      size: 'wide',
      body: `<div class="dropzone" id="sa-dz">
        <div class="dz-icon">${icon('shield')}</div>
        <h4>안전점검 엑셀을 끌어다 놓으세요</h4>
        <p>XLSX · XLS · CSV · 차량번호/운송사 헤더 자동 인식 · 원본 파일은 수정하지 않습니다</p>
        <input type="file" id="sa-file" accept=".xlsx,.xls,.xlsm,.csv" class="hidden">
      </div>
      <div id="sa-result" style="margin-top:14px"></div>`,
      foot: `<button class="btn btn-ghost" data-close>닫기</button><button class="btn btn-primary" id="sa-commit" disabled>${icon('upload')} 가져오기</button>`,
      onMount(el, close) {
        const dz = el.querySelector('#sa-dz');
        const input = el.querySelector('#sa-file');
        const commit = el.querySelector('#sa-commit');
        dz.onclick = () => input.click();
        dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
        dz.ondragleave = () => dz.classList.remove('over');
        dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); const f = e.dataTransfer.files?.[0]; if (f) handle(f); };
        input.onchange = () => { if (input.files?.[0]) handle(input.files[0]); };
        async function handle(file) {
          if (file.size > 40 * 1024 * 1024) return toast('40MB 이하 파일만 업로드할 수 있습니다.', 'warn');
          const result = el.querySelector('#sa-result');
          result.innerHTML = `<div class="file-card"><div class="fi">${icon('file')}</div><div class="meta"><strong>${esc(file.name)}</strong><small>읽는 중…</small></div></div>`;
          try {
            const buffer = await readFile(file);
            session.parsed = parseSafetyWorkbook(buffer, file.name);
            session.file = file.name;
            commit.disabled = !session.parsed.rows.length;
            result.innerHTML = `
              <div class="file-card" style="margin-bottom:10px">
                <div class="fi">${icon('shield')}</div>
                <div class="meta"><strong>${esc(file.name)}</strong><small>${esc(session.parsed.sheetName)} · ${session.parsed.headerRow}행 헤더 · ${nf(session.parsed.totals.rows)}대</small></div>
                <span class="badge green">인식 완료</span>
              </div>
              <div class="row" style="gap:6px;margin-bottom:10px">
                <span class="badge blue">${nf(session.parsed.totals.rows)}대</span>
                <span class="badge green">운행 ${nf(session.parsed.totals.active)}대</span>
                <span class="badge gray">${esc(session.parsed.totals.companies.join(' · '))}</span>
                ${session.parsed.totals.duplicates ? `<span class="badge amber">차량번호 중복 ${session.parsed.totals.duplicates}</span>` : ''}
              </div>
              ${session.parsed.warnings.length ? `<div class="insight warn" style="margin-bottom:10px">${icon('warning')}<div>${session.parsed.warnings.slice(0, 3).map(esc).join('<br>')}</div></div>` : ''}
              <label class="check"><input type="checkbox" id="sa-replace" checked> 기존 안전점검 자료를 이 파일로 교체 (권장)</label>`;
          } catch (err) {
            result.innerHTML = `<div class="insight warn">${icon('warning')}<div>${esc(err.message)}</div></div>`;
          }
        }
        commit.onclick = async () => {
          if (!session.parsed) return;
          const replace = el.querySelector('#sa-replace')?.checked ?? true;
          commit.disabled = true;
          commit.innerHTML = '저장 중…';
          try {
            const r = await commitSafety(session.parsed.rows, { replace, fileName: session.file });
            close();
            toast(`안전점검 ${nf(r.total)}대를 저장했습니다.${r.inserted ? ` 신규 ${nf(r.inserted)}` : ''}${r.updated ? ` · 갱신 ${nf(r.updated)}` : ''}`, 'success', 5000);
            renderSafety(view, ctx);
          } catch (err) {
            commit.disabled = false;
            commit.innerHTML = '가져오기';
            toast(`저장 실패: ${err.message}`, 'error');
          }
        };
      },
    });
  }

  renderRows();
}
