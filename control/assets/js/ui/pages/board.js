import {createDispatchLedger,dispatchUnits} from '../../core/dispatch-metrics.js';
import {summarizePerformance} from '../../core/transport-performance.js';
import { reviewDuplicates, restoreDuplicateArchive } from '../../core/dispatch-duplicates.js';
import {
  $, $$, esc, icon, nf, num, str, shortDate, dateLabel, todayStr, addDays, exportXlsx,
  openModal, openDrawer, confirmBox, toast, readFile, debounce, statusBadge, statusMeta, regionOf, brandOf, timeAgo, normalizePlate,
} from '../../core/utils.js';
import {
  state, commitDispatch, deleteImport, deleteDispatchByDates, setWorkdate, rowsOn, isCounted, saveIncident,
  unknownDriversFromRows, registerDriversFromRows, driverByName, latestDates, bulkAssignOrders,
} from '../../core/data.js';
import { parseWorkbook, toExportRow, EXPORT_HEADERS, buildTemplateRows, FIELD_DEFS } from '../../core/importer.js';
import { safetyForPlate, safetySummary } from '../../core/safety.js';
import { pageHead, banner, searchInput } from '../components.js';

import { availabilityOn,validDate } from '../../core/schedule.js';

import { openSheetImport } from '../sheet-import-modal.js';
import { cancelAssignments } from '../../core/unassign.js';

const PREF_KEY = 'mmtc.board.prefs.v3';
const DEFAULT_COLS = ['date', 'customer', 'route', 'vehicle', 'driver', 'formation', 'count', 'status', 'region'];
const COLS = {
  date: { label: '일자', w: 78, sticky: true },
  customer: { label: '거래처', w: 150, sticky: true },
  route: { label: '경로', w: 250 },
  vehicle: { label: '차종 / 차대번호', w: 184 },
  driver: { label: '기사 / 차량', w: 154 },
  formation:{label:'회전별 편성',w:155},
  count: { label: '대수', w: 54, num: true },
  turn: { label: '회전', w: 50, num: true },
  status: { label: '상태', w: 76 },
  region: { label: '권역', w: 64 },
  billed: { label: '청구', w: 84, num: true },
  note: { label: '비고', w: 130 },
};
const CHUNK = 400;

const loadPrefs = () => {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    return {
      density: p.density === 'compact' ? 'compact' : 'normal',
      split: typeof p.split === 'boolean' ? p.split : window.innerWidth >= 1600,
      cols: Array.isArray(p.cols) && p.cols.length ? p.cols.filter((k) => COLS[k]) : DEFAULT_COLS.slice(),
    };
  } catch {
    return { density: 'normal', split: window.innerWidth >= 1600, cols: DEFAULT_COLS.slice() };
  }
};
const savePrefs = (ui) => {
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ density: ui.density, split: ui.split, cols: [...ui.cols] })); } catch { /* ignore */ }
};
const hl = (value, q) => {
  const s = str(value);
  if (!q) return esc(s);
  const rx = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
  return s.split(rx).map((part, i) => (i % 2 ? `<mark>${esc(part)}</mark>` : esc(part))).join('');
};

