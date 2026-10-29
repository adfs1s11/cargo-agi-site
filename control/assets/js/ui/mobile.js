import {
  $, $$, esc, icon, nf, num, dateLabel, todayStr, shortDate, ymd, normalizeVin, debounce, openModal, toast, str, norm,
} from '../core/utils.js';
import { state, rowsOn, hasDriver, isCounted, saveIncident, assignmentsOn } from '../core/data.js';
import { savePhoto } from '../core/photos.js';
import { pageHead, banner, field } from './components.js';
import { companyMark } from './components.js';

const DONE_KEY = 'mmtc.tripdone.v1';
const getDone = () => { try { return JSON.parse(localStorage.getItem(DONE_KEY) || '{}'); } catch { return {}; } };
const setDone = (obj) => localStorage.setItem(DONE_KEY, JSON.stringify(obj));

export function renderMobileHub(view) {
  const date = state.workdate || todayStr();
  const today = rowsOn(date);
  let html = `
    ${pageHead('현장 모바일', '휴대폰에서 바로 쓰는 기사·주재원·고객 화면입니다. 같은 데이터를 공유합니다.', '')}
    <div class="vs-actions" style="margin-bottom:16px"><a class="btn btn-primary" href="#/m/safety" data-link>차량 안전 셀프 체크·작업계획서</a></div>
    <div class="grid grid-3">
      <a href="#/m/driver" data-link class="card card-pad" style="text-decoration:none">
        <div class="kpi-icon" style="width:38px;height:38px;border-radius:11px">${icon('truck')}</div>
        <h3 style="margin-top:12px;font-size:15px;font-weight:800">기사용</h3>
        <p class="small muted" style="margin-top:4px;line-height:1.6">오늘 배차 확인, 완료 보고, 사고·클레임 사진 접수</p>
        <div class="row" style="margin-top:12px"><span class="badge blue">모바일 웹</span><span class="tiny muted">배차 ${nf(today.filter((r) => hasDriver(r)).length)}건</span></div>
      </a>
      <a href="#/m/agent" data-link class="card card-pad">
        <div class="kpi-icon" style="width:38px;height:38px;border-radius:11px">${icon('pin')}</div>
        <h3 style="margin-top:12px;font-size:15px;font-weight:800">주재원용</h3>
        <p class="small muted" style="margin-top:4px;line-height:1.6">현장 도착 확인, 차대번호 검색, 출고 체크</p>
        <div class="row" style="margin-top:12px"><span class="badge green">현장</span><span class="tiny muted">오늘 ${nf(today.length)}건</span></div>
      </a>
      <a href="#/m/customer" data-link class="card card-pad">
        <div class="kpi-icon" style="width:38px;height:38px;border-radius:11px">${icon('search')}</div>
        <h3 style="margin-top:12px;font-size:15px;font-weight:800">고객용</h3>
        <p class="small muted" style="margin-top:4px;line-height:1.6">차대번호로 배송 상태·기사 연락처 확인</p>
        <div class="row" style="margin-top:12px"><span class="badge purple">조회</span><span class="tiny muted">별도 앱 설치 없음</span></div>
      </a>
    </div>
    <div class="section">
      <div class="insight">${icon('mobile')}<div><b>배포 방법</b> — 이 화면의 주소를 QR로 만들어 기사·주재원에게 공유하세요. 공용 계정으로 로그인하면 여러 기기에서 동일한 원장을 조회·기록합니다. 저장 후 공용 동기화 완료를 확인하세요.</div></div>
    </div>
    <div class="section">
      <div class="section-head"><h3>화면 미리보기</h3><span class="hint">휴대폰에서 열면 자동으로 최적화됩니다</span></div>
      <div class="vs-actions" style="margin-bottom:16px"><a class="btn btn-primary" href="#/m/safety" data-link>차량 안전 셀프 체크·작업계획서</a></div>
    <div class="grid grid-3">
        ${rolePreview('기사', '오늘의 배차 6건', '#/m/driver', 'truck')}
        ${rolePreview('주재원', '현장 도착 12건', '#/m/agent', 'pin')}
        ${rolePreview('고객', '배송 상태 조회', '#/m/customer', 'search')}
      </div>
    </div>`;
  view.innerHTML = html;
}

