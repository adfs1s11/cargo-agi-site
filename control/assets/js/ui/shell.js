import { $, $$, esc, icon, dateLabel, todayStr, toast, openModal, num } from '../core/utils.js';
import { state, setWorkdate, subscribe, plannedOverlay } from '../core/data.js';
import * as db from '../core/db.js';
import { safetySnapshot } from '../core/safety.js';

export const NAV = [
  {
    group: '운영',
    items: [
      { id: 'dashboard', label: '대시보드', icon: 'dashboard', hash: '#/dashboard' },
      { id: 'board', label: '배차판', icon: 'board', hash: '#/board' },
      { id: 'assign', label: '가배차', icon: 'route', hash: '#/assign' },
      { id: 'evaluation', label: '기사 평가', icon: 'chart', hash: '#/evaluation' },
    ],
  },
  {
    group: '기준정보',
    items: [
      { id: 'drivers', label: '기사 관리', icon: 'users', hash: '#/drivers' },
      { id: 'equipment', label: '운송차량', icon: 'truck', hash: '#/equipment' },
      { id: 'products', label: '상품차량', icon: 'car', hash: '#/products' },
    ],
  },
  {
    group: '리스크',
    items: [
      { id: 'safety', label: '안전점검', icon: 'shield', hash: '#/safety' },
      { id: 'incidents', label: '사고·클레임', icon: 'alert', hash: '#/incidents' },
    ],
  },
  {
    group: '확장',
    items: [
      { id: 'mobile', label: '현장 모바일', icon: 'mobile', hash: '#/mobile' },
      { id: 'settings', label: '설정·연동', icon: 'settings', hash: '#/settings' },
    ],
  },
];

export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const params = new URLSearchParams(queryPart || '');
  return { path: segments.join('/'), segments, params, raw };
}

export function navigate(hash) {
  if (location.hash === hash) renderRoute();
  else location.hash = hash;
}

