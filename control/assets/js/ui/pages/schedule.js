import { state, saveDriverSchedule, reloadAll } from '../../core/data.js';
import { availabilityRows, scheduleLabel, SCHEDULE_MODES, WEEKDAYS, validDate } from '../../core/schedule.js';
import { esc, nf, todayStr, addDays, openModal, toast } from '../../core/utils.js';
import { pageHead, field, kpi } from '../components.js';

const rowsOn = date => availabilityRows(state.drivers, date, state.equipment, state.dispatch, state.assignments);
const statusText = r => r.conflict ? '배차 재확인' : r.free ? '가용 · 미배차' : r.available ? '배차 있음 · 추가 확인' : '운행 불가';
const statusBadge = r => `<span class="badge ${r.conflict ? 'red' : r.free ? 'green' : r.available ? 'blue' : 'gray'}">${statusText(r)}</span>`;
const table = (rows, edit = false) => `<div class="card scroll-x"><table class="data schedule-table"><thead><tr><th>기사 / 연락처</th><th>차량 / 유형</th><th>운행 스케줄</th><th>상태 / 사유</th><th>현재 배차</th>${edit ? '<th></th>' : ''}</tr></thead><tbody>${rows.slice(0,200).map(r=>`<tr><td><b>${esc(r.driver.name)}</b><div class="small muted">${esc(r.driver.phone || '-')}</div></td><td>${esc(r.driver.vehicleNo || r.equipment?.plateNo || '차량 미등록')}<div class="small muted">${esc(r.equipment?.type || r.driver.type || '')}</div></td><td>${esc(scheduleLabel(r.driver))}<div class="small muted">${esc(r.driver.availableFrom || '')}${r.driver.availableTo ? ' ~ '+esc(r.driver.availableTo) : ''}</div></td><td>${statusBadge(r)}<div class="small muted">${esc(r.reason)}</div></td><td>${nf(r.orders)}건 / ${nf(r.count)}대</td>${edit ? `<td><button class="btn btn-sm btn-ghost" data-schedule-edit="${esc(r.driver.id)}">스케줄 설정</button></td>` : ''}</tr>`).join('') || `<tr><td colspan="${edit ? 6 : 5}" class="table-empty">조건에 맞는 기사가 없습니다.</td></tr>`}</tbody></table></div>${rows.length>200 ? '<p class="small muted">상위 200명 표시 · 이름·차량 검색으로 범위를 줄이세요.</p>' : ''}`;
const filterRows = (rows, filter, query) => rows.filter(r => (!query || `${r.driver.name} ${r.driver.phone} ${r.driver.vehicleNo} ${r.equipment?.plateNo || ''}`.toLowerCase().includes(query.toLowerCase())) && (filter === 'all' || filter === 'free' && r.free || filter === 'working' && r.available || filter === 'off' && !r.available || filter === 'conflict' && r.conflict));
const filters = '<option value="free">가용 · 미배차</option><option value="working">운행 가능 전체 (배차 포함)</option><option value="off">운행 불가</option><option value="conflict">배차 재확인</option><option value="all">전체</option>';