const rolePreview = (title, sub, hash, ic) => `
  <div class="card" style="padding:12px;background:#f8fbff">
    <div class="row" style="justify-content:space-between"><span class="small strong">${title} 화면</span><span class="badge gray">${icon(ic)}</span></div>
    <div style="margin-top:10px;border-radius:12px;border:1px solid var(--line);background:#fff;padding:10px">
      <div style="height:7px;width:36%;background:#dce8f5;border-radius:4px"></div>
      <div style="height:11px;width:70%;background:#e9f1fa;border-radius:4px;margin-top:8px"></div>
      <div class="row" style="gap:5px;margin-top:10px"><span style="height:22px;flex:1;background:#eef5fc;border-radius:6px"></span><span style="height:22px;width:22px;background:#eef5fc;border-radius:6px"></span></div>
      <div class="tiny muted" style="margin-top:8px">${sub}</div>
    </div>
  </div>`;

/* ---------------- role shell ---------------- */
function roleShell({ title, sub, active, body, badge = '' }) {
  return `<div class="role-shell">
    <div class="role-head">
      <div class="rh-top">
        <img src="${state.settings.logo || 'assets/logo.png'}" alt="M&M">
        <span class="badge ${badge === 'live' ? 'green' : 'gray'}" style="background:rgba(255,255,255,.14);color:#dff1ff">${badge === 'live' ? '실시간' : '현장 모드'}</span>
      </div>
      <h2>${esc(title)}</h2>
      <p>${sub}</p>
      <div class="role-tabs">
        <a href="#/m/driver" data-link class="${active === 'driver' ? 'active' : ''}">기사</a>
        <a href="#/m/agent" data-link class="${active === 'agent' ? 'active' : ''}">주재원</a>
        <a href="#/m/customer" data-link class="${active === 'customer' ? 'active' : ''}">고객</a>
      </div>
    </div>
    <div class="role-body">${body}</div>
    <div class="mobile-tabbar">
      <a href="#/dashboard" data-link>${icon('dashboard')}<span>관제</span></a>
      <a href="#/m/driver" data-link class="${active === 'driver' ? 'active' : ''}">${icon('truck')}<span>기사</span></a>
      <a href="#/m/agent" data-link class="${active === 'agent' ? 'active' : ''}">${icon('pin')}<span>주재원</span></a>
      <a href="#/m/customer" data-link class="${active === 'customer' ? 'active' : ''}">${icon('search')}<span>고객</span></a>
    </div>
  </div>`;
}

