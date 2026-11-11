import renderDestinationRegions from './ui/pages/destination-regions.js';
import {loadRegionMappings} from './core/destination-regions-store.js';
import {referenceHistoryReady,ensureReferenceHistory} from './core/supabase-cloud.js';
import renderDriverAppAdmin from './ui/pages/driver-app-admin.js';
import renderTrucks from './ui/pages/commercial-trucks.js';
import renderDriverSafety from './ui/pages/driver-safety.js';
import renderCustomerShare from './ui/pages/customer-share.js';
import {bootSharedWorkspace,startSharedWorkspace} from './core/cloud.js';
import { $, esc, icon, todayStr, toast } from './core/utils.js';
import { state, initData } from './core/data.js';
import { initShell, parseHash, renderRoute, setRouteHandler, setPageMeta, renderSidebar, updateWorkdateLabel, setTopbarActions } from './ui/shell.js';
import renderDashboard from './ui/pages/dashboard.js';
import renderBoard from './ui/pages/board.js';
import renderAssign from './ui/pages/assign.js';
import renderFormation from './ui/pages/formation.js';
import renderDrivers from './ui/pages/drivers.js';
import renderEquipment from './ui/pages/equipment.js';
import renderSafety from './ui/pages/safety.js';
import renderVehicleSafety from './ui/pages/vehicle-safety.js';
import renderProducts from './ui/pages/products.js';
import renderIncidents from './ui/pages/incidents.js';
import renderEvaluation from './ui/pages/evaluation.js';
import renderSettings from './ui/pages/settings.js';
import renderAdmin from './ui/pages/admin.js';
import renderSettlement from './ui/pages/settlement.js';
import renderSchedule, { openAvailability } from './ui/pages/schedule.js';
import renderEngine from './ui/pages/engine.js';
import renderLogin from './ui/login.js';
import {supabaseMode,workspaceProfile} from './core/supabase-session.js';
import {canOpenPage,firstPage} from './core/workspace-access.js';
import { initAccount, isAuthenticated, logout } from './core/auth.js';
import { renderMobileHub, renderDriverMobile, renderAgentMobile, renderCustomerMobile } from './ui/mobile.js';

const PAGES = {
  'sale-rates': {render:view=>renderSettlement(view,{rateSide:'sale'}),title:'매출 단가표',sub:'거래처·브랜드·구간별 매출 공급가'},
  'purchase-rates': {render:view=>renderSettlement(view,{rateSide:'purchase'}),title:'매입 단가표',sub:'기사·브랜드·구간별 매입 공급가'},
  'commercial-volvo':{render:view=>renderTrucks(view,{params:new URLSearchParams('brand=Volvo')}),title:'Volvo 트럭 운송',sub:'상용트럭 단계별 관리'},
  'commercial-trucks':{render:renderTrucks,title:'상용트럭 운송',sub:'Mercedes-Benz·Volvo 입항부터 도착까지'},
  'customer-share':{render:renderCustomerShare,title:'거래처 배차 안내',sub:'고객사별 조회 링크·기간·해제 관리'},
  formation:{render:renderFormation,title:'배차 편성',sub:'적재 한도 검토·동일 회전 1배차로 편성'},
  'driver-app-admin': {render:renderDriverAppAdmin,title:'기사 앱 관리',sub:'기사 인증·공지·점검·차량 위치'},
  'driver-safety': {render:renderDriverSafety,title:'기사 모바일 장비점검',sub:'고객사 양식·기사 접속·접수·리포트'},
  'vehicle-safety': { render:renderVehicleSafety,title:'차량 안전관리',sub:'차량별 점검표·작업계획서·조치 이력' },
  schedule: { render: renderSchedule, title: '기사 스케줄', sub: '운행 요일·출근·휴무와 가용 기사 확인' },
  settlement: { render: renderSettlement, title: '정산·마감', sub: '매출·매입 단가 적용과 월별 마감' },
  engine: { render: renderEngine, title: '배차엔진', sub: '장기 운송 이력과 신규 기사·장비 유사도' },
  admin: { render: renderAdmin, title: '관리자 페이지', sub: '관리자 계정·샘플 자료 설정' },
  'destination-regions': {render:renderDestinationRegions,title:'도착지·권역 전환표',sub:'배차 도착지 자동 분류 · 공용 전환표'},
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
  'm/safety': {render:(view,params)=>renderVehicleSafety(view,{params}),title:'모바일 안전점검',sub:'차량 셀프 체크·사진·조치 기록'},
  'm/driver': { render: renderDriverMobile, title: '기사용', sub: '오늘의 배차와 완료 보고' },
  'm/agent': { render: renderAgentMobile, title: '주재원용', sub: '현장 도착·출고 확인' },
  'm/customer': { render: (view)=>{view.innerHTML='<div class="card card-pad"><h2>고객 전용 조회</h2><p>운영자에게 받은 거래처 전용 링크를 이용하세요.</p><a class="btn btn-primary" href="customer/">고객 전용 조회 열기</a></div>';}, title: '고객용', sub: '배송 상태 조회' },
};

