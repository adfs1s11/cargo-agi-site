import {renderWorkMenu} from './ui/work-menu.js';
import {dispatchWorkflow,mountDispatchNav} from './ui/dispatch-workflow.js';
import renderTraining from './ui/pages/safety-training.js';
import renderMonthlyHistory from './ui/pages/monthly-history.js';
import renderLoadEfficiency from './ui/pages/load-efficiency.js';
import renderFleet from './ui/pages/shared-fleet.js';
import {routeStores} from './core/workspace-lazy.js';
import {showQueryProgress} from './core/query-progress.js';
import {readFailureReason} from './core/workspace-read-recovery.js';
import {refreshFleetClasses} from './core/fleet.js';
import renderDispatchReference from './ui/pages/dispatch-reference.js';
import renderKgm from './ui/pages/kgm.js';
import renderForwarding from './ui/pages/forwarding.js';
import {loadForwardingAccess} from './core/forwarding-store.js';
import {selectWorkspaceCache} from './core/db.js';
import renderNoticeAdmin from './ui/pages/driver-notices.js';
import renderDestinationRegions from './ui/pages/destination-regions.js';
import {loadRegionMappings} from './core/destination-regions-store.js';
import {workspaceStoresReady,ensureWorkspaceStores,enableFastWorkspaceStart} from './core/supabase-cloud.js';
import renderDriverAppAdmin from './ui/pages/driver-app-admin.js';
import renderTrucks from './ui/pages/commercial-trucks.js';
import renderDriverSafety from './ui/pages/driver-safety.js';
import renderCustomerShare from './ui/pages/customer-share.js';
import {bootSharedWorkspace,startSharedWorkspace} from './core/cloud.js';
import { $, esc, icon, todayStr, toast } from './core/utils.js';
import { state, initData } from './core/data.js';
import { initShell, parseHash, renderRoute, setRouteHandler, setPageMeta, renderSidebar, updateWorkdateLabel, setTopbarActions, applyWorkdate } from './ui/shell.js';
import renderDashboard from './ui/pages/dashboard.js';
import renderBoard,{mountBoardTabs} from './ui/board-views.js';
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
import {supabaseMode,workspaceProfile,workspaceSession} from './core/supabase-session.js';
import {canOpenPage,firstPage,cacheScope} from './core/workspace-access.js';
import { initAccount, isAuthenticated, logout } from './core/auth.js';
import { renderMobileHub, renderDriverMobile, renderAgentMobile, renderCustomerMobile } from './ui/mobile.js';