export function openAvailability(date = state.workdate || todayStr()) {
  openModal({ title: '가용 기사 · 차량', sub: '배차가 없는 운행 가능 기사입니다. 배차가 있는 기사의 추가 투입은 시간·적재량을 확인하세요.', size: 'wide',
    body: `<div class="schedule-toolbar"><label>조회일 <input class="input" id="av-date" type="date" value="${esc(date)}"></label><label>표시 <select class="select" id="av-filter">${filters}</select></label><label>검색 <input class="input" id="av-search" placeholder="이름·차량번호·연락처"></label><button class="btn btn-ghost" id="av-refresh">새로고침</button></div><p id="av-summary"></p><div id="av-list"></div>`,
    foot: '<a class="btn btn-ghost" href="#/schedule" data-close>스케줄 관리</a><button class="btn btn-primary" data-close>닫기</button>',
    onMount(el) {
      const draw = () => {
        const current=el.querySelector('#av-date').value;
        if (!validDate(current)) return;
        const rows=rowsOn(current), visible=filterRows(rows,el.querySelector('#av-filter').value,el.querySelector('#av-search').value);
        el.querySelector('#av-summary').textContent=`${current} · 가용 미배차 ${rows.filter(r=>r.free).length}명 · 배차 재확인 ${rows.filter(r=>r.conflict).length}명`;
        el.querySelector('#av-list').innerHTML=table(visible);
      };
      el.querySelector('#av-date').onchange=draw;el.querySelector('#av-filter').onchange=draw;el.querySelector('#av-search').oninput=draw;
      el.querySelector('#av-refresh').onclick=async()=>{try{await reloadAll();draw();}catch(e){toast(e.message,'warn');}};draw();
    }
  });
}

export default function renderSchedule(view) {
  let date=state.workdate || todayStr(), filter='all', query='';
  view.innerHTML=`${pageHead('기사 스케줄 · 가용 현황','정기 운행 요일과 날짜별 출근·휴무를 관리합니다.','<button class="btn btn-primary" id="sc-popup">가용 기사 팝업</button>')}<div class="schedule-toolbar card card-pad"><label>조회일 <input class="input" id="sc-date" type="date" value="${date}"></label><label>표시 <select class="select" id="sc-filter">${filters}</select></label><label>검색 <input class="input" id="sc-search" placeholder="이름·차량번호·연락처"></label><button class="btn btn-ghost" id="sc-refresh">새로고침</button><a class="btn btn-ghost" href="#/drivers" data-link>기사 등록</a></div><div id="sc-summary" class="grid grid-4" style="margin:16px 0"></div><div class="insight" style="margin:16px 0">매일 운행은 매일 출근, 요일별 운행은 선택한 요일에만 출근합니다. 비정기 차량은 ‘출근일 별도 지정’을 선택하세요. 날짜별 지정이 기본 요일보다 우선하며, 비활동 기사·정비 차량은 제외합니다. 휴무로 변경해도 기존 배차는 삭제하지 않고 재확인으로 표시합니다. 가용 표시는 운송 시간·적재량의 최종 확인을 대신하지 않습니다.</div><div id="sc-list"></div>`;
  view.querySelector('#sc-filter').value=filter;
  const draw=()=>{
    const rows=rowsOn(date);
    view.querySelector('#sc-summary').innerHTML=kpi({label:'가용 · 미배차',value:rows.filter(r=>r.free).length,unit:'명',tone:'good'})+kpi({label:'운행 가능',value:rows.filter(r=>r.available).length,unit:'명',foot:'배차 있는 기사 포함'})+kpi({label:'운행 불가',value:rows.filter(r=>!r.available).length,unit:'명'})+kpi({label:'배차 재확인',value:rows.filter(r=>r.conflict).length,unit:'명',tone:'warn'});
    view.querySelector('#sc-list').innerHTML=table(filterRows(rows,filter,query),true);
    view.querySelectorAll('[data-schedule-edit]').forEach(b=>b.onclick=()=>editSchedule(b.dataset.scheduleEdit,date,draw));
  };
  view.querySelector('#sc-date').onchange=e=>{if(validDate(e.target.value)){date=e.target.value;draw();}};
  view.querySelector('#sc-filter').onchange=e=>{filter=e.target.value;draw();};view.querySelector('#sc-search').oninput=e=>{query=e.target.value;draw();};
  view.querySelector('#sc-popup').onclick=()=>openAvailability(date);
  view.querySelector('#sc-refresh').onclick=async()=>{try{await reloadAll();draw();}catch(e){toast(e.message,'warn');}};draw();
}

