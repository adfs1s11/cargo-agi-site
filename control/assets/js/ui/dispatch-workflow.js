import {validDate} from '../core/schedule.js';
import {esc} from '../core/utils.js';

const stages = {
  packing: {page:'formation', label:'동선으로 편성'},
  recommend: {page:'assign', label:'기사 추천'},
  review: {page:'formation', label:'초안 검토·확정'},
  history: {page:'engine', label:'추천 이력 분석'},
};

export function workflowHash(tab,date,selection) {
  const query = new URLSearchParams({tab});
  if (validDate(date)) query.set('date',date);
  if (selection) query.set('selection',selection);
  return '#/formation?' + query;
}

export function dispatchWorkflow(id,params,fallbackDate) {
  if (!['formation','assign','engine'].includes(id)) return null;
  const legacy = {assign:'recommend',engine:'history'};
  const requested = params.get('tab');
  const tab = legacy[id] || (Object.hasOwn(stages,requested) ? requested : 'review');
  const date = validDate(params.get('date')) ? params.get('date') : fallbackDate;
  const selection = params.get('selection') || '';
  const active = selection && tab === 'recommend' ? 'packing' : tab;
  return {tab:active,page:stages[active].page,date,selection,hash:workflowHash(active,date,selection)};
}

export function mountDispatchNav(view,flow,onDate) {
  const nav = document.createElement('nav');
  nav.id = 'dispatch-workflow';
  nav.className = 'no-print';
  nav.setAttribute('aria-label','배차 편성 작업');
  const link = tab => `<a href="${esc(workflowHash(tab,flow.date,flow.selection))}" ${flow.tab===tab?'aria-current="page"':''}>${stages[tab].label}</a>`;
  nav.innerHTML = `<div class="dw-inner"><div class="dw-fields"><label>편성 일자 <input type="date" value="${esc(flow.date)}"></label>
    ${flow.selection ? `<a href="${esc(workflowHash('packing',flow.date))}">선택 해제 · 일자 전체로 편성</a>` : ''}</div>
    <div class="dw-steps"><div><small>초안 만들기</small><div class="dw-links">${link('packing')}${flow.selection?'':link('recommend')}</div></div>
    <div><small>일자별 편성</small><div class="dw-links">${link('review')}</div></div>
    <div class="dw-extra"><small>참고</small><div class="dw-links">${link('history')}</div></div></div></div>`;
  nav.querySelector('input').onchange = async event => {
    const input = event.currentTarget;
    try { if (validDate(input.value) && input.value !== flow.date) await onDate(input.value); }
    finally { if (input.isConnected) input.value = flow.date; }
  };
  view.before(nav);
}