const PAGES = {
 'work-menu':{render:renderWorkMenu,title:'업무 메뉴 찾기',sub:'업무 순서와 부서별로 필요한 메뉴를 선택하세요.'},
 'load-efficiency':{render:renderLoadEfficiency,title:'적재 대수별 운영 효율',sub:'장비 정원·상품차종별 배차 실적과 2대 장비 전환 검토'},
 'safety-training':{render:renderTraining,title:'안전교육·자료',sub:'일정·교육내용·참석 확인·자료·사진·계획서 연결'},
 'monthly-history':{render:renderMonthlyHistory,title:'월별 운송이력',sub:'과거 배차판 대조 · 누락분 등록 · 기사별 검토'},
 fleet:{render:renderFleet,title:'통합 가용 차량 선택',sub:'공통 차량·기사 · 부서별 일정과 연결 상태'},
 'dispatch-reference':{render:renderDispatchReference,title:'배차 참고자료',sub:'수도권 순번·지방 상하행 조건·협력업체 연락처'},
 ...Object.fromEntries([['kgm','KGM 전용 배차판'],['kgm-notify','KGM 고객 안내'],['kgm-import','KGM 엑셀 업로드'],['kgm-resources','KGM 가용 기사·차량']].map(([id,title])=>[id,{render:(view,options)=>renderKgm(view,{...options,section:id}),title,sub:'KGM 전용 배차 · 가용 기사·차량'}])),
 ...Object.fromEntries([['forwarding','포워딩 업무현황'],['forwarding-orders','포워딩 오더'],['forwarding-containers','컨테이너 운송 주선'],['forwarding-settlement','포워딩 매출·매입 정산'],['forwarding-advances','대납금 관리']].map(([id,title])=>[id,{render:(view,options)=>renderForwarding(view,{...options,section:id}),title,sub:'오더 · 운송 주선 · 매출/매입 · 대납금'}])),
  'sale-rates': {render:view=>renderSettlement(view,{rateSide:'sale'}),title:'매출 단가표',sub:'거래처·브랜드·구간별 매출 공급가'},
  'purchase-rates': {render:view=>renderSettlement(view,{rateSide:'purchase'}),title:'매입 단가표',sub:'기사·브랜드·구간별 매입 공급가'},
  'commercial-volvo':{render:view=>renderTrucks(view,{params:new URLSearchParams('brand=Volvo')}),title:'Volvo 트럭 운송',sub:'상용트럭 단계별 관리'},
  'commercial-trucks':{render:renderTrucks,title:'상용트럭 운송',sub:'Mercedes-Benz·Volvo 입항부터 도착까지'},
  'customer-share':{render:renderCustomerShare,title:'거래처 배차 안내',sub:'고객사별 조회 링크·기간·해제 관리'},
  formation:{render:renderFormation,title:'배차 편성',sub:'적재 한도 검토·동일 회전 1배차로 편성'},
  'driver-notices': {render:renderNoticeAdmin,title:'공지 관리',sub:'사고 전파·브랜드별 출고 주의사항·기사 확인 현황'},
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
  safety: { render: renderSafety, title: '안전점검', sub: '등록 운송차량의 점검 현황·점검 이력·안전작업계획서.' },
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
  $('#available-popup')?.addEventListener('click',()=>{location.hash='#/fleet?date='+encodeURIComponent(state.workdate||todayStr());});
  if($('#available-popup'))$('#available-popup').textContent='통합 가용 차량';
  if(supabaseMode()){
    const role=workspaceProfile()?.role;
    if(!canOpenPage(role,'settings'))document.querySelector('#topbar-actions [data-sync]')?.remove();
    if(role!=='admin')document.querySelector('#topbar-actions a[href="#/admin"]')?.remove();
    if(!canOpenPage(role,'mobile'))document.querySelector('#topbar-actions a[href="#/mobile"]')?.remove();
    if(!canOpenPage(role,'fleet'))$('#available-popup')?.remove();
  }
}