/* ---------------- driver ---------------- */
export function renderDriverMobile(view, params) {
  const date = state.workdate || todayStr();
  const savedName = localStorage.getItem('mmtc.driver') || '';
  let name = params.get('name') || savedName;
  if (name && !state.drivers.some((d) => d.name === name)) name = '';

  if (!name) {
    view.innerHTML = roleShell({
      title: '기사용', sub: '이름을 선택하면 오늘 배차가 표시됩니다.', active: 'driver', badge: '',
      body: `<div class="role-card">
        <div class="small strong" style="margin-bottom:8px">기사 선택</div>
        <div class="search" style="max-width:none;margin-bottom:8px">${icon('search')}<input id="m-driver-q" placeholder="이름·차량번호 검색" autocomplete="off"></div>
        <select class="select" id="m-driver-select">
          <option value="">— 이름 선택 —</option>
          ${state.drivers.filter((d) => d.status === 'active').map((d) => `<option value="${esc(d.name)}">${esc(d.name)} (${esc(d.vehicleNo || '-')})</option>`).join('')}
        </select>
        <button class="btn btn-primary w-full" id="m-driver-go" style="margin-top:10px">내 배차 보기</button>
      </div>
      <div class="insight" style="background:#fff">${icon('info')}<div>처음 한 번만 선택하면 이 기기에 기억됩니다. 기사별 전용 링크는 <code>#/m/driver?name=이름</code> 형식입니다.</div></div>`,
    });
  } else {
    localStorage.setItem('mmtc.driver', name);
    const driver = state.drivers.find((d) => d.name === name);
    const rows = rowsOn(date).filter((r) => norm(r.driver) === norm(name) && !['cancelled', 'notshipped'].includes(r.status));
    const done = getDone();
    const savedPlans = assignmentsOn(date).filter((a) => norm(a.driverName) === norm(name));
    const planned = savedPlans.flatMap((a) => (a.orderIds || []).map((id) => state.dispatch.find((r) => r.id === id)).filter(Boolean));
    const seen = new Set();
    const items = [...rows, ...planned].filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return !['cancelled', 'notshipped'].includes(r.status);
    });
    const doneCount = items.filter((r) => done[`${date}|${r.id}`]).length;
    const badge = '';
    view.innerHTML = roleShell({
      title: `${name} 기사님`,
      sub: `${dateLabel(date, true)} · ${esc(driver?.vehicleNo || '-')} · 배차 ${items.length}건${savedPlans.some((a) => a.status === 'confirmed') ? ' · 확정' : ''}`,
      active: 'driver', badge: 'live',
      body: `
        <div class="role-card">
          <div class="row-between"><div><div class="tiny muted">오늘 배차</div><div style="font-size:22px;font-weight:850;letter-spacing:-.04em">${items.length}<span class="small muted">건</span></div></div>
            <div class="right"><div class="tiny muted">완료 보고</div><div style="font-size:22px;font-weight:850;letter-spacing:-.04em;color:${doneCount === items.length && items.length ? '#0a7a5b' : 'var(--ink)'}">${doneCount}<span class="small muted">/${items.length}</span></div></div>
            <button class="icon-btn" id="m-switch" title="기사 변경">${icon('refresh')}</button>
          </div>
          <div class="progress" style="margin-top:10px"><span style="width:${items.length ? (doneCount / items.length) * 100 : 0}%"></span></div>
        </div>
        <div class="role-card" style="padding:6px 12px 8px">
          <div class="row-between" style="padding:8px 0"><span class="small strong">배차 목록</span><span class="tiny muted">도착지 순서</span></div>
          ${items.length ? items.map((r, i) => {
            const key = `${date}|${r.id}`;
            const isDone = !!done[key];
            return `<div class="trip">
              <span class="seq" style="background:${isDone ? '#e6f6f0' : '#eef5fc'};color:${isDone ? '#0a7a5b' : '#0f6fae'}">${isDone ? '✓' : i + 1}</span>
              <div class="t-body">
                <strong style="${isDone ? 'text-decoration:line-through;color:#8a97a8' : ''}">${esc(r.destination || '-')}</strong>
                <small>${esc(r.customer || '')} · ${esc(r.model || '').slice(0, 26)}</small>
                <small>${esc(r.vin || '')} · ${nf(num(r.count) || 1)}대 · 회전 ${nf(num(r.turn) || 1)}</small>
                <div class="row" style="margin-top:5px;gap:4px">
                  ${r.customerPhone ? `<a class="btn btn-xs btn-ghost" href="tel:${esc(r.customerPhone)}">${icon('phone')} 고객</a>` : ''}
                  <a class="btn btn-xs btn-ghost" href="https://map.kakao.com/link/search/${encodeURIComponent(r.destination || '')}" target="_blank" rel="noopener">${icon('pin')} 길찾기</a>
                </div>
              </div>
              <div class="t-act">${isDone ? '<span class="badge green">완료</span>' : `<button class="btn btn-xs btn-primary" data-done="${key}">완료</button>`}</div>
            </div>`;
          }).join('') : `<div class="empty" style="padding:28px 10px"><div class="icon">${icon('truck')}</div><h4>오늘 배차가 없습니다</h4><p>관제에서 배차가 확정되면 이 화면에 표시됩니다.</p></div>`}
        </div>
        <button class="btn btn-dark btn-lg w-full" id="m-report">${icon('alert')} 사고·클레임 신고</button>
        <div class="tiny muted text-center">완료 보고는 이 기기에 저장됩니다 · ${shortDate(date)}</div>
      `,
    });
  }

  $('#m-driver-q')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    const sel = $('#m-driver-select');
    if (!sel) return;
    const list = state.drivers.filter((d) => d.status === 'active' && (!q || `${d.name} ${d.vehicleNo}`.toLowerCase().includes(q)));
    sel.innerHTML = `<option value="">— 이름 선택 (${list.length}명) —</option>` + list.map((d) => `<option value="${esc(d.name)}">${esc(d.name)} (${esc(d.vehicleNo || '-')})</option>`).join('');
  });
  $('#m-driver-go')?.addEventListener('click', () => {
    const v = $('#m-driver-select').value;
    if (!v) return toast('기사를 선택하세요.', 'warn');
    localStorage.setItem('mmtc.driver', v);
    location.hash = `#/m/driver?name=${encodeURIComponent(v)}`;
  });
  $('#m-switch')?.addEventListener('click', () => {
    localStorage.removeItem('mmtc.driver');
    location.hash = '#/m/driver';
  });
  $$('[data-done]').forEach((b) => b.addEventListener('click', () => {
    const d = getDone();
    d[b.dataset.done] = new Date().toISOString();
    setDone(d);
    toast('완료 보고했습니다.', 'success');
    renderDriverMobile(view, new URLSearchParams(`name=${encodeURIComponent(name)}`));
  }));
  $('#m-report')?.addEventListener('click', () => openMobileReport(name, date));
}