export default function renderBoard(view, ctx = {}) {
  const prefs = loadPrefs();
  const params = ctx.params || new URLSearchParams();
  const selectedDate=params.get('date');
  const base = validDate(selectedDate)?selectedDate:state.workdate||todayStr();
  const qParam = params.get('q') || '';
  const ui = {
    from: qParam ? addDays(base, -90) : base,
    to: base,
    q: qParam,
    status: '',
    assign:['unassigned','assigned','planned','exception','review','duplicate'].includes(params.get('assign'))?params.get('assign'):'',
    region: '',
    sort: 'date',
    dir: 'asc',
    limit: CHUNK,
    selectedId: null,
    selected: new Set(),
    split: prefs.split,
    density: prefs.density,
    cols: new Set(prefs.cols),
    full: false,
  };
  let overlay = new Map(),tripPerformance=null,visibleTripPerformance=null,ledger=null;
  const effectiveRow=r=>{if(ledger?.byId.has(r.id))return ledger.byId.get(r.id).row;const p=overlay.get(r.id);return p&&p.date===r.date?{...r,driver:p.driverName,driverId:p.driverId,vehicleNo:p.vehicleNo,turn:p.turn??r.turn}:r;};
  let allRows = [];
  let rendered = 0;
  let loadingMore = false;

  const lastImport = state.imports[0];
  view.innerHTML = `
    ${pageHead('배차판', '일 800~1,600대 규모를 빠르게 훑고, 선택한 건을 오른쪽에서 바로 확인·배정합니다.', `
      <a class="btn btn-ghost" href="#/assign" data-link>${icon('route')} 가배차</a>
      <a class="btn btn-primary" href="#/formation" data-link>회전별 편성</a>
      <button class="btn btn-ghost" id="btn-duplicates">중복 점검</button>
      <button class="btn btn-danger" id="btn-unassign-all">전체 배차 취소</button>
      <button class="btn btn-ghost" id="btn-template">${icon('download')} 템플릿</button>
      <button class="btn btn-ghost" id="btn-google-import">${icon('cloud')} 구글시트에서 불러오기</button>
      <button class="btn btn-primary" id="btn-upload">${icon('upload')} 배차판 업로드</button>`)}
    <div id="page-banner"></div><p class="small muted" style="margin:10px 0">원장 행 수·유효 운송 대수·회전별 배차 건수는 구분합니다. 유효 대수 = 배정 + 미배차이며, 취소·미출고·지원, 동일 내용 중복, 자료 확인 대상은 제외합니다. 대시보드와 같은 날짜로 대조하세요. 표의 원본 행은 보존합니다.</p><details class="card card-pad" style="margin-bottom:12px"><summary><b>회전별 배차 묶음 보기 · VIN별 상세 연결</b></summary><div id="board-trip-groups"></div></details>
    <div class="board-metrics" id="summary"></div>
    <div class="board-toolbar card">
      <div class="board-toolbar-line">
        ${searchInput('f-q', '거래처·도착지·차대번호·기사·차량번호 검색', ui.q)}
        <div class="date-range">${icon('calendar')}<input class="input input-sm" type="date" id="f-from" value="${ui.from}"><span class="muted">~</span><input class="input input-sm" type="date" id="f-to" value="${ui.to}"></div>
        <div class="seg" id="range-seg">
          <button data-range="today" class="${ui.from === ui.to && ui.to === todayStr() ? 'active' : ''}">오늘</button>
          <button data-range="7" class="${ui.from === addDays(ui.to, -6) ? 'active' : ''}">7일</button>
          <button data-range="30" class="${ui.from === addDays(ui.to, -29) ? 'active' : ''}">30일</button>
          <button data-range="all">전체</button>
        </div>
        <select class="select select-sm" id="f-assign">
          <option value="">전체 배차</option>
          <option value="unassigned">미배차</option>
          <option value="assigned">배차 완료</option>
          <option value="planned">가배차 확정</option>
          <option value="exception">취소·미출고·지원</option><option value="review">자료 확인</option><option value="duplicate">동일 중복</option>
        </select>
        <select class="select select-sm" id="f-region"><option value="">전체 권역</option></select>
        <div class="toolbar-spacer"></div>
        <div class="toolbar-actions">
          <button class="btn btn-sm btn-ghost" id="btn-columns" title="표시 열">${icon('columns')} 열</button>
          <button class="btn btn-sm btn-ghost" id="btn-density" title="행 밀도">${icon('rows')} <span>${ui.density === 'compact' ? '조밀' : '보통'}</span></button>
          <button class="btn btn-sm btn-ghost ${ui.split ? 'btn-soft' : ''}" id="btn-split">${icon('split')} 분할</button>
          <button class="btn btn-sm btn-ghost" id="btn-full">${icon('maximize')} 집중</button>
        </div>
      </div>
      <div class="board-toolbar-line board-toolbar-sub">
        <div class="date-strip" id="date-strip"></div>
        <div class="toolbar-spacer"></div>
        <span class="small muted" id="result-meta"></span>
      </div>
    </div>
    <div class="board-work board-mode ${ui.split ? 'with-side' : ''}" id="board-work">
      <div class="board-panel">
        <div class="board-actionbar">
          <div class="row" style="gap:7px">
            <button class="btn btn-sm btn-ghost" id="btn-select-unassigned">${icon('check')} 미배차만 선택</button>
            <button class="btn btn-sm btn-ghost" id="btn-export">${icon('download')} 내보내기</button>
            <button class="btn btn-sm btn-danger" id="btn-clean">${icon('trash')} 기간 삭제</button>
          </div>
          <div class="row" style="gap:6px">
            <span class="tiny muted" id="scroll-hint">스크롤하면 계속 불러옵니다</span>
            <button class="icon-btn" id="btn-scroll-top" title="맨 위로">${icon('arrowUp')}</button>
          </div>
        </div>
        <div class="bulkbar hidden" id="bulkbar">
          <span class="bulk-count"><b id="bulk-n">0</b>건 선택</span>
          <button class="btn btn-xs btn-primary" id="bulk-assign">${icon('users')} 기사 일괄 배정</button>
          <button class="btn btn-xs btn-ghost" id="bulk-export">${icon('download')} 선택 엑셀</button>
          <button class="btn btn-xs btn-ghost" id="bulk-clear">선택 해제</button>
          <span class="tiny muted" id="bulk-note"></span>
        </div>
        <div class="table-wrap board-table-wrap">
          <div class="table-scroll board-scroll" id="board-scroll" tabindex="0">
            <table class="data board-table ${ui.density}" id="tbl">
              <colgroup id="cols"></colgroup>
              <thead id="thead"></thead>
              <tbody id="tbody"></tbody>
            </table>
          </div>
          <div class="table-foot" id="board-foot"></div>
        </div>
      </div>
      <aside class="board-side" id="board-side"></aside>
    </div>
    <details class="section import-history">
      <summary>${icon('database')} 가져오기 이력 <span class="tiny muted">파일 단위로 되돌리기</span></summary>
      <div class="table-wrap" style="margin-top:10px">
        <table class="data">
          <thead><tr><th>파일</th><th>가져온 시각</th><th class="num">신규</th><th class="num">갱신</th><th>기간</th><th></th></tr></thead>
          <tbody id="import-body"></tbody>
        </table>
      </div>
    </details>
  `;

  $('#f-assign').value=ui.assign;
  if (!state.dispatch.length) $('#page-banner').innerHTML = banner('아직 배차 데이터가 없습니다. 기존 배차판 파일을 업로드하면 바로 분석과 가배차를 사용할 수 있습니다.', 'warn');
  else if (lastImport) $('#page-banner').innerHTML = `<div class="insight" style="margin-bottom:10px;padding:8px 11px">${icon('check')}<div class="small">최근 <b>${esc(lastImport.fileName)}</b> · 신규 ${nf(lastImport.inserted)} · 갱신 ${nf(lastImport.updated)} · <span class="tiny">${esc(lastImport.sheets?.slice(0, 2).join(', ') || '')}</span></div></div>`;

  /* ---------------- data ---------------- */
  const refreshOverlay = () => {
    overlay = new Map();
    for (const a of state.assignments.filter((x) => x.status === 'confirmed')) {
      for (const oid of a.orderIds || []) overlay.set(oid, {date:a.date,driverName:a.driverName,vehicleNo:a.vehicleNo,driverId:a.driverId,planId:a.id,formation:a.formation,turn:a.orderTurns?.[oid],totalCount:a.totalCount});
    }
    ledger=createDispatchLedger(state.dispatch,{assignments:state.assignments,drivers:state.drivers});
    tripPerformance=summarizePerformance({...state,dispatch:ledger.summary.counted});
  };

  const filtered = () => {
    const q = ui.q.trim().toLowerCase();
    let rows = state.dispatch.filter((r) => (!ui.from || r.date >= ui.from) && (!ui.to || r.date <= ui.to));
    if (ui.status) rows = rows.filter((r) => r.status === ui.status);
    if (ui.assign === 'unassigned') rows = rows.filter((r) => ledger.byId.get(r.id)?.kind==='pending');
    if (ui.assign === 'assigned') rows = rows.filter((r) => ledger.byId.get(r.id)?.kind==='assigned');
    if (ui.assign === 'planned') rows = rows.filter((r) => !!effectiveRow(r).confirmedPlanId&&ledger.byId.get(r.id)?.kind==='assigned');
    if (ui.assign === 'exception') rows = rows.filter((r) => ledger.byId.get(r.id)?.kind==='excluded');
    if(ui.assign==='review')rows=rows.filter(r=>ledger.byId.get(r.id)?.kind==='held');
    if(ui.assign==='duplicate')rows=rows.filter(r=>ledger.byId.get(r.id)?.duplicate);
    if (ui.region) rows = rows.filter((r) => (r.region || regionOf(r.destination)) === ui.region);
    if (q) rows = rows.filter((r) => `${r.customer} ${r.destination} ${r.vin} ${effectiveRow(r).driver} ${effectiveRow(r).vehicleNo} ${r.model} ${r.origin} ${r.brand}`.toLowerCase().includes(q));
    const va = (r) => {
      if (ui.sort === 'date') return `${r.date} ${r.sheet || ''} ${String(r.rowNumber || 0).padStart(6, '0')}`;
      if(ui.sort==='formation')return tripPerformance?.byOrder.get(r.id)?.key||'';
      if (ui.sort === 'count' || ui.sort === 'turn' || ui.sort === 'billed') return num(effectiveRow(r)[ui.sort]);
      return str(r[ui.sort]);
    };
    rows.sort((a, b) => {
      const x = va(a), y = va(b);
      const cmp = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'ko');
      return cmp * (ui.dir === 'desc' ? -1 : 1);
    });
    return rows;
  };

  const renderTripSummary=analysis=>{
    const area=$('#board-trip-groups');if(!area)return;
    area.innerHTML=`<p class="small muted" style="margin:12px 0">검색 결과에 포함된 회전 묶음입니다. 일부 VIN만 검색한 경우 묶음의 전체 운송은 상세에서 확인하세요. 회전·차량 미입력은 1회전으로 추정하지 않습니다.</p><button class="btn btn-sm btn-ghost" id="board-trip-export">회전·VIN 연결표 내려받기</button><div class="scroll-x"><table class="data"><thead><tr><th>일자</th><th>기사 / 차량</th><th>회전</th><th>배차</th><th>검색 운송</th><th>전체 묶음</th><th></th></tr></thead><tbody>${analysis.groups.slice(0,200).map((g,i)=>{const full=tripPerformance?.groups.find(x=>x.key===g.key)||g;return `<tr><td>${esc(g.date)}</td><td>${esc(g.driverName)}<div class="tiny muted">${esc(g.vehicleNo)}</div></td><td>${g.turn}${g.origins.size>1?`<div class="tiny text-amber">복수 상차지 확인</div>`:``}</td><td>1건</td><td>${nf(g.units)}대</td><td>${nf(full.units)}대</td><td><button class="btn btn-sm btn-ghost" data-trip-detail="${i}">VIN·편성 상세</button></td></tr>`;}).join('')}</tbody></table></div><p class="small muted">${nf(analysis.total.tripCount)}개 묶음 중 상위 200개 표시 · 편성 정보 미확인 ${nf(analysis.total.unclassifiedRecords)}건 · 중복/식별 상충 ${nf(analysis.held.length)}건은 별도 확인</p>`;
    area.querySelectorAll('[data-trip-detail]').forEach(b=>b.onclick=()=>{const part=analysis.groups[Number(b.dataset.tripDetail)],g=tripPerformance?.groups.find(x=>x.key===part.key)||part;openModal({title:`${g.driverName} · ${g.turn}회전 · 1배차`,sub:`${g.date} · ${g.vehicleNo} · 운송 ${g.units}대`,size:'wide',body:`<p class="small">${g.confirmed?'확정 편성과 연결된 묶음':'기존 배차 기록 기준 묶음 · 확정 여부와 구분합니다.'}</p>${g.origins.size>1?`<p class="small text-amber">출발지가 여러 곳인 기록입니다. 원본 회전 값과 운행 동선을 확인한 뒤 편성하세요.</p>`:''}<table class="data"><thead><tr><th>VIN</th><th>차종</th><th>구간</th><th>대수</th></tr></thead><tbody>${g.orders.map(r=>`<tr><td>${esc(r.vin)}</td><td>${esc(r.model)}</td><td>${esc(r.origin)} → ${esc(r.destination)}</td><td>${nf(r.count)}</td></tr>`).join('')}</tbody></table>`,foot:`<button class="btn btn-ghost" data-close>닫기</button><a class="btn btn-primary" href="#/formation" data-link>편성 메뉴에서 검토</a>`});});
    $('#board-trip-export').onclick=()=>exportXlsx({'회전별 배차':[['일자','기사','차량','회전','배차건수','조회운송대수','과거한도기록','적재율'],...analysis.groups.map(g=>[g.date,g.driverName,g.vehicleNo,g.turn,1,g.units,g.capacity??'',g.utilization??''])],'VIN별 연결':[['일자','기사','차량','회전','VIN','차종','운송대수'],...analysis.groups.flatMap(g=>g.orders.map(r=>[g.date,g.driverName,g.vehicleNo,g.turn,r.vin,r.model,r.count]))]},`배차판_회전별_${ui.from}_${ui.to}.xlsx`);
  };
  const refreshSummary = (rows) => {
    const metrics=ledger.summaryFor(rows);
    visibleTripPerformance=summarizePerformance({...state,dispatch:metrics.counted,transportHistory:[]});renderTripSummary(visibleTripPerformance);
    const total = rows.length;
    const counted=metrics.counted;
    const demand = counted.reduce((s, r) => s + (num(r.count) || 1), 0);
    const assignedRows=metrics.assigned;
    const assigned = assignedRows.reduce((s, r) => s + (num(r.count) || 1), 0);
    const unassignedRows=metrics.pending;
    const unassigned = unassignedRows.reduce((s, r) => s + (num(r.count) || 1), 0);
    const ex = rows.filter((r) => ledger.byId.get(r.id)?.kind==='excluded').length;
    const coverage = demand ? Math.round((assigned / demand) * 1000) / 10 : 0;
    const box = (label, value, unit, tone, sub) => `<div class="bm ${tone || ''}"><span>${label}</span><b>${value}<small>${unit}</small></b>${sub ? `<em>${sub}</em>` : ''}</div>`;
    $('#summary').innerHTML = `
      ${box('VIN 운송 기록', nf(total), '건', '', `${ui.from || '전체'} ~ ${ui.to || '전체'}`)}
      ${box('유효 운송', nf(demand), '대', '', '취소·지원 제외')}${box('기록상 배차',nf(visibleTripPerformance.total.tripCount),'건','',`편성 미확인 ${nf(visibleTripPerformance.total.unclassifiedRecords)}건`)}
      ${box('배정 운송', nf(assigned), '대', 'good', `배차율 ${coverage}%`)}
      ${box('미배차', nf(unassigned), '대', unassigned ? 'warn' : '', `${unassignedRows.length}건 · 수동 해제 ${nf(metrics.manualPendingUnits)} · 수정 보호 ${nf(metrics.modifiedPendingUnits)}대`)}
      ${box('예외',nf(metrics.excludedRecords),'행','','취소·미출고·지원')}${box('자료 확인',nf(metrics.heldRecords),'행',metrics.heldRecords?'warn':'','유효 대수 집계 보류')}${box('동일 내용 중복',nf(metrics.duplicateRecords),'행','','중복 대수 제외 · 원본 보존')}
      <div class="bm-progress"><div class="row-between tiny"><span>배차 진행</span><b>${coverage}%</b></div><div class="progress ${coverage >= 95 ? '' : coverage >= 70 ? 'warn' : 'bad'}"><span style="width:${Math.min(100, coverage)}%"></span></div><div class="tiny muted">${nf(assigned)} / ${nf(demand)}대</div></div>`;
    $('#result-meta').innerHTML = `<b>${nf(total)}</b>원장 행 · 유효 ${nf(demand)}대 · 미배차 <b class="${unassigned ? 'text-orange' : ''}">${nf(unassigned)}</b>대`;
  };

  const renderDates = () => {
    const dates = latestDates(14);
    const strip = $('#date-strip');
    if (!dates.length) { strip.innerHTML = '<span class="tiny muted">배차 데이터 없음</span>'; return; }
    strip.innerHTML = dates.map((d) => {
      const rs=rowsOn(d);
      const units=ledger.summaryFor(rs).units;
      const active = ui.from === d && ui.to === d;
      return `<button class="date-chip ${active ? 'on' : ''}" data-date="${d}" title="${dateLabel(d, true)}"><b>${shortDate(d)}</b><span>${nf(units)}</span></button>`;
    }).join('');
    strip.querySelectorAll('[data-date]').forEach((b) => {
      b.onclick = () => {
        const d = b.dataset.date;
        ui.from = d; ui.to = d;
        $('#f-from').value = d; $('#f-to').value = d;
        $$('#range-seg button').forEach((x) => x.classList.remove('active'));
        setWorkdate(d);
        const wd = $('#workdate-label');
        if (wd) wd.textContent = dateLabel(d, true);
        resetView();
      };
    });
  };

  const visibleCols = () => DEFAULT_COLS.filter((k) => ui.cols.has(k)).concat([...ui.cols].filter((k) => !DEFAULT_COLS.includes(k) && COLS[k]));
  const stickyLeft = () => {
    const map = {};
    let left = 38;
    for (const k of visibleCols()) {
      if (COLS[k].sticky) { map[k] = left; left += COLS[k].w; }
    }
    return map;
  };
  const renderHeader = () => {
    const cols = visibleCols();
    const widths = [38, ...cols.map((k) => COLS[k].w)];
    $('#cols').innerHTML = widths.map((w) => `<col style="width:${w}px">`).join('');
    let left = 38;
    const sticky = {};
    for (const k of cols) {
      if (COLS[k].sticky) { sticky[k] = left; left += COLS[k].w; }
    }
    const th = (k) => {
      const c = COLS[k];
      const arrow = ui.sort === k ? (ui.dir === 'asc' ? '↑' : '↓') : '';
      const cls = [c.num ? 'num' : '', c.sticky ? 'sticky-col' : ''].filter(Boolean).join(' ');
      const style = c.sticky ? `left:${sticky[k]}px` : '';
      return `<th class="${cls}" style="width:${c.w}px;${style}"><button class="th-sort" data-sort="${k}">${c.label}<span>${arrow}</span></button></th>`;
    };
    $('#thead').innerHTML = `<tr>
      <th class="sel sticky-col" style="width:38px;left:0"><input type="checkbox" id="select-all" title="현재 결과 전체 선택"></th>
      ${cols.map(th).join('')}
    </tr>`;
    $('#select-all').onchange = async (e) => {
      if (e.target.checked) {
        if (allRows.length > 300 && !(await confirmBox(`${nf(allRows.length)}건을 모두 선택할까요?`, { title: '전체 선택', ok: '선택' }))) { e.target.checked = false; return; }
        allRows.forEach((r) => ui.selected.add(r.id));
      } else {
        ui.selected.clear();
      }
      syncSelection();
    };
    $$('#thead [data-sort]').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.sort;
        if (ui.sort === k) ui.dir = ui.dir === 'asc' ? 'desc' : 'asc';
        else { ui.sort = k; ui.dir = k === 'date' ? 'asc' : 'asc'; }
        resetView();
      };
    });
  };

  const cell = (k, r) => {
    const record=ledger.byId.get(r.id),plan=overlay.get(r.id),group=tripPerformance?.byOrder.get(r.id);r=effectiveRow(r);
    const sl = stickyLeft();
    const st = (key) => COLS[key].sticky ? `sticky-col" style="left:${sl[key]}px` : '';
    switch (k) {
      case 'date': return `<td class="nowrap ${COLS[k].sticky ? 'sticky-col' : ''}" ${COLS[k].sticky ? `style="left:${sl[k]}px"` : ''}><div class="t-title num">${shortDate(r.date)}</div><div class="tiny muted">${esc(r.sheet || '')}</div></td>`;
      case 'customer': return `<td class="${COLS[k].sticky ? 'sticky-col' : ''}" ${COLS[k].sticky ? `style="left:${sl[k]}px"` : ''}><div class="t-title ellipsis" style="max-width:146px">${hl(r.customer || '-', ui.q)}</div><div class="tiny muted">${esc(r.brand || brandOf(r))}</div></td>`;
      case 'route': return `<td><div class="ellipsis" style="max-width:244px"><span class="muted">${esc(r.origin || '-')}</span> <span class="muted">→</span> <b>${hl(r.destination || '-', ui.q)}</b></div><div class="tiny muted ellipsis" style="max-width:244px">${esc(r.model || '')}</div></td>`;
      case 'vehicle': return `<td><div class="small ellipsis" style="max-width:180px">${esc(r.model || '-')}</div><div class="tiny muted mono ellipsis" style="max-width:180px">${hl(r.vin || '', ui.q)}</div></td>`;
      case 'driver': return `<td>${record?.kind==='held'?`<span class="badge amber">자료 확인</span><div class="tiny muted">${esc(record.reason)}</div>`:record?.kind==='excluded'?'<span class="badge gray">집계 제외</span>':record?.kind==='assigned'?`<div class="t-title">${hl(r.driver,ui.q)}</div><div class="tiny muted mono">${esc(r.vehicleNo||'-')}</div>${plan?`<span class="badge blue">${plan.formation?'편성 확정':'가배차 확정'}</span>`:''}`:`<span class="badge amber">미배차</span>${r.manualAssignmentClearedAt?'<div class="tiny text-amber">사용자 배차 해제</div>':''}`}${record?.duplicate?'<div class="tiny text-amber">동일 중복 · 대수 제외</div>':''}<div class="tiny muted">${group?`${group.turn}회전 · 묶음 ${nf(group.units)}대`:'회전·차량 정보 확인'}</div></td>`;
      case 'formation':return `<td>${group?`<b>${group.turn}회전 · 1배차</b><div class="tiny muted">전체 묶음 ${nf(group.units)}대 · ${group.confirmed?'편성 확정':'기록 기준 검토'}</div>${group.utilization==null?'<span class="tiny muted">과거 한도 기록 없음</span>':`<span class="tiny muted">적재 ${group.units}/${group.capacity}대 (${group.utilization}%)</span>`}`:'<span class="badge amber">편성 정보 미확인</span>'}</td>`;
      case 'count': return `<td class="num"><b>${dispatchUnits(r)?nf(dispatchUnits(r)):(esc(r.count??'')||'미입력')}</b></td>`;
      case 'turn': return `<td class="num">${Number.isInteger(Number(r.turn))&&Number(r.turn)>0?nf(r.turn):'미확인'}</td>`;
      case 'status': return `<td>${statusBadge(r.status)}</td>`;
      case 'region': return `<td><span class="tag">${esc(r.region || regionOf(r.destination))}</span></td>`;
      case 'billed': return `<td class="num">${r.billed ? nf(r.billed) : '-'}</td>`;
      case 'note': return `<td class="small ellipsis" style="max-width:126px" title="${esc(r.note || '')}">${esc(r.note || '-')}</td>`;
      default: return '<td></td>';
    }
  };

  const rowHtml = (r) => {
    const plan = overlay.get(r.id);
    const cls = [r.status === 'cancelled' || r.status === 'notshipped' ? 'row-cancelled' : r.status === 'support' ? 'row-support' : '', ui.selectedId === r.id ? 'selected' : ''].filter(Boolean).join(' ');
    const cols = visibleCols();
    return `<tr class="clickable ${cls}" data-id="${r.id}">
      <td class="sel sticky-col" style="left:0"><input type="checkbox" data-check="${r.id}" ${ui.selected.has(r.id) ? 'checked' : ''} aria-label="선택"></td>
      ${cols.map((k) => cell(k, r)).join('')}
    </tr>`;
  };

  const renderFoot = () => {
    const more = rendered < allRows.length;
    $('#board-foot').innerHTML = `<div class="table-foot"><span class="small muted">전체 <b class="num">${nf(allRows.length)}</b>건 중 <b class="num">${nf(rendered)}</b>건 표시</span>
      <div class="row" style="gap:8px">
        ${more ? `<button class="btn btn-xs btn-ghost" id="load-more">${icon('arrowDown')} 400건 더</button>` : '<span class="tiny muted">마지막 행입니다</span>'}
        ${more && allRows.length > 3000 ? `<button class="btn btn-xs btn-ghost" id="load-all">전체 표시</button>` : ''}
      </div></div>`;
    $('#load-more')?.addEventListener('click', () => loadMore());
    $('#load-all')?.addEventListener('click', async () => {
      if (!(await confirmBox(`전체 ${nf(allRows.length)}건을 한 번에 표시할까요? 화면이 느려질 수 있습니다.`, { title: '전체 표시', ok: '표시' }))) return;
      ui.limit = allRows.length;
      resetView(true);
    });
  };

  const appendRows = () => {
    if (loadingMore) return;
    loadingMore = true;
    const end = Math.min(ui.limit, allRows.length);
    const slice = allRows.slice(rendered, end);
    if (slice.length) $('#tbody').insertAdjacentHTML('beforeend', slice.map(rowHtml).join(''));
    rendered = end;
    loadingMore = false;
    renderFoot();
    syncSelection();
  };

  const resetView = (keepLimit = false) => {
    allRows = filtered();
    if (!keepLimit) ui.limit = CHUNK;
    rendered = 0;
    loadingMore = false;
    $('#tbody').innerHTML = '';
    refreshSummary(allRows);
    renderHeader();
    if (allRows.length) {
      if (!allRows.some((r) => r.id === ui.selectedId)) ui.selectedId = allRows[0].id;
      appendRows();
      const first = $('#tbody tr[data-id]');
      if (first) { /* no auto scroll */ }
      renderSide(state.dispatch.find((r) => r.id === ui.selectedId));
    } else {
      ui.selectedId = null;
      $('#tbody').innerHTML = `<tr><td colspan="${ui.cols.size + 1}"><div class="empty"><div class="icon">${icon('board')}</div><h4>조건에 맞는 배차가 없습니다</h4><p>기간·필터를 바꾸거나 기존 배차판 엑셀을 업로드하세요.</p><button class="btn btn-primary" id="empty-upload">${icon('upload')} 배차판 업로드</button></div></td></tr>`;
      $('#empty-upload')?.addEventListener('click', openUpload);
      renderFoot();
      renderSide(null);
    }
    syncSelection();
  };

  const loadMore = () => {
    if (rendered >= allRows.length) return;
    ui.limit = Math.min(allRows.length, ui.limit + CHUNK);
    appendRows();
  };

  const syncSelection = () => {
    const n = ui.selected.size;
    $('#bulkbar').classList.toggle('hidden', !n);
    $('#bulk-n').textContent = nf(n);
    const units=ledger.summaryFor(state.dispatch.filter(r=>ui.selected.has(r.id))).units;
    $('#bulk-note').textContent = n ? `운송 ${nf(units)}대 · 선택 항목은 일괄 배정할 수 있습니다` : '';
    $$('#tbody [data-check]').forEach((c) => { c.checked = ui.selected.has(c.dataset.check); });
    const selAll = $('#select-all');
    if (selAll) {
      const checked = allRows.reduce((n, r) => n + (ui.selected.has(r.id) ? 1 : 0), 0);
      selAll.checked = allRows.length > 0 && checked === allRows.length;
      selAll.indeterminate = checked > 0 && checked < allRows.length;
    }
    $$('#tbody tr[data-id]').forEach((tr) => tr.classList.toggle('selected', ui.selectedId === tr.dataset.id));
  };

  const selectRow = (id, { scroll = false } = {}) => {
    ui.selectedId = id;
    syncSelection();
    const tr = $(`#tbody tr[data-id="${CSS.escape(id)}"]`);
    if (tr && scroll) tr.scrollIntoView({ block: 'nearest' });
    const r = state.dispatch.find((x) => x.id === id);
    if (r) renderSide(r);
  };

  const updateSelected = () => {
    // keep checkbox/row state without rebuilding the table
    syncSelection();
  };


  /* ---------------- side panel ---------------- */
  const safetyPill = (it) => {
    const cls = it.code === 'risk' || it.code === 'overdue' ? 'red'
      : it.code === 'pending' || it.code === 'planned' || it.code === 'missing' || it.code === 'due' ? 'amber'
        : it.code === 'scheduled' ? 'blue' : it.code === 'na' ? 'gray' : 'green';
    return `<span class="badge ${cls}" title="${esc(it.detail || it.raw || '')}">${esc(it.label)}</span>`;
  };

  const sideHtml = (r, inDrawer = false) => {
    if (!r) return `<div class="side-empty">${icon('board')}<strong>행을 선택하세요</strong><span>선택한 배차의 상세·기사·차량·안전점검을<br>화면을 옮기지 않고 확인할 수 있습니다.</span></div>`;
    const plan = overlay.get(r.id);r=effectiveRow(r);
    const drv = driverByName(r.driver);
    const eq = state.equipment.find((e) => normalizePlate(e.plateNo) === normalizePlate(r.vehicleNo));
    const safs = safetyForPlate(state.safety, r.vehicleNo);
    const saf = safs[0];
    const ss = saf ? safetySummary(saf) : null;
    const meta = statusMeta[r.status] || statusMeta.normal;
    const recent = r.driver
      ? state.dispatch.filter((x) => x.driver === r.driver && x.id !== r.id && x.date <= r.date).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5)
      : [];
    const kv = (k, v, cls = '') => `<div class="kv ${cls}"><span>${k}</span><b>${v ?? '-'}</b></div>`;
    return `
      <div class="side-head">
        <div style="flex:1;min-width:0">
          <div class="row" style="gap:6px"><span class="badge ${meta.cls}">${meta.label}</span><span class="tag">${esc(r.brand || brandOf(r))}</span><span class="tag">${esc(r.region || regionOf(r.destination))}</span></div>
          <h3 style="font-size:17px;font-weight:800;margin-top:7px;line-height:1.35">${esc(r.customer || '거래처 미상')}</h3>
          <div class="small muted">${dateLabel(r.date, true)} · ${esc(r.origin || '-')} → ${esc(r.destination || '-')}</div>
        </div>
        ${inDrawer ? '' : `<button class="icon-btn" id="side-close" title="닫기">${icon('close')}</button>`}
      </div>
      <div class="side-body">
        <div class="side-section">
          <div class="side-title">배차 정보</div>
          ${kv('차대번호', `<span class="mono">${esc(r.vin || '-')}</span>`)}
          ${kv('차종', esc(r.model || '-'))}
          ${kv('출발 / 도착', `${esc(r.origin || '-')} → ${esc(r.destination || '-')}`)}
          ${kv('대수 / 회전', `${dispatchUnits(r)?nf(dispatchUnits(r)):'대수 확인 필요'}${dispatchUnits(r)?'대':''} / ${Number(r.turn)>0?nf(r.turn)+'회전':'회전 미확인'}`)}
          ${kv('청구 / 하불', `${r.billed ? `${nf(r.billed)}원` : '-'} / ${r.unpaid ? `${nf(r.unpaid)}원` : '-'}`)}
          ${kv('비고', esc(r.note || '-'))}
          ${kv('원본', `${esc(r.sheet || r.tab || '-')} / ${esc(r.rowNumber || '-')}`)}
        </div>
        <div class="side-section">
          <div class="side-title">기사 · 차량</div>
          ${r.driver ? `
            <div class="driver-mini">
              <div class="avatar" style="width:36px;height:36px;border-radius:10px">${esc((r.driver || '?').slice(0, 1))}</div>
              <div style="flex:1;min-width:0">
                <strong>${esc(r.driver)}</strong>
                <small>${esc(drv?.type || '기사')} · ${esc(r.driverPhone || drv?.phone || '연락처 없음')}</small>
              </div>
              <button class="icon-btn" id="side-copy" title="차대번호 복사">${icon('copy')}</button>
            </div>
            <div class="row" style="gap:5px;margin-top:8px"><span class="badge blue">${esc(r.vehicleNo || drv?.vehicleNo || '차량 미지정')}</span>${eq ? `<span class="tag">${esc(eq.type)} · ${nf(eq.capacity)}대</span>` : ''}</div>
          ` : plan ? `
            <div class="insight" style="padding:9px 10px">${icon('route')}<div><b>가배차 확정</b> · ${esc(plan.driverName)}<br><span class="tiny">${esc(plan.vehicleNo || '')}</span></div></div>
          ` : `<div class="insight warn" style="padding:9px 10px">${icon('warning')}<div><b>미배차</b> · 가배차에서 기사를 배정하세요.</div></div>`}
          ${eq ? `<div class="tiny muted" style="margin-top:7px">보험 ${esc(eq.insuranceExpiry || '-')} · 검사 ${esc(eq.inspectionExpiry || '-')} · ${eq.status === 'active' ? '가동' : '정비/휴차'}</div>` : ''}
        </div>
        <div class="side-section">
          <div class="side-title">안전점검 <span class="tiny muted">${saf ? esc(saf.company || '') : '차량 미등록'}</span></div>
          ${ss ? `
            <div class="row" style="gap:5px;margin-bottom:8px"><span class="badge ${ss.status === 'risk' ? 'red' : ss.status === 'ok' ? 'green' : 'amber'}">${esc(ss.label)}</span><span class="tiny muted">완료율 ${ss.completion}%</span></div>
            <div class="safety-mini">${ss.all.slice(1, 6).map((it) => `<div><span>${esc(it.label)}</span>${safetyPill(it)}</div>`).join('')}</div>
            <button class="btn btn-xs btn-ghost w-full" id="side-safety">${icon('shield')} 안전점검 상세</button>
          ` : `<div class="small muted">이 차량번호의 안전점검 기록이 없습니다.</div><button class="btn btn-xs btn-ghost w-full" id="side-safety">${icon('shield')} 안전점검 열기</button>`}
        </div>
        ${recent.length ? `
        <div class="side-section">
          <div class="side-title">최근 배차 <span class="tiny muted">${esc(r.driver)}</span></div>
          ${recent.map((x) => `<button class="side-recent" data-recent="${x.id}"><span>${shortDate(x.date)}</span><b>${esc(x.destination || '-')}</b><em>${nf(num(x.count) || 1)}대</em></button>`).join('')}
        </div>` : ''}
        <div class="side-actions">
          <button class="btn btn-sm btn-primary" id="side-incident">${icon('alert')} 사고·클레임</button>
          <button class="btn btn-sm btn-ghost" id="side-assign">${icon('route')} 가배차</button>
          <button class="btn btn-sm btn-ghost" id="side-driver">${icon('search')} 기사 이력</button>
        </div>
      </div>`;
  };

  const bindSide = (root, close) => {
    root.querySelector('#side-close')?.addEventListener('click', () => {
      if (close) close();
      else { ui.split = false; $('#board-work').classList.remove('with-side'); $('#btn-split').classList.remove('btn-soft'); renderSide(null); }
    });
    root.querySelector('#side-copy')?.addEventListener('click', async () => {
      const raw = state.dispatch.find((x) => x.id === ui.selectedId),r=raw?effectiveRow(raw):null;
      if (!r?.vin) return;
      try { await navigator.clipboard.writeText(r.vin); toast('차대번호를 복사했습니다.', 'success'); } catch { toast('복사할 수 없습니다.', 'warn'); }
    });
    root.querySelector('#side-incident')?.addEventListener('click', () => {
      const raw = state.dispatch.find((x) => x.id === ui.selectedId),r=raw?effectiveRow(raw):null;
      if (r) { if (close) close(); openIncident(r); }
    });
    root.querySelector('#side-assign')?.addEventListener('click', () => { if (close) close(); location.hash = '#/assign'; });
    root.querySelector('#side-safety')?.addEventListener('click', () => {
      const raw = state.dispatch.find((x) => x.id === ui.selectedId),r=raw?effectiveRow(raw):null;
      if (r) { if (close) close(); location.hash = `#/safety?plate=${encodeURIComponent(r.vehicleNo || '')}`; }
    });
    root.querySelector('#side-driver')?.addEventListener('click', () => {
      const raw = state.dispatch.find((x) => x.id === ui.selectedId),r=raw?effectiveRow(raw):null;
      if (!r?.driver) return;
      if (close) close();
      ui.q = r.driver; ui.from = addDays(r.date, -90); ui.to = addDays(r.date, 30); ui.assign = '';
      $('#f-q').value = ui.q; $('#f-from').value = ui.from; $('#f-to').value = ui.to;
      resetView();
    });
    root.querySelectorAll('[data-recent]').forEach((b) => {
      b.onclick = () => {
        const row = state.dispatch.find((x) => x.id === b.dataset.recent);
        if (!row) return;
        if (close) close();
        if (row.date < ui.from || row.date > ui.to) {
          ui.from = row.date; ui.to = row.date;
          $('#f-from').value = row.date; $('#f-to').value = row.date;
          resetView();
        }
        selectRow(row.id, { scroll: true });
      };
    });
  };

  const renderSide = (r) => {
    const side = $('#board-side');
    if (!side) return;
    if (!ui.split) { side.innerHTML = ''; return; }
    side.innerHTML = sideHtml(r);
    bindSide(side);
  };

  const openDetail = (r) => {
    if (ui.split) {
      ui.selectedId = r.id;
      syncSelection();
      renderSide(r);
      return;
    }
    const drawer = openDrawer({
      title: r.customer || '배차 상세',
      sub: `${dateLabel(r.date, true)} · ${r.origin || '-'} → ${r.destination || '-'}`,
      wide: true,
      body: sideHtml(r, true),
      onMount(el, close) {
        ui.selectedId = r.id;
        bindSide(el, close);
        el.querySelector('#side-close')?.addEventListener('click', close);
      },
    });
    return drawer;
  };

  function openIncident(r) {
    openModal({
      title: '사고·클레임 등록',
      sub: `${r.customer || ''} · ${r.vin || ''} · ${r.destination || ''}`,
      body: `<div class="form-grid">
        <div class="field"><label>유형</label><select class="select" id="inc-type"><option>클레임</option><option>사고</option><option>지연</option><option>미출고</option><option>기타</option></select></div>
        <div class="field"><label>심각도</label><select class="select" id="inc-sev"><option>중</option><option>상</option><option>하</option></select></div>
        <div class="field"><label>비용 (원)</label><input class="input" type="number" id="inc-cost" placeholder="0"></div>
        <div class="field full"><label>내용</label><textarea class="textarea" id="inc-desc">${esc(r.origin || '')} → ${esc(r.destination || '')} 운송 관련</textarea></div>
      </div>`,
      foot: `<button class="btn btn-ghost" data-close>취소</button><button class="btn btn-primary" id="inc-save">등록</button>`,
      onMount(el, close) {
        el.querySelector('#inc-save').onclick = async () => {
          await saveIncident({
            date: r.date, type: el.querySelector('#inc-type').value, severity: el.querySelector('#inc-sev').value,
            driverId: r.driverId || '', driverName: r.driver, vehicleNo: r.vehicleNo, vin: r.vin,
            customer: r.customer, destination: r.destination, cost: num(el.querySelector('#inc-cost').value),
            description: el.querySelector('#inc-desc').value.trim(),
          });
          close();
          toast('사고·클레임에 등록했습니다. 평가에 반영됩니다.', 'success');
        };
      },
    });
  }

  /* ---------------- selection / bulk ---------------- */
  const selectedRows = () => [...ui.selected].map((id) => state.dispatch.find((r) => r.id === id)).filter(Boolean);

  const bulkAssignModal = () => {
    const rows = selectedRows();
    const candidates=rows.filter(r=>ledger.byId.get(r.id)?.kind==='pending'&&!ledger.byId.get(r.id)?.duplicate);
    if (!candidates.length) return toast('선택한 건 중 배정 가능한 미배차 건이 없습니다.', 'warn');
    const dates = [...new Set(candidates.map((r) => r.date))];
    const activeDrivers = state.drivers.filter((d) => dates.every(date => availabilityOn(d,date,state.equipment).available)).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    if (!activeDrivers.length) return toast('선택한 날짜에 모두 운행 가능한 기사가 없습니다. 기사 스케줄을 확인하세요.', 'warn');
    openModal({
      title: '기사 일괄 배정',
      sub: `선택 ${nf(rows.length)}건 중 배정 가능 ${nf(candidates.length)}건`,
      body: `<div class="insight" style="margin-bottom:12px">${icon('info')}<div>선택한 미배차 건을 한 기사에게 <b>확정 배차</b>합니다. 이미 배차된 건·예외 건은 자동으로 제외됩니다.<br><span class="tiny">${dates.map((d) => `${shortDate(d)} ${nf(candidates.filter((r) => r.date === d).length)}건`).join(' · ')}</span></div></div>
        <div class="field"><label>배정 기사</label><select class="select" id="ba-driver">${activeDrivers.map((d) => `<option value="${d.id}">${esc(d.name)} · ${esc(d.vehicleNo || '차량 미지정')} · ${esc(d.type || '')}</option>`).join('')}</select></div>
        <div class="grid grid-2" style="margin-top:10px">
          ${(() => {
            const c = candidates.reduce((s, r) => s + (num(r.count) || 1), 0);
            return `<div class="stat-tile"><span>배정 대수</span><b>${nf(c)}대</b></div><div class="stat-tile"><span>제외</span><b>${nf(rows.length - candidates.length)}건</b></div>`;
          })()}
        </div>`,
      foot: `<button class="btn btn-ghost" data-close>취소</button><button class="btn btn-primary" id="ba-go" ${activeDrivers.length ? '' : 'disabled'}>${icon('check')} 확정 배정</button>`,
      onMount(el, close) {
        el.querySelector('#ba-go').onclick = async () => {
          const driver = state.drivers.find((d) => d.id === el.querySelector('#ba-driver').value);
          if (!driver) return;
          close();
          try {
            const res = await bulkAssignOrders(candidates, driver);
            refreshOverlay();
            ui.selected.clear();
            resetView();
            toast(`${nf(res.assigned)}대를 ${driver.name} 기사로 확정 배정했습니다.${res.skipped ? ` (${res.skipped}건 제외)` : ''}`, 'success', 5000);
          } catch (err) { toast(`배정 실패: ${err.message}`, 'error'); }
        };
      },
    });
  };

  const openColumns = () => {
    openModal({
      title: '표시할 열',
      sub: '1600대 규모에서는 핵심 열만 남기면 한 화면에 더 많이 들어옵니다.',
      body: `<div class="column-grid">${Object.entries(COLS).map(([k, c]) => `<label class="check"><input type="checkbox" data-col="${k}" ${ui.cols.has(k) ? 'checked' : ''}> ${c.label}</label>`).join('')}</div>`,
      foot: `<button class="btn btn-ghost" data-close>취소</button><button class="btn btn-primary" id="col-apply">적용</button>`,
      onMount(el, close) {
        el.querySelector('#col-apply').onclick = () => {
          const next = [...el.querySelectorAll('[data-col]:checked')].map((c) => c.dataset.col);
          if (!next.length) return toast('열을 하나 이상 선택하세요.', 'warn');
          ui.cols = new Set(next);
          savePrefs(ui);
          close();
          resetView();
        };
      },
    });
  };

  const exportRows = (rows, name) => {
    if (!rows.length) return toast('내보낼 데이터가 없습니다.', 'warn');
    exportXlsx({ 배차판: [EXPORT_HEADERS, ...rows.map(r=>toExportRow(effectiveRow(r)))] }, name);
  };

  /* ---------------- table events ---------------- */
  $('#tbody').addEventListener('click', (e) => {
    const check = e.target.closest('[data-check]');
    if (check) {
      if (check.checked) ui.selected.add(check.dataset.check); else ui.selected.delete(check.dataset.check);
      updateSelected();
      return;
    }
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const r = state.dispatch.find((x) => x.id === tr.dataset.id);
    if (r) { ui.selectedId = r.id; syncSelection(); openDetail(r); }
  });
  $('#tbody').addEventListener('dblclick', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const r = state.dispatch.find((x) => x.id === tr.dataset.id);
    if (r) openDetail(r);
  });

  $('#board-scroll').addEventListener('scroll', () => {
    const el = $('#board-scroll');
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 260) loadMore();
  });
  $('#board-scroll').addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) return;
    if (e.key === 'Escape') {
      if (ui.full) setFull(false); else ui.selectedId = null;
      renderSide(null); syncSelection();
      return;
    }
    e.preventDefault();
    const idx = allRows.findIndex((r) => r.id === ui.selectedId);
    const next = Math.max(0, Math.min(allRows.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1)));
    if (allRows[next]) {
      while (next >= rendered && rendered < allRows.length) loadMore();
      selectRow(allRows[next].id, { scroll: true });
      if (e.key === 'Enter') openDetail(allRows[next]);
    }
  });
  $('#btn-scroll-top').onclick = () => { $('#board-scroll').scrollTo({ top: 0, behavior: 'smooth' }); };

  $('#btn-select-unassigned').onclick = async () => {
    const rows=allRows.filter(r=>ledger.byId.get(r.id)?.kind==='pending'&&!ledger.byId.get(r.id)?.duplicate);
    if (!rows.length) return toast('현재 필터에 미배차 건이 없습니다.', 'warn');
    if (rows.length > 300 && !(await confirmBox(`미배차 ${nf(rows.length)}건을 모두 선택할까요?`, { title: '미배차 선택', ok: '선택' }))) return;
    rows.forEach((r) => ui.selected.add(r.id));
    syncSelection();
  };
  $('#bulk-clear').onclick = () => { ui.selected.clear(); syncSelection(); };
  $('#bulk-assign').onclick = bulkAssignModal;
  $('#bulk-export').onclick = () => exportRows(selectedRows(), `M&M_선택배차_${todayStr()}.xlsx`);
  $('#btn-export').onclick = () => exportRows(allRows, `M&M_배차내역_${ui.from || 'all'}_${ui.to || 'all'}.xlsx`);

  /* ---------------- filters ---------------- */
  const setRange = (from, to, segment = '') => {
    ui.from = from; ui.to = to;
    $('#f-from').value = from; $('#f-to').value = to;
    $$('#range-seg button').forEach((b) => b.classList.toggle('active', b.dataset.range === segment));
    resetView();
  };
  $('#f-q').addEventListener('input', debounce((e) => { ui.q = e.target.value; resetView(); }, 180));
  $('#f-from').addEventListener('change', (e) => { ui.from = e.target.value; if (ui.from > ui.to) ui.to = ui.from; $('#f-to').value = ui.to; resetView(); });
  $('#f-to').addEventListener('change', (e) => { ui.to = e.target.value; if (ui.to < ui.from) ui.from = ui.to; $('#f-from').value = ui.from; resetView(); });
  $('#f-assign').addEventListener('change', (e) => { ui.assign = e.target.value; resetView(); });
  $('#f-region').addEventListener('change', (e) => { ui.region = e.target.value; resetView(); });
  $$('#range-seg button').forEach((b) => {
    b.onclick = () => {
      const v = b.dataset.range;
      const d = state.workdate || todayStr();
      if (v === 'today') setRange(d, d, 'today');
      else if (v === '7') setRange(addDays(d, -6), d, '7');
      else if (v === '30') setRange(addDays(d, -29), d, '30');
      else setRange('', '', 'all');
    };
  });

  $('#btn-density').onclick = () => {
    ui.density = ui.density === 'compact' ? 'normal' : 'compact';
    $('#btn-density span').textContent = ui.density === 'compact' ? '조밀' : '보통';
    $('#tbl').classList.toggle('compact', ui.density === 'compact');
    $('#tbl').classList.toggle('normal', ui.density !== 'compact');
    savePrefs(ui);
  };
  $('#btn-split').onclick = () => {
    ui.split = !ui.split;
    $('#board-work').classList.toggle('with-side', ui.split);
    $('#btn-split').classList.toggle('btn-soft', ui.split);
    savePrefs(ui);
    if (ui.split) renderSide(state.dispatch.find((r) => r.id === ui.selectedId)); else $('#board-side').innerHTML = '';
  };
  $('#btn-columns').onclick = openColumns;
  const setFull = (v) => {
    ui.full = v;
    document.body.classList.toggle('board-focus', v);
    $('#btn-full').innerHTML = `${icon(v ? 'minimize' : 'maximize')} ${v ? '집중 종료' : '집중'}`;
  };
  $('#btn-full').onclick = () => setFull(!ui.full);
  window.addEventListener('hashchange', () => document.body.classList.remove('board-focus'), { once: true });

  $('#btn-duplicates').onclick = async () => {
    try {
      const from=ui.from,to=ui.to,result=await reviewDuplicates(from,to);
      openModal({title:'VIN 중복 점검',size:'xl',body:`<p>${esc(from)} ~ ${esc(to)} · 원장 ${nf(result.totalRows)}행 · 대수 2 이상 ${nf(result.multipleUnits)}행 · 같은 일자·VIN·출발지·도착지 ${nf(result.groups.length)}개 그룹. 빈칸 보완 가능한 중복 ${nf(result.archiveCount)}건 / ${nf(result.archiveUnits)}대 정리 가능. 배정·정산·마감 연결 ${nf(result.protectedGroups)}그룹 / 실제 내용 충돌 ${nf(result.conflictGroups)}그룹 보류.</p><p class="small muted">${!result.archiveCount?'정리 가능한 건이 없어 버튼이 비활성화되어 있습니다. 아래 판정과 연결 여부를 확인하세요. ':''}정보가 더 많은 원본을 유지하고 한쪽에만 있는 차량번호·연락처·코드 등 빈칸을 보완합니다. 양쪽에 서로 다른 값이 있거나 가배차·정산·마감에 연결된 그룹은 보류합니다. 가배차 연결만 남았다면 창을 닫고 전체 배차 취소 후 다시 점검하세요. 정산·마감 자료는 담당자 확인이 필요합니다. 같은 VIN의 다른 구간은 별도 운송으로 유지합니다. 정리한 원본은 보관하며 복원할 수 있습니다.</p><div class="scroll-x" style="max-height:55vh;overflow:auto"><table class="data"><thead><tr><th>VIN / 구간</th><th>등록 내용 / 원본</th><th>판정</th></tr></thead><tbody>${result.groups.map(g=>`<tr><td>${esc(g.rows[0].vin)}<br>${esc(g.rows[0].origin)} → ${esc(g.rows[0].destination)}</td><td>${g.rows.map(r=>`${esc(r.driver || '미배차')} · ${nf(r.count || 1)}대 · ${esc(r.sourceFile || '-')} / ${esc(r.sheet || r.tab || '')} ${esc(r.rowNumber || '')}행`).join('<br>')}</td><td>${g.protectedGroup?'배정·정산·예외 연결: 보류':g.conflict?'서로 다른 값: 확인 필요':'빈칸 보완 후 정리 가능'}</td></tr>`).join('') || '<tr><td colspan="3">동일 구간 중복이 없습니다.</td></tr>'}</tbody></table></div>`,foot:`<button class="btn btn-ghost" data-close>닫기</button>${result.lastArchive?'<button class="btn btn-ghost" id="dup-restore">최근 정리 복원</button>':''}<button class="btn btn-danger" id="dup-apply" ${result.archiveCount?'':'disabled'}>중복 보관·정리 (빈칸 보완)</button>`,onMount(el,close){
        el.querySelector('#dup-apply').onclick=async()=>{if(!await confirmBox('같은 운송의 빈칸을 보완하고 중복 원본을 보관 후 집계에서 제외할까요? 서로 다른 값이 있거나 배정·정산에 연결된 건은 유지합니다.',{title:'중복 정리',ok:'보관·정리',danger:true}))return;try{const done=await reviewDuplicates(from,to,true);close();renderBoard(view,ctx);toast(`${nf(done.archiveCount)}건 / ${nf(done.archiveUnits)}대 중복 정리 완료`,'success');}catch(e){toast(e.message,'error');}};
        el.querySelector('#dup-restore')?.addEventListener('click',async()=>{if(!await confirmBox('최근 정리 자료를 복원할까요? 중복 대수가 다시 집계됩니다.'))return;try{await restoreDuplicateArchive(result.lastArchive.key);close();renderBoard(view,ctx);toast('복원 완료','success');}catch(e){toast(e.message,'error');}});
      }});
    }catch(e){toast(e.message,'error');}
  };
  $('#btn-unassign-all').onclick = async () => {
    const button = $('#btn-unassign-all');
    button.disabled = true;
    try {
      const from=ui.from, to=ui.to;
      const preview=await cancelAssignments(from,to,true);
      if (!preview.count) return toast(`해제할 배정이 없습니다. 보호된 자료 ${nf(preview.protectedCount)}건`, 'warn');
      const ok=await confirmBox(`${from} ~ ${to} 전체 ${nf(preview.count)}건의 기사·차량·회전 배정을 해제할까요? 검색·기사·권역 필터와 관계없이 이 기간 전체에 적용합니다. 운송 접수 내용과 금액은 유지합니다. 가배차안도 함께 해제합니다. 마감·정산 확정 자료 ${nf(preview.protectedCount)}건은 제외합니다.`, {title:'전체 배차 취소 · 재배차',ok:'배정 해제',danger:true});
      if (!ok) return;
      const result=await cancelAssignments(from,to);
      ui.selected.clear(); ui.selectedId=null; ui.assign='unassigned'; $('#f-assign').value='unassigned';
      ui.q=''; $('#f-q').value=''; ui.region=''; $('#f-region').value=''; ui.status='';
      refreshOverlay(); resetView(); renderSide(null);
      toast(`${nf(result.count)}건 배정 해제 완료. 미배차 건을 선택해 재배차하세요.`, 'success');
    } catch(e) {toast(e.message,'error');} finally {button.disabled=false;}
  };
  $('#btn-clean').onclick = async () => {
    if (!ui.from || !ui.to) return toast('기간을 먼저 지정하세요.', 'warn');
    const ok = await confirmBox(`${ui.from} ~ ${ui.to} 배차 데이터를 삭제할까요? 원본 파일은 그대로입니다.`, { title: '기간 삭제', ok: '삭제', danger: true });
    if (!ok) return;
    const n = await deleteDispatchByDates(ui.from, ui.to);
    toast(`${nf(n)}건을 삭제했습니다.`, 'success');
    refreshOverlay();
    renderDates();
    resetView();
  };
  $('#btn-google-import').onclick = () => openSheetImport({ from: ui.from || base, to: ui.to || base, onImported: () => renderBoard(view, ctx) });
  $('#btn-template').onclick = () => exportXlsx({ '배차판 템플릿': buildTemplateRows() }, 'M&M_배차판_템플릿.xlsx');
  $('#btn-upload').onclick = openUpload;

  function openUpload() {
    const session = { parsed: null, fileName: '', buffer: null, overrides: {} };
    const { el, close } = openModal({
      title: '배차판 업로드',
      sub: 'XLSX · XLS · CSV · ODS / 여러 시트를 한 번에 인식합니다.',
      size: 'xwide',
      body: `<div id="upl-body">
        <div class="steps">
          <div class="step on" data-step="1"><span class="n">1</span>파일 선택</div><span class="step-sep"></span>
          <div class="step" data-step="2"><span class="n">2</span>열 매핑 확인</div><span class="step-sep"></span>
          <div class="step" data-step="3"><span class="n">3</span>가져오기</div>
        </div>
        <div class="dropzone" id="dz">
          <div class="dz-icon">${icon('upload')}</div>
          <h4>배차판 파일을 끌어다 놓으세요</h4>
          <p>또는 클릭해서 선택 · 최대 40MB · 원본 파일은 수정하지 않습니다</p>
          <input type="file" id="file" accept=".xlsx,.xls,.xlsm,.csv,.ods" class="hidden">
        </div>
        <div id="upl-result" style="margin-top:16px"></div>
      </div>`,
      foot: `<button class="btn btn-ghost" data-close>닫기</button><button class="btn btn-primary" id="btn-commit" disabled>${icon('check')} 가져오기</button>`,
      onMount(_el, _close) {
        const dz = _el.querySelector('#dz');
        const input = _el.querySelector('#file');
        const commitBtn = _el.querySelector('#btn-commit');
        dz.onclick = () => input.click();
        dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
        dz.ondragleave = () => dz.classList.remove('over');
        dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); };
        input.onchange = () => { if (input.files?.[0]) handleFile(input.files[0]); };

        async function handleFile(file) {
          if (file.size > 40 * 1024 * 1024) return toast('40MB 이하 파일만 업로드할 수 있습니다.', 'warn');
          session.fileName = file.name;
          const res = _el.querySelector('#upl-result');
          res.innerHTML = `<div class="file-card"><div class="fi">${icon('file')}</div><div class="meta"><strong>${esc(file.name)}</strong><small>읽는 중… 대용량 파일은 1~2분 걸릴 수 있습니다.</small></div></div>`;
          try {
            session.buffer = await readFile(file);
            session.parsed = parseWorkbook(session.buffer, file.name);
            renderPreview(_el, session, commitBtn);
          } catch (err) {
            res.innerHTML = `<div class="insight warn">${icon('warning')}<div>${esc(err.message)}</div></div>`;
          }
        }

        commitBtn.onclick = async () => {
          if (!session.parsed) return;
          const overrides = collectOverrides(_el);
          const parsed = Object.keys(overrides).length ? parseWorkbook(session.buffer, session.fileName, { mappingOverrides: overrides }) : session.parsed;
          const rows = parsed.sheets.flatMap((sh) => sh.rows).filter((r) => r.date);
          const skipped = parsed.sheets.flatMap((sh) => sh.rows).length - rows.length;
          if (!rows.length) return toast('가져올 수 있는 행이 없습니다. 열 매핑을 확인하세요.', 'warn');
          commitBtn.disabled = true;
          commitBtn.innerHTML = '<span class="small">저장 중… 0%</span>';
          const normalized = rows.map((r) => ({ ...r, dedupeKey: [r.date, r.vin, r.departTime, r.destination, r.driver].join('|') }));
          try {
            const result = await commitDispatch(normalized, {
              fileName: session.fileName,
              sheets: parsed.sheets.map((s) => s.name),
              dates: parsed.totals.dates,
              warnings: parsed.warnings,
            }, (p) => { commitBtn.innerHTML = `<span class="small">저장 중… ${Math.round(p * 100)}%</span>`; });
            const autoDrivers = session.el?.querySelector('#import-drivers')?.checked;
            let newDrivers = { created: 0, linked: 0 };
            if (autoDrivers) newDrivers = await registerDriversFromRows(normalized);
            const latest = parsed.totals.dateTo;
            if (latest) await setWorkdate(latest);
            close();
            toast(`${nf(result.inserted)}건 신규 · ${nf(result.updated)}건 갱신 · ${nf(result.held || 0)}건 중복·필수값·마감 확인 보류${skipped ? ` · ${skipped}건 제외` : ''}${newDrivers.created || newDrivers.linked ? ` · 기사 ${newDrivers.created}명 등록${newDrivers.linked ? ` · ${newDrivers.linked}명 별칭 연결` : ''}` : ''}`, 'success', 6000);
            renderBoard(view, ctx);
          } catch (err) {
            commitBtn.disabled = false;
            commitBtn.innerHTML = '가져오기';
            toast(`저장 실패: ${err.message}`, 'error');
          }
        };
      },
    });
  }

  function renderPreview(el, session, commitBtn) {
    session.el = el;
    const p = session.parsed;
    const box = el.querySelector('#upl-result');
    const step = (n) => el.querySelectorAll('.step').forEach((s) => {
      const i = Number(s.dataset.step);
      s.classList.toggle('on', i === n);
      s.classList.toggle('done', i < n);
    });
    step(2);
    const allRows = p.sheets.flatMap((s) => s.rows);
    const preview = allRows.slice(0, 8);
    box.innerHTML = `
      <div class="file-card" style="margin-bottom:12px">
        <div class="fi">${icon('file')}</div>
        <div class="meta"><strong>${esc(p.fileName)}</strong><small>시트 ${p.sheets.length}개 · ${nf(p.totals.rows)}행 · ${p.totals.dateFrom || '?'} ~ ${p.totals.dateTo || '?'}</small></div>
        <span class="badge green">인식 완료</span>
      </div>
      ${p.warnings.length ? `<div class="insight warn" style="margin-bottom:12px">${icon('warning')}<div>${p.warnings.slice(0, 4).map(esc).join('<br>')}</div></div>` : ''}
      <div class="row" style="gap:6px;margin-bottom:10px">
        <span class="badge blue">${nf(p.totals.rows)}행</span>
        <span class="badge gray">${p.sheets.length}시트</span>
        ${p.totals.duplicates ? `<span class="badge amber">중복 의심 ${nf(p.totals.duplicates)}</span>` : ''}
        ${p.totals.missingDriver ? `<span class="badge amber">운전자 없음 ${nf(p.totals.missingDriver)}</span>` : ''}
        ${p.totals.missingDate ? `<span class="badge red">일자 없음 ${nf(p.totals.missingDate)}</span>` : ''}
      </div>
      <label class="check" style="margin-bottom:10px"><input type="checkbox" id="import-drivers" checked> 배차판에만 있는 운전자 <b>${nf(unknownDriversFromRows(allRows).length)}명</b>을 기사로 자동 등록</label>
      <div class="card" style="overflow:hidden;margin-bottom:12px">
        <div class="card-tight row-between" style="border-bottom:1px solid var(--line-2)">
          <strong style="font-size:12px">시트별 열 매핑</strong>
          <span class="tiny muted">자동 인식이 틀리면 직접 바꿀 수 있습니다</span>
        </div>
        <div style="max-height:250px;overflow:auto">
          <table class="map-table">
            <thead><tr><th style="width:110px">시트</th><th>거래처</th><th>배차일자</th><th>도착지</th><th>차대번호</th><th>기사</th><th>댓수/회전</th></tr></thead>
            <tbody>
              ${p.sheets.map((sh) => `<tr data-sheet="${esc(sh.name)}">
                <td><strong>${esc(sh.name)}</strong><div class="tiny muted">${nf(sh.rowCount)}행</div></td>
                ${['customer', 'date', 'destination', 'vin', 'driver'].map((key) => `<td>${mapSelect(sh, key)}</td>`).join('')}
                <td>${mapSelect(sh, 'count')}${mapSelect(sh, 'turn')}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="card-tight" style="border-top:1px solid var(--line-2)">
          <details>
            <summary style="cursor:pointer;font-size:11.5px;color:var(--muted);font-weight:600">나머지 열 매핑 보기 (출발지·차종·연락처·청구 등)</summary>
            <div style="margin-top:10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px">
              ${p.sheets.map((sh) => `<div><div class="tiny muted" style="margin-bottom:3px">${esc(sh.name)}</div>${FIELD_DEFS.filter((f) => !['customer', 'date', 'destination', 'vin', 'driver', 'count', 'turn'].includes(f.key)).map((f) => `<div style="margin-bottom:4px"><span class="tiny muted">${f.label}</span>${mapSelect(sh, f.key)}</div>`).join('')}</div>`).join('')}
            </div>
          </details>
        </div>
      </div>
      <div class="section-head"><h3>미리보기</h3><span class="hint">앞 8행</span></div>
      <div class="scroll-x" style="border:1px solid var(--line);border-radius:10px;max-height:280px;overflow:auto">
        <table class="preview-table">
          <thead><tr><th>일자</th><th>거래처</th><th>출발지</th><th>도착지</th><th>차종</th><th>차대번호</th><th>기사</th><th>대수</th><th>상태</th></tr></thead>
          <tbody>
            ${preview.map((r) => `<tr><td>${esc(r.date)}</td><td>${esc(r.customer)}</td><td>${esc(r.origin)}</td><td>${esc(r.destination)}</td><td>${esc(r.model).slice(0, 24)}</td><td>${esc(r.vin)}</td><td>${esc(r.driver) || '<span class="muted">미배차</span>'}</td><td>${num(r.count) || 1}</td><td>${statusMeta[r.status]?.label || '정상'}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    commitBtn.disabled = false;
    step(3);
  }

  function mapSelect(sh, key) {
    const idx = sh.mapping[key];
    return `<select data-map="${esc(sh.name)}:${key}">
      <option value="">—</option>
      ${sh.headers.map((h, i) => `<option value="${i}" ${i === idx ? 'selected' : ''}>${esc(h || `열 ${i + 1}`)}</option>`).join('')}
    </select>`;
  }

  function collectOverrides(el) {
    const out = {};
    el.querySelectorAll('[data-map]').forEach((sel) => {
      const [sheet, key] = sel.dataset.map.split(':');
      if (!out[sheet]) out[sheet] = {};
      if (sel.value !== '') out[sheet][key] = Number(sel.value);
      else out[sheet][key] = undefined;
    });
    return out;
  }



  /* ---------------- import history ---------------- */
  const renderImports = () => {
    const body = $('#import-body');
    if (!body) return;
    if (!state.imports.length) {
      body.innerHTML = `<tr><td colspan="6" class="muted small" style="padding:18px">아직 업로드한 이력이 없습니다.</td></tr>`;
      return;
    }
    body.innerHTML = state.imports.slice(0, 8).map((imp) => {
      const dates = (imp.dates || []).slice().sort();
      const range = dates.length ? `${dates[0]} ~ ${dates[dates.length - 1]}` : '-';
      return `<tr>
        <td><div class="t-title">${esc(imp.fileName)}</div><div class="tiny muted">시트 ${imp.sheets?.length || 0}개</div></td>
        <td class="small muted">${timeAgo(imp.importedAt)}</td>
        <td class="num">${nf(imp.inserted)}</td>
        <td class="num">${nf(imp.updated)}</td>
        <td class="small">${esc(range)}${imp.sheets?.length > 2 ? ` · ${esc(imp.sheets.slice(0, 2).join(', '))} 외` : ''}</td>
        <td class="right nowrap"><button class="btn btn-xs btn-ghost" data-import-range="${imp.id}">기간 보기</button> <button class="btn btn-xs btn-danger" data-del-import="${imp.id}">${icon('trash')} 삭제</button></td>
      </tr>`;
    }).join('');
    body.querySelectorAll('[data-import-range]').forEach((b) => {
      b.onclick = () => {
        const imp = state.imports.find((x) => x.id === b.dataset.importRange);
        if (!imp?.dates?.length) return;
        const dates = imp.dates.slice().sort();
        setRange(dates[0], dates[dates.length - 1], '');
      };
    });
    body.querySelectorAll('[data-del-import]').forEach((b) => {
      b.onclick = async () => {
        const imp = state.imports.find((x) => x.id === b.dataset.delImport);
        if (!imp) return;
        if (!(await confirmBox(`'${imp.fileName}'으로 가져온 배차 ${nf(imp.inserted + imp.updated)}건을 모두 삭제할까요?`, { title: '가져오기 삭제', ok: '삭제', danger: true }))) return;
        const n = await deleteImport(imp.id);
        toast(`${nf(n)}건을 삭제했습니다.`, 'success');
        refreshOverlay();
        renderDates();
        resetView();
        renderImports();
      };
    });
  };

  /* ---------------- init ---------------- */
  refreshOverlay();
  const regionSet = new Set();
  for (const r of state.dispatch) regionSet.add(r.region || regionOf(r.destination));
  $('#f-region').innerHTML = `<option value="">전체 권역</option>${[...regionSet].filter(Boolean).sort().map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}`;
  renderDates();
  resetView();
  renderImports();
}
