import {state} from '../../core/data.js';
import {todayStr,esc,norm} from '../../core/utils.js';
import {referencePeriod,displayedWorkspaceBasis} from '../../core/supabase-cloud.js';
import {supabaseMode,workspaceProfile} from '../../core/supabase-session.js';
import {monthRange} from '../../core/monthly-history-model.js';
import {reportingMonths,efficiencyMonth} from '../../core/load-efficiency.js';
import {renderEfficiencyReport} from '../load-efficiency-report.js';
import {nearbyGroups} from '../../core/route-packing.js';
import {reviewDemand} from '../../core/two-car-demand.js';
import {pageHead} from '../components.js';
import {retryWorkspaceRead} from '../../core/workspace-read-recovery.js';

export default function renderLoadEfficiency(view){
  const now=todayStr();
  const previous=reportingMonths(now.slice(0,7))[1];
  view.innerHTML=pageHead('적재 대수별 운영 효율','수입차 운영 배차와 월별 참고 이력 기준')+
    '<section class="card card-pad"><form class="toolbar"><label>마지막 조회 월 <input required type="month" name="month" value="'+esc(previous)+'"></label> <button class="btn btn-primary">직전 3개월 조회</button></form>'+
    '<p role="status"></p><p data-efficiency-refresh hidden>조회 후 원장이 갱신됐습니다. 최신 비교가 필요하면 다시 조회하세요.</p><div class="toolbar"><label><input type="checkbox" name="roster" checked> 차량번호가 일치하는 명부 정원 포함</label> <label>상품차종 검색 <input type="search" name="model" placeholder="예: Model Y"></label></div><details><summary>인접 지점·초대형 SUV 단독 조건 설정</summary><p>이번 조회에서 검토할 장비 기준으로 입력하세요. 인접 지점은 한 줄에 한 묶음, 단독 차종은 아래 표의 대표 차종명을 한 줄에 하나씩 입력하세요.</p><label>인접 도착지 묶음 <textarea name="nearby" placeholder="지점 A | 지점 B"></textarea></label> <label>2대 장비에 단독 상차만 가능한 초대형 SUV <textarea name="solo" placeholder="표에 표시된 대표 차종명"></textarea></label> <button type="button" class="btn" data-apply>조건 적용</button><p data-condition role="note"></p></details></section><div data-report></div>';
  const form=view.querySelector('form'),status=view.querySelector('[role=status]'),report=view.querySelector('[data-report]');
  const roster=view.querySelector('[name=roster]'),model=view.querySelector('[name=model]');
  let months=[],reviews=[];
  function calculate(){
    const groups=nearbyGroups(view.querySelector('[name=nearby]').value);
    const solo=new Set(view.querySelector('[name=solo]').value.split(/\r?\n/).map(norm).filter(Boolean));
    reviews=months.map(m=>reviewDemand(m.demand.lots,{nearby:groups,solo}));
    const known=new Set(reviews.flatMap(r=>[...r.models.keys()].map(norm)));
    const missing=[...solo].filter(v=>!known.has(v));
    view.querySelector('[data-condition]').textContent='인접 지점 묶음 '+groups.length+'개 · 단독 조건 차종 '+solo.size+'개'+(missing.length?' · 조회 물량과 일치하지 않는 차종 '+missing.join(', '):'');
  }
  view.querySelector('[data-apply]').onclick=()=>{calculate();draw();};
  function draw(){report.innerHTML=months.length?renderEfficiencyReport(months,!roster.checked,model.value,reviews):'';}
  roster.onchange=draw;model.oninput=draw;
  async function load(){
    let reading=true;
    months=[];draw();form.month.disabled=true;form.querySelector('button').disabled=true;
    try{
      const selected=reportingMonths(form.month.value);
      const basis=supabaseMode()?displayedWorkspaceBasis():null;
      const masters={equipment:state.equipment,assignments:state.assignments,drivers:state.drivers};
      const stores=workspaceProfile()?.stores||['dispatch','transportHistory'];
      const includeHistory=stores.includes('transportHistory');
      view.querySelector('[data-efficiency-refresh]').hidden=true;
      const completed=[];
      const versions=[];
      for(const [i,month] of selected.entries()){
        if(!view.isConnected)return;
        const {from,to}=monthRange(month);
        let attempt=0;
        status.textContent=month+' 배차와 참고 이력 대조 중 ('+(i+1)+'/3)';
        let records;
        if(supabaseMode()){
          const period=await retryWorkspaceRead(async number=>{
            attempt=number;
            return referencePeriod(from,to,p=>{
              if(!reading||attempt!==number||!view.isConnected)return;
              status.textContent=month+' 조회 중 ('+(i+1)+'/3) · '+(p.store==='dispatch'?'운영 배차':'참고 이력')+' '+p.loaded.toLocaleString('ko-KR')+'행';
            },includeHistory?['dispatch','transportHistory']:['dispatch']);
          },reason=>{attempt++;status.textContent=month+' · '+reason+' · 해당 월 다시 조회 중';});
          if(!basis||period.baseImportId!==basis.baseImportId)throw Error('조회 중 기준 원장이 교체됐습니다. 메뉴를 다시 열어 조회하세요.');
          versions.push(month+' '+period.revision+'차');
          records=period.records;
        }else{
          const within=r=>r.date>=from&&r.date<=to;
          records={dispatch:(state.dispatch||[]).filter(within),transportHistory:(state.transportHistory||[]).filter(within)};
        }
        if(!view.isConnected)return;
        completed.push(efficiencyMonth({...masters,...records},month));
      }
      months=completed;calculate();draw();status.textContent=selected[0]+' ~ '+selected[2]+' 조회 완료'+(basis?' · 명부 '+basis.revision+'차 · '+versions.join(' / '):'')+(includeHistory?'':' · 권한 범위의 운영 배차 기준');
    }catch(e){status.textContent=e.message||'조회 실패 · 다시 조회하세요.';}
    finally{reading=false;form.month.disabled=false;form.querySelector('button').disabled=false;}
  }
  form.onsubmit=e=>{e.preventDefault();load();};load();
}