function openMobileReport(driverName, date) {
  let photo = null;
  const id = `inc_${Date.now().toString(36)}`;
  const { el, close } = openModal({
    title: '사고·클레임 신고',
    sub: `${driverName} · ${dateLabel(date)}`,
    body: `
      <div class="form-grid">
        ${field('유형', `<select class="select" id="mr-type"><option>사고</option><option>클레임</option><option>지연</option><option>미출고</option><option>기타</option></select>`)}
        ${field('심각도', `<select class="select" id="mr-sev"><option>중</option><option>상</option><option>하</option></select>`)}
        ${field('내용', `<textarea class="textarea" id="mr-desc" placeholder="상황을 적어주세요" style="min-height:96px"></textarea>`, { full: true })}
        ${field('예상 비용 (원)', `<input class="input" type="number" id="mr-cost" placeholder="0">`)}
      </div>
      <div style="margin-top:10px">
        <button class="btn btn-ghost" type="button" id="mr-photo">${icon('photo')} 사진 촬영</button>
        <input type="file" id="mr-file" accept="image/*" capture="environment" class="hidden">
        <div id="mr-preview" style="margin-top:8px"></div>
      </div>`,
    foot: `<button class="btn btn-ghost" data-close>취소</button><button class="btn btn-primary" id="mr-save">신고</button>`,
    onMount(_el, _close) {
      _el.querySelector('#mr-photo').onclick = () => _el.querySelector('#mr-file').click();
      _el.querySelector('#mr-file').onchange = async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        photo = f;
        const url = URL.createObjectURL(f);
        _el.querySelector('#mr-preview').innerHTML = `<img src="${url}" style="width:100%;max-height:180px;object-fit:cover;border-radius:10px">`;
      };
      _el.querySelector('#mr-save').onclick = async () => {
        const desc = _el.querySelector('#mr-desc').value.trim();
        if (!desc) return toast('내용을 입력하세요.', 'warn');
        let photos = [];
        try {
          if (photo) { const p = await savePhoto(id, photo); photos = [p.id]; }
          await saveIncident({
            id, date, type: _el.querySelector('#mr-type').value, severity: _el.querySelector('#mr-sev').value,
            driverName, vehicleNo: state.drivers.find((d) => d.name === driverName)?.vehicleNo || '',
            description: desc, cost: num(_el.querySelector('#mr-cost').value), photos, status: 'open', createdBy: `${driverName} (모바일)`,
          });
          _close();
          toast('신고가 접수되었습니다. 관제에서 확인합니다.', 'success');
        } catch (err) { toast(err.message, 'error'); }
      };
    },
  });
}

