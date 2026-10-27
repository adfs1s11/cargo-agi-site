import { state, saveSettings } from '../../core/data.js';
import { buildContext } from '../../core/assign.js';
import { classifyOrder, routeKey } from '../../core/dispatch-profile.js';
import { esc, nf, todayStr, addDays, toast } from '../../core/utils.js';
import { pageHead, kpi } from '../components.js';

export default function renderEngine(view) {
  const date = state.workdate || todayStr();
  const days = Number(state.settings.assign.historyDays) || 730;
  const context = buildContext(date);
  const history = state.dispatch.filter((r) => r.date >= addDays(date, -days) && r.date < date && r.driver && !['cancelled', 'notshipped', 'support'].includes(r.status));
  const group = (key) => { const map = new Map(); for (const r of history) { const name = key(classifyOrder(r, state.products)) || '분류 미입력'; map.set(name, (map.get(name) || 0) + Number(r.count || 1)); } return [...map].sort((a, b) => b[1] - a[1]); };
  const routes = group((r) => `${r.origin || '출발지 미입력'} → ${r.destination || '도착지 미입력'}`);
  const classes = group((r) => r.cargoClass || r.model);
  const newDrivers = context.drivers.filter((d) => (d.history?.rows || 0) < 60);
  const table = (rows) => `<table class="data"><thead><tr><th>구분</th><th class="num">운송 대수</th></tr></thead><tbody>${rows.slice(0, 15).map(([name, count]) => `<tr><td>${esc(name)}</td><td class="num">${nf(count)}대</td></tr>`).join('') || '<tr><td colspan="2">이력이 없습니다.</td></tr>'}</tbody></table>`;
  view.innerHTML = `${pageHead('배차엔진 · 이력 분석', '구간·차종·장비·숙련도를 함께 비교하는 이력 기반 추천입니다. 실제 거리와 이동시간은 입력된 경우에만 참고할 수 있습니다.')}
    <div class="card card-pad row" style="gap:12px;margin-bottom:16px;flex-wrap:wrap"><label>참고 이력 <select class="select" id="en-days" style="width:160px;display:inline-block">${[180, 365, 730, 1095].map((n) => `<option value="${n}" ${n === days ? 'selected' : ''}>${n === 180 ? '6개월' : `${n / 365}년`}</option>`).join('')}</select></label><span class="muted">${addDays(date, -days)} ~ ${addDays(date, -1)} · 취소·미출고·지원 제외</span><a class="btn btn-primary" href="#/assign" data-link>추천 배차 실행</a></div>
    <div class="grid grid-4">${kpi({ label: '참고 운송 이력', value: nf(history.length), unit: '건', foot: '기준일 이전 이력만 사용' })}${kpi({ label: '기존 운송구간', value: nf(routes.length), unit: '개', foot: '출발지 + 도착지 조합' })}${kpi({ label: '상품 분류·차종', value: nf(classes.length), unit: '개', foot: '상품 마스터 분류 우선' })}${kpi({ label: '이력 부족 기사', value: nf(newDrivers.length), unit: '명', foot: '참고 운송 60대 미만' })}</div>
    <div class="section card card-pad"><h3>신규 기사·장비의 유사 이력</h3><p class="muted">같은 장비 유형·유사 적재대수·숙련도·출발지 거점을 비교합니다. 자신의 이력이 60대 미만이면 최대 3명의 유사 이력을 낮은 비중으로 참고하며, 이력이 쌓이면 자신의 이력을 우선합니다. 장비·숙련도 조건이 맞지 않는 운송건은 추천하지 않습니다.</p><select class="select" id="en-driver" style="max-width:360px">${context.drivers.map((d) => `<option value="${esc(d.id)}">${esc(d.name)} · 이력 ${nf(d.history?.rows || 0)}대</option>`).join('')}</select><div id="en-peers" style="margin-top:14px"></div></div>
    <div class="grid grid-2 section"><div class="card"><div class="card-pad"><h3>자주 운송한 구간 (상위 15개)</h3></div><div class="scroll-x">${table(routes)}</div></div><div class="card"><div class="card-pad"><h3>상품 분류·차종 이력 (상위 15개)</h3></div><div class="scroll-x">${table(classes)}</div></div></div>
    <div class="card card-pad section"><h3>추가 고려 조건 입력</h3><p class="muted">기사: 숙련도 1~5, 출발지 거점, 가능 상품분류, 운행 시간 · 장비: 가동 상태, 적재대수, 허용중량, 가능 상품분류 · 상품차량: 분류, 필요 장비, 최소 숙련도, 차량 중량. 기존 평가·선호/기피 권역·일일 부하·사고 이력도 함께 적용합니다.</p><div class="row" style="gap:10px;flex-wrap:wrap"><a class="btn btn-ghost" href="#/drivers" data-link>기사 조건 설정</a><a class="btn btn-ghost" href="#/equipment" data-link>장비 조건 설정</a><a class="btn btn-ghost" href="#/products" data-link>상품차량 분류 설정</a></div><p class="small muted">가능 상품분류는 쉼표로 구분합니다. 필요 장비·분류·거점 명칭은 정확히 일치시켜 주세요. 시간 정보가 없는 운송건에는 운행 시간 제한을 판정할 수 없습니다. 적재중량은 원장 1행의 차량중량×대수 기준입니다. 여러 운송건의 동시 적재 배치, 실제 지도 기반 공차거리·차종 치수별 배치는 현재 계산하지 않습니다.</p></div>`;
  const showPeers = () => {
    const d = context.drivers.find((d) => d.id === view.querySelector('#en-driver').value);
    view.querySelector('#en-peers').innerHTML = d ? `<p>장비 ${esc(d.equipment?.type || '미등록')} · 적재 ${nf(d.equipment?.capacity || 0)}대 · 숙련도 ${d.skillLevel}/5 · 거점 ${esc(d.baseOrigin || '미입력')}</p>${d.peers.length ? d.peers.map((p) => `<div class="dispatch-list-row"><span>${esc(p.name)} · 운송 ${nf(p.history.rows)}대</span><strong>유사도 ${Math.round(p.similarity * 100)}%</strong></div>`).join('') : '<p class="muted">비교할 유사 이력이 없습니다. 같은 유형의 장비와 기존 운송 이력을 등록하세요.</p>'}` : '<p class="muted">활동 기사가 없습니다.</p>';
  };
  view.querySelector('#en-driver').onchange = showPeers; showPeers();
  view.querySelector('#en-days').onchange = async (e) => { try { await saveSettings({ assign: { historyDays: Number(e.target.value) } }); renderEngine(view); } catch (e) { toast(e.message, 'warn'); } };
}
