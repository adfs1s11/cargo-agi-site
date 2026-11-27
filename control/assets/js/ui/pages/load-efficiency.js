import {state} from '../../core/data.js';
import {todayStr,esc} from '../../core/utils.js';
import {referencePeriod,displayedWorkspaceBasis} from '../../core/supabase-cloud.js';
import {supabaseMode,workspaceProfile} from '../../core/supabase-session.js';
import {monthRange} from '../../core/monthly-history-model.js';
import {reportingMonths,efficiencyMonth} from '../../core/load-efficiency.js';
import {renderEfficiencyReport} from '../load-efficiency-report.js';
import {pageHead} from '../components.js';

export default function renderLoadEfficiency(view){
  const now=todayStr();
  const previous=reportingMonths(now.slice(0,7))[1];
  view.innerHTML=pageHead('적재 대수별 운영 효율','수입차 운영 배차와 월별 참고 이력 기준')+
    '<section class="card card-pad"><form class="toolbar"><label>마지막 조회 월 <input required type="month" name="month" value="'+esc(previous)+'"></label> <button class="btn btn-primary">직전 3개월 조회</button></form>'+
    '<p role="status"></p><p data-efficiency-refresh hidden>조회 후 원장이 갱신됐습니다. 최신 비교가 필요하면 다시 조회하세요.</p><div class="toolbar"><label><input type="checkbox" name="roster" checked> 차량번호가 일치하는 명부 정원 포함</label> <label>상품차종 검색 <input type="search" name="model" placeholder="예: Model Y"></label></div></section><div data-report></div>';
  const form=view.querySelector('form'),status=view.querySelector('[role=status]'),report=view.querySelector('[data-report]');
  const roster=view.querySelector('[name=roster]'),model=view.querySelector('[name=model]');
  let months=[];
  function draw(){report.innerHTML=months.length?renderEfficiencyReport(months,!roster.checked,model.value):'';}
  roster.onchange=draw;model.oninput=draw;
  async function load(){
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
        const progress=p=>{status.textContent=month+' 조회 중 ('+(i+1)+'/3) · '+(p.store==='dispatch'?'운영 배차':'참고 이력')+' '+p.loaded.toLocaleString('ko-KR')+'행';};
        status.textContent=month+' 배차와 참고 이력 대조 중 ('+(i+1)+'/3)';
        let records;
        if(supabaseMode()){
          const period=await referencePeriod(from,to,progress,includeHistory?['dispatch','transportHistory']:['dispatch']);
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
      months=completed;draw();status.textContent=selected[0]+' ~ '+selected[2]+' 조회 완료'+(basis?' · 명부 '+basis.revision+'차 · '+versions.join(' / '):'')+(includeHistory?'':' · 권한 범위의 운영 배차 기준');
    }catch(e){status.textContent=e.message||'조회 실패 · 다시 조회하세요.';}
    finally{form.month.disabled=false;form.querySelector('button').disabled=false;}
  }
  form.onsubmit=e=>{e.preventDefault();load();};load();
}