function route({ path, segments, params }) {
  if(document.querySelector('#view')?.dataset.kgmDirty==='true'){if(!confirm('KGM 화면에 저장하지 않은 입력이 있습니다. 이동할까요?')){history.replaceState(null,'',document.querySelector('#view').dataset.kgmHash);return;}}
  if(document.querySelector('#view')?.dataset.forwardingDirty==='true'){if(!confirm('저장하지 않은 입력이 있습니다. 이동하면 입력이 사라집니다. 이동할까요?')){history.replaceState(null,'',document.querySelector('#view').dataset.forwardingHash);return;}}
  if (!isAuthenticated()) { if(supabaseMode()){location.reload();}else{logout();} return; }
  if(supabaseMode()&&!canOpenPage(workspaceProfile()?.role,path.startsWith('m/')?path:(segments[0]||'dashboard'))){location.hash='#/'+firstPage(workspaceProfile()?.role);return;}
  const flow = dispatchWorkflow(segments[0],params,state.workdate || todayStr());
  if (flow && supabaseMode() && !canOpenPage(workspaceProfile()?.role,flow.page)) { location.hash='#/'+firstPage(workspaceProfile()?.role); return; }
  if (flow && location.hash !== flow.hash) history.replaceState(null,'',flow.hash);
  const storePage = flow?.page || (path.startsWith('m/') ? path : segments[0] || 'dashboard');
  const boardView = storePage === 'board' && (params.get('view')!=='available'||!supabaseMode()||canOpenPage(workspaceProfile()?.role,'formation')) ? params.get('view') : '';
  const neededStores = storePage==='work-menu' ? [] : ['groups','available'].includes(boardView) ? [...routeStores('crew-check'), 'equipment']
    : routeStores(flow?.tab==='crews'?'crew-check':storePage);
  if (flow) params = new URLSearchParams(flow.hash.split('?')[1]);
  document.getElementById('dispatch-workflow')?.remove();
  document.getElementById('board-view-switch')?.remove();
  // A distinct host makes stale asynchronous responses unable to overwrite the next page.
  const previous=$('#view'),view=previous.cloneNode(false);
  view.classList.remove('notice-center','nc-admin','forwarding-workspace','kgm-workspace');view.dataset.kgmDirty='false';delete view.dataset.kgmHash;view.dataset.forwardingDirty='false';delete view.dataset.forwardingHash;view.dataset.regionDirty='false';previous.replaceWith(view);
  document.body.classList.remove('board-focus');
  document.body.classList.toggle('role-mode', path.startsWith('m/'));
  document.querySelector('.nav-backdrop')?.remove();
  $('#sidebar')?.classList.remove('open');
  view.innerHTML = '';
  if(storePage==='board')mountBoardTabs(view,params);

  if(supabaseMode()&&workspaceProfile()?.role!=='forwarding'&&!workspaceStoresReady(neededStores)){
    setPageMeta(PAGES[segments[0]]?.title||'업무 자료', '선택한 메뉴에 필요한 자료를 준비합니다.');
    view.innerHTML='<section class="card card-pad"><h3>메뉴 자료 불러오기</h3><p>처음 여는 메뉴는 자료를 한 번 준비합니다. 다른 메뉴로 이동해도 원본은 유지됩니다.</p><p data-load-progress role="status">서버 확인 중…</p><a href="#/dashboard">대시보드로 돌아가기</a></section>';
    const progress=view.querySelector('[data-load-progress]');
    const tracker=showQueryProgress(progress,'원장 버전과 메뉴 자료 확인 중…');
    ensureWorkspaceStores(neededStores,p=>tracker.stage(p.store+' · '+p.loaded.toLocaleString()+' / '+p.total.toLocaleString()+'건')).then(()=>{if(progress.isConnected)renderRoute();}).catch(e=>{if(!progress.isConnected)return;progress.textContent=e.message;const retry=document.createElement('button');retry.className='btn btn-primary';retry.textContent='다시 조회';retry.onclick=renderRoute;progress.after(retry);}).finally(tracker.stop);
    return;
  }

  if (MOBILE[path]) {
    const m = MOBILE[path];
    setPageMeta(m.title, m.sub);
    document.title = `${m.title} · M&M`;
    m.render(view, params);
    window.scrollTo(0, 0);
    return;
  }

  const id = flow?.page || (PAGES[segments[0]] ? segments[0] : 'dashboard');
  const page = PAGES[id];
  renderSidebar(flow ? 'formation' : id==='vehicle-safety'?'equipment':id);
  setPageMeta(flow ? '배차 편성' : page.title, flow ? '편성을 만들고 저장한 초안을 회전별로 검토·확정합니다.' : page.sub);
  updateWorkdateLabel();
  topbarFor(id);
  if (flow) mountDispatchNav(view,flow,applyWorkdate);
  try {
    view.dataset.regionDirty='false';
    const routeHash=location.hash;
    const renderPage=()=>Promise.resolve().then(()=>{if(view.isConnected)return page.render(view,{tab:params.get('tab'),params,date:flow?.date});}).catch(err=>{if(!view.isConnected)return;console.error(err);view.innerHTML=`<div class="card card-pad"><h3>화면을 표시하지 못했습니다</h3><p>${esc(err.message)}</p><button class="btn btn-primary" id="route-retry">다시 조회</button></div>`;view.querySelector('#route-retry').onclick=renderRoute;});
    if((id==='board'&&!['groups','available'].includes(boardView))||id==='dashboard')loadRegionMappings().catch(e=>console.warn(e.message)).finally(()=>{if(view.isConnected&&location.hash===routeHash)renderPage();});
      else if(['drivers','schedule','equipment','assign','engine','formation'].includes(id))refreshFleetClasses().catch(e=>console.warn(e.message)).finally(()=>{if(view.isConnected&&location.hash===routeHash)renderPage();});
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
  const authProgress=document.getElementById('startup-auth-progress');
  let checkingLogin=true;
  try {
    enableFastWorkspaceStart();
    try{await initAccount();}finally{authProgress?.remove();}
    checkingLogin=false;
    if (!isAuthenticated()) { renderLogin($('#view')); return; }
    document.body.classList.remove('auth-mode', 'auth-pending');
    const forwardingOnly=supabaseMode()&&workspaceProfile()?.role==='forwarding';
    if(forwardingOnly)await selectWorkspaceCache(cacheScope(workspaceProfile(),workspaceSession().nonce));
    else if(!await bootSharedWorkspace($('#view')))return;
    await initData();
    const forwardingAccess=await loadForwardingAccess();
    if(forwardingOnly&&!forwardingAccess)throw Error('포워딩 업무 권한이 중지되었거나 확인되지 않았습니다. 관리자에게 문의하세요.');
    if(!forwardingOnly)try{await loadRegionMappings();}catch(e){console.warn(e.message);}
    initShell();
    setRouteHandler(route);
    renderRoute();
    document.body.dataset.ready = '1';

    if(!forwardingOnly)startSharedWorkspace(()=>{if(document.querySelector('#view .wm-home'))return;const reportNotice=document.querySelector('[data-efficiency-refresh]');if(reportNotice){reportNotice.hidden=false;return;}if(viewMappingDirty())return;if(document.querySelector('.vs-workspace'))window.dispatchEvent(new Event('vehicle-safety-sync'));else if(document.querySelector('.formation-workspace'))window.dispatchEvent(new Event('formation-sync'));else renderRoute();});
  } catch (err) {
    document.body.classList.remove('auth-pending');
    if(checkingLogin)document.body.classList.add('auth-mode');
    console.error(err);
    $('#view').innerHTML = `<div class="empty card" style="padding:60px 20px;margin-top:40px">
      <div class="icon">${icon('database')}</div>
      <h4>${esc(checkingLogin?'직원 로그인 상태를 확인하지 못했습니다':readFailureReason(err)||'데이터 저장소를 열 수 없습니다')}</h4>
      <p>${esc(err.message)}<br>잠시 후 다시 조회해 주세요. 반복되면 이 문구와 발생 시각을 관리자에게 알려주세요.</p>
      <button class="btn btn-primary" id="startup-retry">다시 조회</button>
    </div>`;
    $('#startup-retry').onclick=()=>location.reload();
  }
}

window.addEventListener('workspace-auth-expired',()=>{
 document.body.classList.add('auth-pending');document.getElementById('modal-root')?.replaceChildren();
 sessionStorage.setItem('mmtc.login.notice','expired');location.reload();
});
window.addEventListener('pageshow',e=>{if(e.persisted&&supabaseMode())location.reload();});
boot();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 오프라인 캐시는 부가 기능 */ });
  });
}


window.addEventListener('sheet-sync-complete',()=>{if(location.hash.split('?')[0]==='#/dashboard')renderRoute();});

function viewMappingDirty(){return document.querySelector('#view')?.dataset.regionDirty==='true'||!!document.querySelector('.forwarding-workspace')||!!document.querySelector('.kgm-workspace');}
