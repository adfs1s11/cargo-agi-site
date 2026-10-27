import { $, esc, icon, todayStr, toast } from './core/utils.js';
import { state, initData } from './core/data.js';
import { initShell, parseHash, renderRoute, setRouteHandler, setPageMeta, renderSidebar, updateWorkdateLabel, setTopbarActions } from './ui/shell.js';
import renderDashboard from './ui/pages/dashboard.js';
import renderBoard from './ui/pages/board.js';
import renderAssign from './ui/pages/assign.js';
import renderDrivers from './ui/pages/drivers.js';
import renderEquipment from './ui/pages/equipment.js';
import renderSafety from './ui/pages/safety.js';
import renderProducts from './ui/pages/products.js';
import renderIncidents from './ui/pages/incidents.js';
import renderEvaluation from './ui/pages/evaluation.js';
import renderSettings from './ui/pages/settings.js';
import renderAdmin from './ui/pages/admin.js';
import renderLogin from './ui/login.js';
import { initAccount, isAuthenticated, logout } from './core/auth.js';
import { renderMobileHub, renderDriverMobile, renderAgentMobile, renderCustomerMobile } from './ui/mobile.js';

const PAGES = {
  admin: { render: renderAdmin, title: '관리자 페이지', sub: '관리자 계정·샘플 자료 설정' },
  dashboard: { render: renderDashboard, title: '대시보드', sub: '오늘의 운송 현황을 한눈에 확인합니다.' },
  board: { render: renderBoard, title: '배차판', sub: '일 800~1,600대 규모의 배차를 빠르게 확인·배정합니다.' },
  assign: { render: renderAssign, title: '가배차', sub: '이력·등급·권역을 반영한 추천 배차.' },
  drivers: { render: renderDrivers, title: '기사 관리', sub: '기사 정보·선호 권역·평가등급.' },
  equipment: { render: renderEquipment, title: '운송차량', sub: '카캐리어·탁송 장비와 보험·검사.' },
  safety: { render: renderSafety, title: '안전점검', sub: 'Tesla 고정 Pool 차량의 특장·추락방지·검사 이력.' },
  products: { render: renderProducts, title: '상품차량', sub: '브랜드·모델 시세와 월간 최신화.' },
  incidents: { render: renderIncidents, title: '사고·클레임', sub: '현장 이슈 기록과 평가 반영.' },
  evaluation: { render: renderEvaluation, title: '기사 평가', sub: '6개 지표 100점 · S~F 등급.' },
  settings: { render: renderSettings, title: '설정·연동', sub: '브랜드·기준·Google Sheets·저장공간.' },
  mobile: { render: renderMobileHub, title: '현장 모바일', sub: '기사·주재원·고객 화면.' },
};

const MOBILE = {
  'm/driver': { render: renderDriverMobile, title: '기사용', sub: '오늘의 배차와 완료 보고' },
  'm/agent': { render: renderAgentMobile, title: '주재원용', sub: '현장 도착·출고 확인' },
  'm/customer': { render: renderCustomerMobile, title: '고객용', sub: '배송 상태 조회' },
};

function topbarFor(id) {
  const g = state.settings.google;
  const sync = g?.url
    ? `<button class="chip" data-sync title="Google Sheets 동기화" style="cursor:pointer;border:1px solid var(--line);height:32px;padding:0 10px;border-radius:9px;background:#fff;font-size:11.5px;display:inline-flex;align-items:center;gap:5px">${icon('cloud')} ${g.lastSync ? '동기화됨' : '연동 대기'}</button>`
    : '';
  setTopbarActions(`
    ${state.settings.demo ? '<span class="badge amber" title="샘플 데이터가 포함되어 있습니다">샘플</span>' : ''}
    ${sync}
    <a class="btn btn-sm btn-ghost" href="#/admin" data-link>관리자</a>
    <button class="btn btn-sm btn-ghost" id="auth-logout">로그아웃</button>
    <a class="btn btn-sm btn-ghost" href="#/mobile" data-link title="현장 모바일">${icon('mobile')} 모바일</a>
  `);
  $('[data-sync]')?.addEventListener('click', () => { location.hash = '#/settings'; });
  $('#auth-logout')?.addEventListener('click', logout);
}

function route({ path, segments, params }) {
  if (!isAuthenticated()) { logout(); return; }
  const view = $('#view');
  document.body.classList.remove('board-focus');
  document.body.classList.toggle('role-mode', path.startsWith('m/'));
  document.querySelector('.nav-backdrop')?.remove();
  $('#sidebar')?.classList.remove('open');
  view.innerHTML = '';

  if (MOBILE[path]) {
    const m = MOBILE[path];
    setPageMeta(m.title, m.sub);
    document.title = `${m.title} · M&M`;
    m.render(view, params);
    window.scrollTo(0, 0);
    return;
  }

  const id = PAGES[segments[0]] ? segments[0] : 'dashboard';
  const page = PAGES[id];
  renderSidebar(id);
  setPageMeta(page.title, page.sub);
  updateWorkdateLabel();
  topbarFor(id);
  try {
    page.render(view, { tab: params.get('tab'), params });
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="empty card" style="padding:60px 20px">
      <div class="icon">${icon('warning')}</div>
      <h4>화면을 표시하지 못했습니다</h4>
      <p>${esc(err.message)}</p>
      <button class="btn btn-primary" onclick="location.reload()">새로고침</button>
    </div>`;
  }
  window.scrollTo(0, 0);
}

async function boot() {
  try {
    await initAccount();
    if (!isAuthenticated()) { renderLogin($('#view')); return; }
    document.body.classList.remove('auth-mode', 'auth-pending');
    await initData();
    initShell();
    setRouteHandler(route);
    renderRoute();
    document.body.dataset.ready = '1';
    window.__MMTC__ = { state };
  } catch (err) {
    document.body.classList.remove('auth-pending');
    console.error(err);
    $('#view').innerHTML = `<div class="empty card" style="padding:60px 20px;margin-top:40px">
      <div class="icon">${icon('database')}</div>
      <h4>데이터 저장소를 열 수 없습니다</h4>
      <p>${esc(err.message)}<br>시크릿 모드에서는 IndexedDB가 제한될 수 있습니다. 일반 창에서 다시 열어 주세요.</p>
      <button class="btn btn-primary" onclick="location.reload()">다시 시도</button>
    </div>`;
  }
}

boot();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 오프라인 캐시는 부가 기능 */ });
  });
}