function editSchedule(id,date,onSaved) {
  const driver=state.drivers.find(d=>d.id===id);if(!driver)return;
  const schedule=driver.schedule || {mode:'daily',weekdays:[1,2,3,4,5],exceptions:{}};
  const exceptions=Object.entries(schedule.exceptions || {}).sort(([a],[b])=>a.localeCompare(b));
  openModal({title:`${driver.name} · 스케줄 설정`,sub:'기본 운행과 지정 기간 출근·휴무를 함께 저장합니다.',size:'wide',
    body:`<div class="form-grid">${field('기본 운행 유형',`<select class="select" id="sc-mode">${Object.entries(SCHEDULE_MODES).map(([k,v])=>`<option value="${k}" ${schedule.mode===k?'selected':''}>${v}</option>`).join('')}</select>`)}<div class="field"><label>정기 운행 요일 (요일별 운행 시 적용)</label><div class="schedule-days">${WEEKDAYS.map((label,n)=>`<label class="check"><input type="checkbox" value="${n}" data-weekday ${(schedule.weekdays || []).includes(n)?'checked':''}>${label}</label>`).join('')}</div></div></div><div class="divider"></div><h4>날짜별 지정 (최대 366일)</h4><div class="form-grid">${field('시작일',`<input class="input" type="date" id="sc-from" value="${date}">`)}${field('종료일',`<input class="input" type="date" id="sc-to" value="${date}">`)}${field('지정 내용',`<select class="select" id="sc-exception"><option value="keep">날짜별 지정 변경 없음</option><option value="available">출근 지정</option><option value="off">휴무 지정</option><option value="reset">지정 해제 (기본 운행 적용)</option></select>`)}${field('사유',`<input class="input" id="sc-reason" maxlength="300" placeholder="휴가, 차량 정비, 임시 출근 등">`)}</div><p class="small muted">차량 정비·기사 비활동 상태는 출근 지정으로 해제되지 않습니다.</p><h4>등록된 날짜별 지정 ${exceptions.length}일</h4><div class="scroll-x" style="max-height:220px;overflow:auto"><table class="data"><thead><tr><th>날짜</th><th>지정</th><th>사유</th></tr></thead><tbody>${exceptions.map(([d,e])=>`<tr><td>${esc(d)}</td><td>${e.status==='available'?'출근':'휴무'}</td><td>${esc(e.reason || '-')}</td></tr>`).join('') || '<tr><td colspan="3">날짜별 지정 없음</td></tr>'}</tbody></table></div>`,
    foot:'<button class="btn btn-ghost" data-close>취소</button><button class="btn btn-primary" id="sc-save">스케줄 저장</button>',
    onMount(el,close) {el.querySelector('#sc-save').onclick=async()=>{
      const button=el.querySelector('#sc-save');button.disabled=true;
      try {
        const mode=el.querySelector('#sc-mode').value,weekdays=[...el.querySelectorAll('[data-weekday]:checked')].map(x=>Number(x.value));
        const action=el.querySelector('#sc-exception').value,from=el.querySelector('#sc-from').value,to=el.querySelector('#sc-to').value,reason=el.querySelector('#sc-reason').value.trim();
        if(action!=='keep' && (!validDate(from)||!validDate(to)||from>to||(Date.parse(to)-Date.parse(from))/86400000>365))throw Error('유효한 지정 기간을 최대 366일로 입력하세요.');
        await saveDriverSchedule(id,current=>{
          const exceptions={...(current.exceptions || {})};
          if(action!=='keep')for(let day=from;day<=to;day=addDays(day,1)){if(action==='reset')delete exceptions[day];else exceptions[day]={status:action,reason};}
          return {...current,mode,weekdays,exceptions};
        });
        close();onSaved();const conflicts=rowsOn(date).filter(r=>r.driver.id===id&&r.conflict).length;
        toast(conflicts?'스케줄 저장 · 기존 배차를 재확인하세요.':'스케줄을 저장했습니다.',conflicts?'warn':'success');
      }catch(e){toast(e.message,'warn',6000);}finally{button.disabled=false;}
    };}
  });
}