/* ---------------- agent ---------------- */
export function renderAgentMobile(view) {
  const date = state.workdate || todayStr();
  const rows = rowsOn(date).filter((r) => !['cancelled', 'notshipped'].includes(r.status));
  const regions = new Map();
  for (const r of rows) regions.set(r.region, (regions.get(r.region) || 0) + 1);
  view.innerHTML = roleShell({
    title: '주재원', sub: `${dateLabel(date, true)} · 현장 출고·도착 확인`, active: 'agent', badge: 'live',
    body: `
      <div class="role-card">
        <div class="row-between"><span class="small strong">오늘 출고</span><span class="badge blue">${nf(rows.length)}건</span></div>
        <div class="row" style="gap:5px;margin-top:9px;flex-wrap:wrap">${[...regions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([r, n]) => `<span class="pill">${esc(r)} <b>${n}</b></span>`).join('')}</div>
      </div>
      <div class="role-card">
        <div class="small strong" style="margin-bottom:6px">차대번호 · 차량번호 검색</div>
        <div class="search" style="max-width:none">${icon('search')}<input id="ag-q" placeholder="VIN 뒤 6자리 또는 차량번호" autocomplete="off"></div>
        <div id="ag-result" style="margin-top:8px"></div>
      </div>
      <div class="role-card">
        <div class="row-between" style="margin-bottom:4px"><span class="small strong">현장 목록</span><span class="tiny muted">최대 30건</span></div>
        <div id="ag-list">${agentList(rows, date)}</div>
      </div>
      <div class="insight">${icon('info')}<div>도착 확인은 현장에서 바로 기록됩니다. Google Sheets 연동 시 본사 화면과 실시간 공유됩니다.</div></div>
    `,
  });

  $$('[data-agent-done]').forEach((b) => b.addEventListener('click', () => {
    const d = getDone();
    const key = b.dataset.agentDone;
    if (d[key]) delete d[key]; else d[key] = new Date().toISOString();
    setDone(d);
    toast(d[key] ? '도착 확인했습니다.' : '도착 확인을 취소했습니다.', 'success');
    renderAgentMobile(view);
  }));

  $('#ag-q').addEventListener('input', debounce((e) => {
    const q = e.target.value.trim().toUpperCase();
    const box = $('#ag-result');
    if (!q) { box.innerHTML = ''; return; }
    const found = state.dispatch.filter((r) => (r.vin || '').includes(q) || (r.vehicleNo || '').replace(/\s/g, '').toUpperCase().includes(q.replace(/\s/g, ''))).slice(0, 5);
    box.innerHTML = found.length ? found.map((r) => `<div class="file-card" style="margin-bottom:5px"><div class="fi">${icon('truck')}</div><div class="meta"><strong>${esc(r.vin || '-')}</strong><small>${shortDate(r.date)} · ${esc(r.customer || '')} · ${esc(r.destination || '')}</small></div><span class="badge ${hasDriver(r) ? 'green' : 'amber'}">${hasDriver(r) ? '배차' : '미배차'}</span></div>`).join('') : '<div class="small muted">검색 결과가 없습니다.</div>';
  }, 200));
}

function agentList(rows, date) {
  const done = getDone();
  return rows.slice(0, 30).map((r) => {
    const key = `${date}|${r.id}`;
    const isDone = !!done[key];
    return `<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line-2);gap:8px">
      <div style="flex:1;min-width:0">
        <div class="small strong" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.destination || '-')}</div>
        <div class="tiny muted">${esc(r.customer || '')} · ${esc(r.vin || '').slice(-6)} · ${esc(r.driver || '미배차')}</div>
      </div>
      <span class="badge ${hasDriver(r) ? 'green' : 'amber'}">${hasDriver(r) ? '배차' : '대기'}</span>
      <button class="btn btn-xs ${isDone ? 'btn-soft' : 'btn-ghost'}" data-agent-done="${key}">${isDone ? '도착 ✓' : '도착'}</button>
    </div>`;
  }).join('') || '<div class="small muted" style="padding:10px 0">데이터가 없습니다.</div>';
}