export function navBadges() {
  const today = state.workdate || todayStr();
  const todayRows = state.dispatch.filter((r) => r.date === today);
  const overlay = plannedOverlay(today);
  const unassigned = todayRows
    .filter((r) => !['cancelled', 'notshipped', 'support'].includes(r.status) && !r.driver && !overlay.has(r.id))
    .reduce((n, r) => n + (num(r.count) || 1), 0);
  const openInc = state.incidents.filter((i) => i.status !== 'closed').length;
  const stale = state.products.filter((p) => !p.updatedAt || p.updatedAt < addDaysLocal(today, -31)).length;
  const safety = safetySnapshot(state.safety);
  return { board: unassigned, assign: unassigned, incidents: openInc, products: stale, safety: safety.attention };
}
const addDaysLocal = (s, n) => { const d = new Date(s); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export function renderSidebar(active) {
  const badges = navBadges();
  const nav = $('#nav');
  nav.innerHTML = NAV.map((group) => `
    <div class="nav-group">${group.group}</div>
    ${group.items.map((item) => {
      const n = badges[item.id];
      const badge = n ? `<span class="nav-badge ${item.id === 'incidents' || item.id === 'safety' ? 'warn' : ''}">${n}</span>` : '';
      return `<a class="nav-item ${active === item.id ? 'active' : ''}" href="${item.hash}" data-link>${icon(item.icon)}<span>${item.label}</span>${badge}</a>`;
    }).join('')}
  `).join('');
  $('#foot-icon').innerHTML = icon('mobile');
  const brandLogo = $('#brand-logo');
  if (brandLogo && state.settings.logo) brandLogo.src = state.settings.logo;

  $('#mobile-nav').innerHTML = [
    { id: 'dashboard', label: '홈', icon: 'dashboard' },
    { id: 'board', label: '배차판', icon: 'board' },
    { id: 'assign', label: '가배차', icon: 'route' },
    { id: 'incidents', label: '이슈', icon: 'alert' },
    { id: 'more', label: '전체', icon: 'menu' },
  ].map((item) => `<a href="${item.id === 'more' ? '#/settings' : `#/${item.id}`}" data-link class="${active === item.id ? 'active' : ''}">${icon(item.icon)}<span>${item.label}</span></a>`).join('');
}

let lastTitle = '';
export function setPageMeta(title, sub) {
  $('#page-title').textContent = title;
  $('#page-sub').textContent = sub || '';
  document.title = `${title} · M&M 통합 운송 관제`;
  lastTitle = title;
}

export function setTopbarActions(html) {
  $('#topbar-actions').innerHTML = html || '';
}

export function updateWorkdateLabel() {
  $('#workdate-label').textContent = dateLabel(state.workdate || todayStr());
}

export async function updateStorage() {
  const est = await db.estimateStorage();
  state.storage = est;
  const dot = $('#storage-dot');
  const label = $('#storage-label');
  if (!est) { label.textContent = '저장소 정보 없음'; return; }
  const mb = (n) => `${(n / 1024 / 1024).toFixed(1)}MB`;
  label.textContent = `로컬 저장 ${mb(est.usage)} / ${mb(est.quota)}`;
  dot.className = `dot ${est.ratio > 0.85 ? 'bad' : est.ratio > 0.7 ? 'warn' : ''}`;
}

export function openWorkdatePicker() {
  const dates = [...new Set(state.dispatch.map((r) => r.date).filter(Boolean))].sort().reverse();
  openModal({
    title: '기준일 선택',
    sub: '대시보드와 가배차의 기준 날짜입니다.',
    body: `
      <div class="field">
        <label>직접 선택</label>
        <input class="input" type="date" id="wd-input" value="${state.workdate || todayStr()}">
      </div>
      <div class="section" style="margin-top:16px">
        <div class="section-head"><h3>배차 데이터가 있는 날짜</h3><span class="hint">${dates.length}일</span></div>
        <div class="chips" style="max-height:220px;overflow:auto">
          ${dates.slice(0, 60).map((d) => `<button class="chip-toggle ${d === state.workdate ? 'on' : ''}" data-wd="${d}">${d.slice(5)}</button>`).join('') || '<span class="muted small">배차 데이터가 없습니다.</span>'}
        </div>
      </div>`,
    foot: `<button class="btn btn-ghost" data-close>취소</button><button class="btn btn-primary" id="wd-apply">기준일 적용</button>`,
    onMount(el, close) {
      el.querySelectorAll('[data-wd]').forEach((b) => {
        b.onclick = () => { el.querySelector('#wd-input').value = b.dataset.wd; el.querySelectorAll('[data-wd]').forEach((x) => x.classList.toggle('on', x === b)); };
      });
      el.querySelector('#wd-apply').onclick = async () => {
        const v = el.querySelector('#wd-input').value;
        if (!v) return toast('날짜를 선택하세요.', 'warn');
        await setWorkdate(v);
        close();
        renderRoute();
      };
    },
  });
}

export function openMobileHub() {
  openModal({
    title: '현장 모바일',
    sub: '기사·주재원·고객이 휴대폰으로 접속하는 화면입니다.',
    size: 'wide',
    body: `
      <div class="hub">
        <a href="#/m/driver" data-link data-close>${'<div class="h-ic">' + icon('truck') + '</div>'}<strong>기사용</strong><small>오늘 배차·완료 보고</small></a>
        <a href="#/m/agent" data-link data-close>${'<div class="h-ic">' + icon('pin') + '</div>'}<strong>주재원용</strong><small>현장 도착·출고 확인</small></a>
        <a href="#/m/customer" data-link data-close>${'<div class="h-ic">' + icon('search') + '</div>'}<strong>고객용</strong><small>차량 위치·배송 조회</small></a>
      </div>
      <div class="insight" style="margin-top:16px">${icon('info')}<div>모바일 화면은 같은 데이터를 사용합니다. 기사 이름 또는 차대번호로 접속하며, 추후 사내 계정·링크 배포로 확장할 수 있습니다.</div></div>`,
  });
}

let routeHandler = null;
export function setRouteHandler(fn) { routeHandler = fn; }
export function renderRoute() {
  if (routeHandler) routeHandler(parseHash());
}

export function initShell() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-link]');
    if (link && link.getAttribute('href')?.startsWith('#')) {
      e.preventDefault();
      const hash = link.getAttribute('href');
      if (location.hash === hash) renderRoute(); else location.hash = hash;
      $('#sidebar')?.classList.remove('open');
      document.querySelector('.nav-backdrop')?.remove();
    }
    const act = e.target.closest('[data-action]');
    if (act) {
      const a = act.dataset.action;
      if (a === 'open-settings') { location.hash = '#/settings'; }
      if (a === 'change-workdate') openWorkdatePicker();
      if (a === 'toggle-nav') {
        const sb = $('#sidebar');
        if (sb.classList.contains('open')) { sb.classList.remove('open'); document.querySelector('.nav-backdrop')?.remove(); }
        else {
          sb.classList.add('open');
          const bd = document.createElement('div');
          bd.className = 'nav-backdrop';
          bd.onclick = () => { sb.classList.remove('open'); bd.remove(); };
          document.body.appendChild(bd);
        }
      }
      if (a === 'open-mobile-hub') openMobileHub();
    }
  });
  window.addEventListener('hashchange', renderRoute);
  subscribe((ev) => {
    if (ev === 'data' || ev === 'ready' || ev === 'seed') renderSidebar(parseHash().segments[0] || 'dashboard');
    if (ev === 'settings') renderSidebar(parseHash().segments[0] || 'dashboard');
  });
  updateStorage();
  setInterval(updateStorage, 30000);
}
