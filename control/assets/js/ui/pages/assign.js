import {
  $, $$, esc, icon, nf, num, dateLabel, shortDate, todayStr, round, exportXlsx, openModal, openDrawer,
  toast, regionOf, statusMeta, normalizePlate, confirmBox, copyText,
} from '../../core/utils.js';
import { state, rowsOn, hasDriver, isCounted, saveAssignmentPlan, assignmentsOn, saveSettings, setWorkdate, plannedOverlay } from '../../core/data.js';
import { autoAssign, reassignOrder, bestForOrder, planExportRows } from '../../core/assign.js';
import { pageHead, banner, sectionHead, kpi, statTile } from '../components.js';
import { EXPORT_HEADERS, toExportRow } from '../../core/importer.js';

let cached = null;

export default function renderAssign(view) {
  const date = state.workdate || todayStr();
  if (cached && cached.date !== date) cached = null;
  const rows = rowsOn(date);
  const counted = rows.filter(isCounted);
  const overlay = plannedOverlay(date);
  const unassigned = counted.filter((r) => !hasDriver(r) && !overlay.has(r.id));
  const total = counted.reduce((s, r) => s + (num(r.count) || 1), 0);
  const assigned = counted.filter(hasDriver).reduce((s, r) => s + (num(r.count) || 1), 0);
  const existing = assignmentsOn(date);

  view.innerHTML = `
    <div class="print-only" style="margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #0b1e33;padding-bottom:8px">
        <div style="display:flex;align-items:center;gap:10px"><img src="${state.settings.logo || 'assets/logo.png'}" style="height:30px"><strong style="font-size:15px">M&M통운 가배차표</strong></div>
        <div style="font-size:11px;color:#555">${dateLabel(date, true)} · ${state.settings.company}</div>
      </div>
    </div>
    ${pageHead('가배차', '기존 배차 이력·평가등급·선호 권역·일일 부하를 함께 계산해 추천 배차안을 만듭니다.', `
      <button class="btn btn-ghost" id="btn-print">${icon('print')} 출력</button>
      <button class="btn btn-ghost" id="btn-export-board">${icon('download')} 배차판 형식</button>
      <button class="btn btn-primary" id="btn-run">${icon('spark')} 추천 배차 실행</button>`)}

    <div class="card card-pad no-print" style="margin-bottom:16px">
      <div class="row-between" style="gap:14px">
        <div class="row" style="gap:10px">
          <div class="field" style="min-width:150px">
            <label>배차 기준일</label>
            <input class="input" type="date" id="as-date" value="${date}">
          </div>
          <div class="field" style="min-width:110px">
            <label>기사 1인 한도</label>
            <input class="input" type="number" id="as-cap" min="1" max="40" value="${state.settings.assign.maxPerDriver}">
          </div>
          <div class="field" style="min-width:180px">
            <label>배차 범위</label>
            <select class="select" id="as-scope">
              <option value="unassigned">미배차 건만</option>
              <option value="all">전체 재배차(시뮬레이션)</option>
            </select>
          </div>
          <div class="field" style="min-width:130px">
            <label>정렬 기준</label>
            <select class="select" id="as-preset">
              <option value="balanced">균형 배차</option>
              <option value="history">이력 우선</option>
              <option value="grade">등급 우선</option>
              <option value="load">부하 분산</option>
            </select>
          </div>
        </div>
        <div class="row" style="gap:6px">
          <span class="pill"><span class="dot" style="background:${unassigned.length ? 'var(--amber)' : 'var(--green)'}"></span>미배차 ${nf(unassigned.reduce((n, r) => n + (num(r.count) || 1), 0))}대</span>
          <span class="pill">기사 ${nf(state.drivers.filter((d) => d.status === 'active').length)}명</span>
        </div>
      </div>
    </div>

    <div id="as-summary" style="margin-bottom:16px"></div>
    <div id="as-notice"></div>
    <div id="as-plans"></div>
    <div id="as-unassigned" style="margin-top:14px"></div>

    ${existing.length ? `<div class="section"><div class="section-head"><h3>저장된 가배차</h3><span class="hint">${dateLabel(date)}</span></div>
      <div class="card card-pad"><div class="row" style="gap:8px"><span class="badge ${existing[0].status === 'confirmed' ? 'green' : 'blue'}">${existing[0].status === 'confirmed' ? '확정' : '초안'}</span>
      <span class="small muted">${existing.length}명 · ${nf(existing.reduce((s, a) => s + (a.totalCount || 0), 0))}대 · ${new Date(existing[0].updatedAt).toLocaleString('ko-KR')}</span>
      <a class="link" href="#/m/driver" data-link style="margin-left:auto">기사용 화면 →</a></div></div></div>` : ''}

    <div class="section no-print">
      <div class="section-head"><h3>추천 기준</h3><span class="hint">설정에서 가중치를 조정할 수 있습니다</span></div>
      <div class="grid grid-4">
        ${[
          ['배차 이력', `${Math.round(state.settings.assign.historyWeight * 100)}%`, '같은 권역·거래처·도착지 경험'],
          ['평가 등급', `${Math.round(state.settings.assign.gradeWeight * 100)}%`, '최근 6개월 종합 점수'],
          ['선호 권역', `${Math.round(state.settings.assign.prefWeight * 100)}%`, '기사 선호·기피 지역'],
          ['부하 균형', `${Math.round(state.settings.assign.balanceWeight * 100)}%`, '일일 한도 대비 여유'],
        ].map(([t, v, d]) => `<div class="card card-pad"><div class="row-between"><span class="small strong">${t}</span><span class="badge blue">${v}</span></div><div class="tiny muted" style="margin-top:5px">${d}</div></div>`).join('')}
      </div>
    </div>
  `;

  const plannedUnits = counted.filter((r) => !hasDriver(r) && overlay.has(r.id)).reduce((n, r) => n + (num(r.count) || 1), 0);
  const plannedDrivers = new Set(assignmentsOn(date).filter((a) => a.status === 'confirmed').map((a) => a.driverName));
  const summaryEl = $('#as-summary');
  const plansEl = $('#as-plans');
  const unEl = $('#as-unassigned');
  const noticeEl = $('#as-notice');

  const renderSummary = () => {
    const r = cached;
    const demand = r ? r.stats.demand : total;
    const assignedCount = r ? r.stats.assignedCount + (r.stats.lockedCount || 0) : assigned + plannedUnits;
    const coverage = demand ? round((assignedCount / demand) * 100, 1) : 0;
    summaryEl.innerHTML = `<div class="assign-summary">
      <div class="as"><span>수요</span><b>${nf(demand)}<small>대</small></b></div>
      <div class="as"><span>배정</span><b>${nf(assignedCount)}<small>대</small></b></div>
      <div class="as"><span>미배정</span><b>${nf(Math.max(0, demand - assignedCount))}<small>대</small></b></div>
      <div class="as"><span>투입 기사</span><b>${nf(r ? r.stats.driversUsed : new Set([...counted.filter(hasDriver).map((x) => x.driver), ...plannedDrivers]).size)}<small>명</small></b></div>
      <div class="as" style="margin-left:auto;min-width:150px">
        <span>커버리지</span>
        <b style="color:${coverage >= 95 ? '#7ee2b8' : coverage >= 80 ? '#ffd28a' : '#ff9b8a'}">${coverage}<small>%</small></b>
      </div>
    </div>`;
  };

  const renderPlans = () => {
    if (!cached) {
      if (!counted.length) {
        plansEl.innerHTML = `<div class="empty card" style="padding:52px 20px">
          <div class="icon">${icon('board')}</div>
          <h4>먼저 배차판을 업로드하세요</h4>
          <p>배차 데이터가 있어야 미배차 건과 기사 이력을 비교해 추천 배차안을 만들 수 있습니다.</p>
          <a class="btn btn-primary btn-lg" href="#/board" data-link>${icon('upload')} 배차판 업로드</a>
        </div>`;
      } else if (!state.drivers.length) {
        plansEl.innerHTML = `<div class="empty card" style="padding:52px 20px">
          <div class="icon">${icon('users')}</div>
          <h4>등록된 기사가 없습니다</h4>
          <p>기사 관리에서 직접 추가하거나 배차판의 운전자를 자동 등록하세요.</p>
          <a class="btn btn-primary btn-lg" href="#/drivers" data-link>${icon('users')} 기사 등록</a>
        </div>`;
      } else {
        plansEl.innerHTML = `<div class="empty card" style="padding:52px 20px">
          <div class="icon">${icon('route')}</div>
          <h4>추천 배차안이 아직 없습니다</h4>
          <p>${unassigned.length ? `미배차 ${unassigned.length}건을 기사 이력과 평가등급으로 자동 배정합니다.` : '현재 미배차 건이 없습니다. 전체 재배차로 시뮬레이션할 수 있습니다.'}</p>
          <button class="btn btn-primary btn-lg" id="empty-run">${icon('spark')} 추천 배차 실행</button>
        </div>`;
        $('#empty-run')?.addEventListener('click', run);
      }
      unEl.innerHTML = '';
      return;
    }
    if (!cached.plans.length) {
      const locked = cached.stats.lockedCount || 0;
      plansEl.innerHTML = locked
        ? `<div class="empty card" style="padding:48px 20px"><div class="icon">${icon('check')}</div><h4>확정된 가배차 ${nf(locked)}대가 있습니다</h4><p>미배차 건이 모두 확정되어 추가 배정이 없습니다. 기사용 모바일에서 확인하거나, 전체 재배차로 다시 계산할 수 있습니다.</p><a class="btn btn-ghost" href="#/m/driver" data-link>기사용 화면 열기</a></div>`
        : `<div class="empty card" style="padding:48px 20px"><div class="icon">${icon('alert')}</div><h4>배정 가능한 기사가 없습니다</h4><p>기사 관리에서 활동 상태와 차량 배정을 확인하거나, 1인 한도를 늘려 다시 실행하세요.</p></div>`;
      renderUnassigned();
      return;
    }
    plansEl.innerHTML = `
      <div class="section-head" style="margin-top:4px">
        <h3>기사별 배차안 <span class="count">${cached.plans.length}명</span></h3>
        <div class="row">
          <span class="hint no-print">카드의 주문을 눌러 기사를 바꿀 수 있습니다</span>
          <button class="btn btn-sm btn-soft" id="btn-save">${icon('check')} 가배차 저장</button>
          <button class="btn btn-sm btn-dark" id="btn-confirm">${icon('lock')} 확정</button>
        </div>
      </div>
      <div class="plan-list">
        ${cached.plans.map((p) => planCard(p)).join('')}
      </div>`;
    $('#btn-save').onclick = () => save('draft');
    $('#btn-confirm').onclick = () => save('confirmed');
    plansEl.querySelectorAll('[data-order]').forEach((el) => {
      el.onclick = () => openSwap(pickPlan(el.dataset.order), el.dataset.order);
    });
    renderUnassigned();
  };

  const planCard = (p) => `
    <div class="plan">
      <div class="plan-head">
        <span class="grade ${p.grade}">${p.grade}</span>
        <div class="who">
          <strong>${esc(p.driverName)}</strong>
          <small>${esc(p.vehicleNo || '차량 미지정')} · ${nf(p.score)}점 · 신뢰 ${Math.round((p.confidence || 0) * 100)}%</small>
        </div>
        <span class="badge ${p.totalCount > (num(state.settings.assign.maxPerDriver) || 14) ? 'red' : 'green'}">${nf(p.totalCount)}대</span>
      </div>
      <div class="plan-metrics">
        ${(p.regions || []).map((r) => `<span class="tag">${esc(r)}</span>`).join('')}
        <span class="tag">회전 ${nf(p.totalTurns)}</span>
        ${p.orders.some((o) => o.status === 'support') ? '<span class="badge amber">지원 포함</span>' : ''}
      </div>
      <div class="plan-orders">
        ${p.orders.map((o, i) => `
          <button class="plan-order" data-order="${o.id}" style="width:100%;text-align:left">
            <span class="seq" style="width:20px;height:20px;border-radius:6px;background:#eef5fc;color:#0f6fae;display:grid;place-items:center;font-size:9.5px;font-weight:800">${i + 1}</span>
            <span class="r">
              <strong>${esc(o.destination || '-')}</strong>
              <small>${esc(o.customer || '')} · ${esc(o.model || '').slice(0, 28)}</small>
            </span>
            <span class="badge gray">${nf(num(o.count) || 1)}대</span>
            <span class="tiny muted">${esc(shortDate(o.date))}</span>
          </button>`).join('')}
      </div>
      <div class="plan-reason">
        ${(p.reasons || []).map((r) => `<span class="reason">${esc(r)}</span>`).join('')}
      </div>
    </div>`;

  const renderUnassigned = () => {
    if (!cached) return;
    if (!cached.unassigned.length) { unEl.innerHTML = ''; return; }
    unEl.innerHTML = `<div class="unassigned">
      <h4>${icon('warning')} 배정하지 못한 건 ${cached.unassigned.length}건</h4>
      <ul>${cached.unassigned.slice(0, 8).map((u) => `<li><span>${esc(u.order.destination || u.order.customer)}</span><span class="badge gray">${nf(num(u.order.count) || 1)}대</span><span class="why">${esc(u.reason)}</span></li>`).join('')}</ul>
      ${cached.unassigned.length > 8 ? `<div class="tiny muted" style="margin-top:6px">외 ${cached.unassigned.length - 8}건</div>` : ''}
    </div>`;
  };

  const pickPlan = (orderId) => cached.plans.find((p) => p.orderIds.includes(orderId));

  function run() {
    const cap = Math.max(1, num($('#as-cap').value) || 14);
    const scope = $('#as-scope').value;
    const preset = $('#as-preset').value;
    const w = { balanced: [0.45, 0.2, 0.15, 0.2], history: [0.6, 0.15, 0.1, 0.15], grade: [0.25, 0.4, 0.15, 0.2], load: [0.25, 0.15, 0.1, 0.5] }[preset];
    const patch = { assign: { maxPerDriver: cap, includeAssigned: scope === 'all', historyWeight: w[0], gradeWeight: w[1], prefWeight: w[2], balanceWeight: w[3] } };
    saveSettings(patch).then(() => {
      if (!counted.length) return toast('해당 날짜에 배차 데이터가 없습니다.', 'warn');
      cached = autoAssign(date, { includeAssigned: scope === 'all' });
      renderSummary();
      renderPlans();
      if (!cached.stats.orders) toast('배정할 미배차 건이 없습니다. 전체 재배차로 시뮬레이션해 보세요.', 'warn');
      else toast(`${cached.plans.length}명에게 ${cached.stats.assignedCount}대를 배정했습니다.`, 'success');
    });
  }

  async function save(status) {
    if (!cached) return;
    const plans = cached.plans.map((p) => ({ ...p, status }));
    await saveAssignmentPlan(date, plans, { status });
    toast(status === 'confirmed' ? '가배차를 확정했습니다. 기사용 화면에 표시됩니다. 원본 배차판은 수정하지 않습니다.' : '가배차 초안을 저장했습니다.', 'success', 5000);
    renderAssign(view);
  }

  function openSwap(plan, orderId) {
    if (!plan) return;
    const order = plan.orders.find((o) => o.id === orderId);
    if (!order) return;
    const cands = bestForOrder(cached, orderId);
    const list = cands;
    const { close } = openModal({
      title: '담당 기사 변경',
      sub: `${order.customer} · ${order.destination} · ${num(order.count) || 1}대`,
      size: 'wide',
      body: `<div class="stack" style="gap:7px">
        ${list.map((c) => `
          <button class="file-card" data-pick="${esc(c.driver.name)}" style="text-align:left;cursor:pointer;border-color:${c.driver.name === plan.driverName ? 'rgba(20,135,201,.5)' : 'var(--line)'}">
            <span class="grade ${c.driver.grade}">${c.driver.grade}</span>
            <span class="meta"><strong>${esc(c.driver.name)} ${c.driver.name === plan.driverName ? '<span class="badge blue">현재</span>' : ''}</strong><small>${esc(c.driver.vehicleNo || '-')} · ${nf(c.driver.score)}점 · 여유 ${nf(c.remaining)}대</small></span>
            <span style="width:120px;flex:0 0 auto">
              <span class="tiny muted">추천도 ${Math.round((c.score || 0) * 100)}%</span>
              <span class="progress" style="margin-top:4px"><span style="width:${Math.round((c.score || 0) * 100)}%"></span></span>
            </span>
          </button>`).join('')}
      </div>`,
      onMount(el) {
        el.querySelectorAll('[data-pick]').forEach((b) => {
          b.onclick = () => {
            try {
              reassignOrder(cached, orderId, b.dataset.pick);
            } catch (error) {
              toast(error.message, 'warn');
              return;
            }
            close();
            renderSummary();
            renderPlans();
            toast(`${b.dataset.pick} 기사로 변경했습니다.`, 'success');
          };
        });
      },
    });
  }

  $('#btn-run').onclick = run;
  $('#btn-print').onclick = () => { if (!cached) return toast('먼저 추천 배차를 실행하세요.', 'warn'); window.print(); };
  $('#btn-export-board').onclick = () => {
    if (!cached) return toast('먼저 추천 배차를 실행하세요.', 'warn');
    const map = new Map();
    for (const p of cached.plans) for (const o of p.orders) map.set(o.id, p);
    const rows = [EXPORT_HEADERS];
    for (const p of cached.plans) {
      for (const o of p.orders) rows.push(toExportRow({ ...o, driver: p.driverName, vehicleNo: p.vehicleNo }));
    }
    exportXlsx({ '가배차': rows }, `M&M_가배차_${date}.xlsx`);
    toast('배차판 형식으로 내보냈습니다.', 'success');
  };

  $('#as-date').addEventListener('change', async (e) => {
    if (!e.target.value) return;
    await setWorkdate(e.target.value);
    renderAssign(view);
  });

  renderSummary();
  renderPlans();
}