/* ---------------- customer ---------------- */
export function renderCustomerMobile(view, params) {
  const initial = params.get('vin') || '';
  view.innerHTML = roleShell({
    title: '배송 조회', sub: '차대번호(또는 뒤 6자리)로 배송 상태를 확인합니다.', active: 'customer', badge: '',
    body: `
      <div class="role-card">
        <div class="small strong" style="margin-bottom:6px">차대번호 조회</div>
        <div class="search" style="max-width:none">${icon('search')}<input id="cu-q" value="${esc(initial)}" placeholder="예: 750898" autocomplete="off"></div>
        <button class="btn btn-primary w-full" id="cu-go" style="margin-top:10px">조회하기</button>
      </div>
      <div id="cu-result"></div>
      <div class="insight">${icon('lock')}<div>조회 화면은 시연용입니다. 실제 운영 시에는 고객 인증(주문번호·연락처 뒷자리)을 추가해 개인정보 노출을 막아야 합니다.</div></div>
    `,
  });
  const search = () => {
    const q = normalizeVin($('#cu-q').value) || $('#cu-q').value.trim();
    const box = $('#cu-result');
    if (!q || q.length < 4) { box.innerHTML = '<div class="role-card"><div class="small muted">4자리 이상 입력하세요.</div></div>'; return; }
    const found = [...state.dispatch].filter((r) => normalizeVin(r.vin).includes(q)).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    if (!found) {
      box.innerHTML = `<div class="role-card"><div class="empty" style="padding:26px 8px"><div class="icon">${icon('search')}</div><h4>조회 결과가 없습니다</h4><p>차대번호를 다시 확인하거나 고객센터로 문의하세요.</p></div></div>`;
      return;
    }
    const done = getDone();
    const isDone = !!done[`${found.date}|${found.id}`];
    const steps = [
      ['접수', true], ['배차', !!found.driver], ['상차·이동', !!found.driver], ['도착', isDone],
    ];
    const currentStep = steps.filter((s) => s[1]).length;
    const driver = state.drivers.find((d) => norm(d.name) === norm(found.driver));
    box.innerHTML = `<div class="role-card">
      <div class="row-between"><span class="badge blue">${esc(found.customer || '배송')}</span><span class="tiny muted">${shortDate(found.date)}</span></div>
      <div style="margin-top:9px;font-size:16px;font-weight:800;letter-spacing:-.03em">${esc(found.model || '차량')}</div>
      <div class="small muted" style="margin-top:2px">${esc(found.destination || '')}</div>
      <div class="row" style="justify-content:space-between;margin:14px 0 4px">
        ${steps.map(([label, on], i) => `<div style="flex:1;text-align:center">
          <div style="width:22px;height:22px;border-radius:50%;margin:0 auto;display:grid;place-items:center;background:${on ? 'var(--blue)' : '#e8eef7'};color:${on ? '#fff' : '#9aa7b8'};font-size:10px;font-weight:800">${on ? '✓' : i + 1}</div>
          <div class="tiny" style="margin-top:4px;color:${on ? 'var(--ink-2)' : 'var(--muted)'}">${label}</div>
        </div>`).join('')}
      </div>
      <div class="divider"></div>
      <div class="row-between" style="padding:4px 0"><span class="small muted">진행 상태</span><b class="small">${isDone ? '배송 완료' : found.driver ? '배송 중' : '배차 준비'}</b></div>
      <div class="row-between" style="padding:4px 0"><span class="small muted">담당 기사</span><b class="small">${esc(found.driver ? `${found.driver.slice(0, 1)}○○` : '배정 중')}</b></div>
      <div class="row-between" style="padding:4px 0"><span class="small muted">차량번호</span><b class="small">${esc(found.vehicleNo ? `${found.vehicleNo.slice(0, 4)}○○${found.vehicleNo.slice(-2)}` : '-')}</b></div>
      ${driver ? `<a class="btn btn-ghost w-full" href="tel:${esc(driver.phone)}" style="margin-top:10px">${icon('phone')} 기사님께 연락</a>` : ''}
    </div>`;
  };
  $('#cu-go').onclick = search;
  $('#cu-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
  if (initial) search();
}