function topbarFor(id) {
  const g = state.settings.google;
  const sync = g?.url
    ? `<button class="chip" data-sync title="Google Sheets 동기화" style="cursor:pointer;border:1px solid var(--line);height:32px;padding:0 10px;border-radius:9px;background:#fff;font-size:11.5px;display:inline-flex;align-items:center;gap:5px">${icon('cloud')} ${g.lastSync ? '동기화됨' : '연동 대기'}</button>`
    : '';
  setTopbarActions(`
    ${state.settings.demo ? '<span class="badge amber" title="샘플 데이터가 포함되어 있습니다">샘플</span>' : ''}
    ${sync}
    <span class="badge blue" title="모든 입력·표시 금액은 공급가이며 부가세는 별도입니다">금액: 부가세 별도</span>
    <button class="btn btn-sm btn-ghost" id="available-popup">가용 기사</button>
    <a class="btn btn-sm btn-ghost" href="#/admin" data-link>관리자</a>
    <button class="btn btn-sm btn-ghost" id="auth-logout">로그아웃</button>
    <a class="btn btn-sm btn-ghost" href="#/mobile" data-link title="현장 모바일">${icon('mobile')} 모바일</a>
  `);
  $('[data-sync]')?.addEventListener('click', () => { location.hash = '#/settings'; });
  $('#auth-logout')?.addEventListener('click', logout);
  $('#available-popup')?.addEventListener('click', () => openAvailability());
  if(supabaseMode()){
    const role=workspaceProfile()?.role;
    if(role!=='admin')document.querySelector('#topbar-actions a[href="#/admin"]')?.remove();
    if(!canOpenPage(role,'schedule'))$('#available-popup')?.remove();
  }
}

function route({ path, segments, params }) {
  if (!isAuthenticated()) { logout(); return; }
  if(supabaseMode()&&!canOpenPage(workspaceProfile()?.role,path.startsWith('m/')?path:(segments[0]||'dashboard'))){location.hash='#/'+firstPage(workspaceProfile()?.role);return;}
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
  renderSidebar(id==='vehicle-safety'?'equipment':id);
  setPageMeta(page.title, page.sub);
  updateWorkdateLabel();
  topbarFor(id);
  if(supabaseMode()&&['engine','assign','evaluation'].includes(id)&&!referenceHistoryReady()){
    const request=Symbol();view.historyRequest=request;
    view.innerHTML='<section class="card card-pad"><h3>과거 운송 이력 조회</h3><p>이 메뉴의 추천·분석에 필요한 참고 이력을 준비합니다. 대시보드 접속 시에는 내려받지 않습니다.</p><p id="history-progress" role="status">조회 준비 중…</p><a href="#/dashboard">대시보드로 돌아가기</a></section>';
    const progress=view.querySelector('#history-progress');
    ensureReferenceHistory(p=>{if(progress.isConnected)progress.textContent=p.loaded.toLocaleString()+' / '+p.total.toLocaleString()+'건';}).then(()=>{if(view.historyRequest===request&&progress.isConnected)renderRoute();}).catch(e=>{if(progress.isConnected){progress.textContent=e.message;const retry=document.createElement('button');retry.className='btn btn-primary';retry.textContent='이력 조회 다시 시도';retry.onclick=renderRoute;progress.after(retry);}});
    return;
  }
  try {
    view.dataset.regionDirty='false';
    const routeHash=location.hash;
    const renderPage=()=>page.render(view,{tab:params.get('tab'),params});
    if(['board','dashboard'].includes(id))loadRegionMappings().catch(e=>console.warn(e.message)).finally(()=>{if(view.isConnected&&location.hash===routeHash)renderPage();});
    else renderPage();
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
    if(!await bootSharedWorkspace($('#view')))return;
    await initData();
    try{await loadRegionMappings();}catch(e){console.warn(e.message);}
    initShell();
    setRouteHandler(route);
    renderRoute();
    document.body.dataset.ready = '1';
    window.__MMTC__ = { state };
    startSharedWorkspace(()=>{if(viewMappingDirty())return;if(document.querySelector('.vs-workspace'))window.dispatchEvent(new Event('vehicle-safety-sync'));else if(document.querySelector('.formation-workspace'))window.dispatchEvent(new Event('formation-sync'));else renderRoute();});
  } catch (err) {
    document.body.classList.remove('auth-pending');
    console.error(err);
    $('#view').innerHTML = `<div class="empty card" style="padding:60px 20px;margin-top:40px">
      <div class="icon">${icon('database')}</div>
      <h4>데이터 저장소를 열 수 없습니다</h4>
      <p>${esc(err.message)}<br>자료 연결 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요. 반복되면 위 오류 내용을 관리자에게 전달해 주세요.</p>
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


window.addEventListener('sheet-sync-complete',()=>{if(location.hash.split('?')[0]==='#/dashboard')renderRoute();});

function viewMappingDirty(){return document.querySelector('#view')?.dataset.regionDirty==='true';}
