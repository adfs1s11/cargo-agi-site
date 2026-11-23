import {dispatchWorkflow,workflowHash} from './dispatch-workflow.js';
import {workspaceStoresReady} from '../core/supabase-cloud.js';
import {createDispatchLedger} from '../core/dispatch-metrics.js';
import {supabaseMode,workspaceProfile} from '../core/supabase-session.js';
import {canOpenPage} from '../core/workspace-access.js';
import { $, $$, esc, icon, dateLabel, todayStr, toast, openModal, num } from '../core/utils.js';
import { state, setWorkdate, subscribe } from '../core/data.js';
import * as db from '../core/db.js';
import { safetySnapshot } from '../core/safety.js';

export const NAV = [
  {
    group: '수입차 운영', workspace: 'import',
    items: [
      { id: 'dashboard', label: '대시보드', icon: 'dashboard', hash: '#/dashboard' },
      {id:'customer-share',label:'거래처 배차 안내',icon:'link',hash:'#/customer-share'},
      { id: 'board', label: '배차판', icon: 'board', hash: '#/board' },
      {id:'dispatch-reference',label:'배차 참고자료',icon:'board',hash:'#/dispatch-reference'},
      {id:'monthly-history',label:'월별 운송이력',icon:'calendar',hash:'#/monthly-history'},
      
      { id:'formation',label:'배차 편성',icon:'route',hash:'#/formation?tab=packing' },
      { id: 'settlement', label: '정산·마감', icon: 'chart', hash: '#/settlement' },
      { id: 'evaluation', label: '기사 평가', icon: 'chart', hash: '#/evaluation' },
    ],
  },
  {
    group: '상용트럭 운영',workspace:'commercial', items: [
      {id:'commercial-volvo',label:'Volvo 트럭',icon:'truck',hash:'#/commercial-volvo'},
      {id:'commercial-trucks',label:'Mercedes-Benz 트럭',icon:'truck',hash:'#/commercial-trucks'},
    ],
  },
  {group:'KGM 운영',workspace:'kgm',items:[['kgm','배차 현황','board'],['kgm-import','엑셀 업로드','upload'],['kgm-resources','가용 기사·차량','truck']].map(([id,label,icon])=>({id,label,icon,hash:'#/'+id}))},
  {group:'GM 운영',workspace:'gm',planned:'추가 예정',items:[]},
 {group:'포워딩 운영',workspace:'forwarding',items:[['forwarding','업무현황','dashboard'],['forwarding-orders','오더 관리','board'],['forwarding-containers','컨테이너 운송 주선','truck'],['forwarding-settlement','매출·매입 정산','chart'],['forwarding-advances','대납금 관리','chart']].map(([id,label,icon])=>({id,label,icon,hash:'#/'+id}))},
  {
    group: '단가 관리', items: [
      {id:'sale-rates',label:'매출 단가표',icon:'chart',hash:'#/sale-rates'},
      {id:'purchase-rates',label:'매입 단가표',icon:'chart',hash:'#/purchase-rates'},
    ],
  },
  {
    group: '공통 차량·기사 관리',
    items: [
      {id:'fleet',label:'통합 가용 차량 선택',icon:'truck',hash:'#/fleet'},
      { id: 'drivers', label: '기사 관리', icon: 'users', hash: '#/drivers' },
      { id: 'equipment', label: '운송차량', icon: 'truck', hash: '#/equipment' },
      {id:'schedule',label:'기사 스케줄',icon:'calendar',hash:'#/schedule'},
      {id:'destination-regions',label:'도착지·권역 전환표',icon:'route',hash:'#/destination-regions'},
      { id: 'products', label: '상품차량', icon: 'car', hash: '#/products' },
    ],
  },
  {
    group: '공통 안전관리',
    items: [
      { id: 'safety', label: '안전점검', icon: 'shield', hash: '#/safety' },
      {id:'safety-training',label:'안전교육·자료',icon:'calendar',hash:'#/safety-training'},
      { id: 'incidents', label: '사고·클레임', icon: 'alert', hash: '#/incidents' },
    ],
  },
  {
    group: '확장',
    items: [
      {id:'driver-notices',label:'공지 관리',icon:'mobile',hash:'#/driver-notices'},
      {id:'driver-app-admin',label:'기사 앱 관리',icon:'mobile',hash:'#/driver-app-admin'},
      { id: 'mobile', label: '현장 모바일', icon: 'mobile', hash: '#/mobile' },
      { id: 'settings', label: '설정·연동', icon: 'settings', hash: '#/settings' },
      { id: 'admin', label: '관리자 페이지', icon: 'lock', hash: '#/admin' },
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
  const unassigned=createDispatchLedger(todayRows,{assignments:state.assignments,drivers:state.drivers}).summary.pendingUnits;
  const openInc = state.incidents.filter((i) => i.status !== 'closed').length;
  const stale = state.products.filter((p) => !p.updatedAt || p.updatedAt < addDaysLocal(today, -31)).length;
  const safety = safetySnapshot(state.safety);
  return { board: unassigned, assign: unassigned, incidents: openInc, products: stale, safety: safety.attention };
}
const addDaysLocal = (s, n) => { const d = new Date(s); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export function renderSidebar(active) {
  const badges = navBadges();
  const nav = $('#nav');
  const groups=supabaseMode()?NAV.map(g=>({...g,items:g.items.filter(i=>canOpenPage(workspaceProfile()?.role,i.id))})).filter(g=>g.items.length||(g.planned&&['admin','dispatch','settlement'].includes(workspaceProfile()?.role))):NAV;
  nav.innerHTML = groups.map((group) => `
    <section class="nav-section ${group.workspace?'nav-operations':''} ${group.planned?'is-planned':''}" data-workspace="${esc(group.workspace||'')}" aria-label="${esc(group.group)}">
    <div class="nav-group">${esc(group.group)}${group.planned?`<span class="nav-stage">${esc(group.planned)}</span>`:''}</div>
    ${group.items.map((item) => {
      const n = badges[item.id];
      const badge = n ? `<span class="nav-badge ${item.id === 'incidents' || item.id === 'safety' ? 'warn' : ''}">${n}</span>` : '';
      return `<a class="nav-item ${active === item.id ? 'active' : ''}" href="${item.hash}" data-link>${icon(item.icon)}<span>${item.label}</span>${badge}</a>`;
    }).join('')}
    </section>
  `).join('');
  $('#foot-icon').innerHTML = icon('mobile');
  const forwardingOnly=supabaseMode()&&workspaceProfile()?.role==='forwarding';
  document.querySelectorAll('[data-action="open-mobile-hub"]').forEach(el=>el.hidden=forwardingOnly);
  const brandLogo = $('#brand-logo');
  if (brandLogo && state.settings.logo) brandLogo.src = state.settings.logo;

  $('#mobile-nav').innerHTML = [
    { id: 'dashboard', label: '홈', icon: 'dashboard' },
    { id: 'board', label: '배차판', icon: 'board' },
    { id: 'schedule', label: '기사 스케줄', icon: 'calendar', hash: '#/schedule' },
      { id:'formation',label:'배차 편성',icon:'route',hash:'#/formation?tab=packing' },
    { id: 'incidents', label: '이슈', icon: 'alert' },
    { id: 'more', label: '전체', icon: 'menu' },
  ].filter(item=>item.id==='more'||!supabaseMode()||canOpenPage(workspaceProfile()?.role,item.id)).map((item) => `<a href="${item.id === 'more' ? '#/settings' : item.hash || `#/${item.id}`}" data-link class="${active === item.id ? 'active' : ''}">${icon(item.icon)}<span>${item.label}</span></a>`).join('');
  if(forwardingOnly)$('#mobile-nav').innerHTML=NAV.find(g=>g.workspace==='forwarding').items.map(item=>`<a href="${item.hash}" data-link class="${active===item.id?'active':''}">${icon(item.icon)}<span>${item.label}</span></a>`).join('');
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
  $('#workdate-label').textContent = dateLabel(currentFlow()?.date || state.workdate || todayStr());
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

function currentFlow() {
  const {segments,params} = parseHash();
  return dispatchWorkflow(segments[0],params,state.workdate || todayStr());
}
export async function applyWorkdate(date) {
  const flow = currentFlow();
  if (flow && date === flow.date) return;
  if (flow && !window.dispatchEvent(new Event('formation-date-change',{cancelable:true}))) return;
  await setWorkdate(date);
  if (flow) location.hash = workflowHash(flow.tab,date);
  else renderRoute();
}

export function openWorkdatePicker() {
  const dates = [...new Set(state.dispatch.map((r) => r.date).filter(Boolean))].sort().reverse();
  openModal({
    title: '기준일 선택',
    sub: '대시보드와 가배차의 기준 날짜입니다.',
    body: `
      <div class="field">
        <label>직접 선택</label>
        <input class="input" type="date" id="wd-input" value="${currentFlow()?.date || state.workdate || todayStr()}">
      </div>
      <div class="section" style="margin-top:16px">
        <div class="section-head"><h3>배차 데이터가 있는 날짜</h3><span class="hint">${dates.length}일</span></div>
        <div class="chips" style="max-height:220px;overflow:auto">
          ${dates.slice(0, 60).map((d) => `<button class="chip-toggle ${d === state.workdate ? 'on' : ''}" data-wd="${d}">${d.slice(5)}</button>`).join('') || `<span class="muted small">${supabaseMode()&&!workspaceStoresReady(['dispatch'])?'날짜를 직접 선택하면 해당 일자를 조회합니다.':'배차 데이터가 없습니다.'}</span>`}
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
        await applyWorkdate(v);
        close();
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
    if (ev === 'workdate') updateWorkdateLabel();
    if (ev === 'data' || ev === 'ready' || ev === 'seed') renderSidebar(parseHash().segments[0] || 'dashboard');
    if (ev === 'settings') renderSidebar(parseHash().segments[0] || 'dashboard');
  });
  updateStorage();
  setInterval(updateStorage, 30000);
}
