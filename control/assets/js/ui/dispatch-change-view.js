import {dispatchChanges,CHANGE_FILTERS} from '../core/dispatch-changes.js';
import {esc,nf} from '../core/utils.js';
export function changeBadges(row){
 const c=dispatchChanges(row);
 return c.labels.map(label=>`<div class="tiny" style="margin-top:4px"><span class="badge ${label==='운송 취소'?'red':'amber'}" title="${esc(c.details.join(' / '))}">${esc(label)}</span></div>`).join('')+c.details.map(t=>`<div class="tiny muted" style="white-space:normal;min-width:150px;margin-top:4px">${esc(t)}</div>`).join('');
}
export function dashboardChangeLinks(date,counts,{pending=false,links=true}={}){
 const items=pending?[['','전체 미배차',null],['dateChanged','날짜 변경',counts.pendingDateChangedUnits],['modified','수정',counts.pendingModifiedUnits],['assignmentCleared','배정 해제',counts.pendingAssignmentClearedUnits]]:CHANGE_FILTERS.slice(1).map(([key,label])=>[key,label,counts[key]]);
 return `<div class="row" style="gap:8px;flex-wrap:wrap;margin:12px 0" aria-label="${pending?'미배차 변경 구분':'배차 변경 구분'}">${items.map(([key,label,count])=>links?`<a class="btn btn-sm btn-ghost" data-link href="#/board?date=${encodeURIComponent(date)}${pending?'&assign=unassigned':''}&change=${key}">${label}${count==null?'':` ${nf(count)}${pending?'대':'건'}`}</a>`:`<span class="badge">${label}${count==null?'':` ${nf(count)}${pending?'대':'건'}`}</span>`).join('')}</div><p class="tiny muted">${pending?'날짜 변경·수정 후에도 유효하고 기사 배정이 없으면 미배차에 포함합니다. 운송 취소는 제외하며, 배정 해제는 재배차 대상으로 남습니다.':'조회 운송일 기준 · 날짜 변경은 수정에도 포함되므로 합산하지 않습니다. 변경 표기만 있는 건은 전·후 내용 확인이 필요합니다.'}</p>`;
}
