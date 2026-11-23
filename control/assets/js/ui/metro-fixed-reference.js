import {state} from '../core/data.js';
import {referenceSheet} from '../core/dispatch-reference-store.js';
import {referencePeriod} from '../core/supabase-cloud.js';
import {supabaseMode} from '../core/supabase-session.js';
import {monthRange} from '../core/monthly-history-model.js';
import {metroRoster,metroOperation,metroCumulative,rosterMonth,rosterSheets} from '../core/metro-fixed.js';
import {esc,nf,todayStr} from '../core/utils.js';

const table=(head,rows)=>`<div class="dr-table"><table class="data"><thead><tr>${head.map(x=>`<th scope="col">${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(x=>`<td>${esc(x??'—')}</td>`).join('')}</tr>`).join('')||`<tr><td class="dr-empty" colspan="${head.length}">기재된 기록이 없습니다.</td></tr>`}</tbody></table></div>`;
const total=(rows,key)=>rows.reduce((sum,row)=>sum+row[key],0);

export function renderMetroFixed(host,{sheet,book,mode}){
  const month=rosterMonth(sheet.name);
  if(!month){
    host.innerHTML='<div class="dr-empty">고정 운영 현황은 연월이 표시된 순번 시트에서 확인할 수 있습니다.</div>';
    return;
  }
  const roster=metroRoster(sheet,state.drivers);
  if(mode==='operation'){
    const rows=metroOperation(sheet,roster),counts=['강제휴무','개인사정','차량정비'].map(r=>rows.filter(d=>d.reasons.has(r)).length);
    host.innerHTML=`<h3>${esc(month)} 수도권 고정 운영 현황</h3><p>순번표 고정 기사 <strong>${nf(roster.length)}명</strong> · 강제휴무 ${nf(counts[0])}인일 · 개인사정 ${nf(counts[1])}인일 · 차량정비 ${nf(counts[2])}인일</p>
      <p class="small muted">같은 기사·날짜는 한 줄로 표시합니다. 순번표에 없는 휴무 사유와 실제 가용 여부는 <a href="#/schedule">기사 스케줄</a>에서 확인하세요.</p>
      <div class="dr-filters"><label>날짜 <input class="input" id="metro-op-date" type="date" min="${month}-01" max="${monthRange(month).to}"></label>
      <label>기록 <select class="select" id="metro-op-status">${['전체','강제휴무','개인사정','차량정비','휴무 사유 확인','참고 기록'].map(r=>`<option>${r}</option>`).join('')}</select></label>
      <label>기사 <input class="input" id="metro-op-name" type="search" placeholder="기사명"></label></div><div id="metro-op-result"></div>`;
    const date=host.querySelector('#metro-op-date'),status=host.querySelector('#metro-op-status'),name=host.querySelector('#metro-op-name'),result=host.querySelector('#metro-op-result');
    function draw(){
      const found=rows.filter(r=>(!date.value||r.date===date.value)&&(status.value==='전체'||r.status.includes(status.value))&&r.person.name.includes(name.value.trim()));
      result.innerHTML=table(['일자','기사','순번표 기록','명부 연결'],found.map(r=>[r.date,r.person.name,r.status,r.person.match]));
    }
    date.onchange=status.onchange=draw;name.oninput=draw;draw();
    return;
  }
  host.innerHTML=`<h3>${esc(month)}까지 수도권 고정 운송 누계</h3><p>선택한 파일의 같은 해 월별 명단으로 집계합니다. 운영 배차와 중복이 제거된 참고 이력을 표시합니다.</p>
    <div class="dr-filters"><label>조회 범위 <select class="select" id="metro-range"><option value="year">1월부터 선택 월까지</option><option value="month">선택 월만</option></select></label><button class="btn btn-primary" id="metro-run">운송 누계 조회</button></div>
    <p class="small muted" role="status" id="metro-progress"></p><div id="metro-results"></div>`;
  const button=host.querySelector('#metro-run'),scope=host.querySelector('#metro-range'),progress=host.querySelector('#metro-progress'),result=host.querySelector('#metro-results');
  button.onclick=async()=>{
    button.disabled=scope.disabled=true;result.innerHTML='';progress.textContent='월별 명단과 운송 원장을 조회하는 중…';
    try{
      const today=todayStr(),from=scope.value==='month'?monthRange(month).from:month.slice(0,4)+'-01-01',to=[monthRange(month).to,today].sort()[0];
      const periods=rosterSheets(book).filter(s=>rosterMonth(s.name)>=from.slice(0,7)&&rosterMonth(s.name)<=to.slice(0,7));
      if(!periods.length)throw Error('조회 기간의 월별 순번표가 없습니다.');
      const records=supabaseMode()?referencePeriod(from,to,p=>{if(host.isConnected)progress.textContent=`${p.store==='dispatch'?'운영 배차':'참고 이력'} ${nf(p.loaded)}행 조회`;}):Promise.resolve({records:{dispatch:state.dispatch,transportHistory:state.transportHistory}});
      const [period,sheets]=await Promise.all([records,Promise.all(periods.map(s=>s.name===sheet.name?sheet:referenceSheet(book.id,s.name)))]);
      if(!host.isConnected)return;
      const stats=metroCumulative(sheets,period.records,state.drivers,state.assignments);
      const all=stats.months.flatMap(m=>[...m.owners.values()]);
      const pending=stats.months.reduce((count,m)=>count+m.members.filter(p=>!p.driver).length,0);
      progress.textContent=`${from} ~ ${to} · 명단 있는 ${stats.months.length}개월 · 미연결 기사 ${nf(pending)}명(월별 합계)`;
      result.innerHTML=`<p><strong>수도권 도착 ${nf(total(all,'metro'))}대</strong> · 타 권역 ${nf(total(all,'other'))}대 · 도착지 확인 필요 ${nf(total(all,'unknown'))}대</p>
        ${table(['월','고정 명단(명)','수도권 도착(대)','타 권역(대)','도착지 확인 필요(대)','운영 배차(대)','참고 이력(대)'],stats.months.map(m=>{const rows=[...m.owners.values()];return [m.month,m.members.length,...['metro','other','unknown','operating','reference'].map(k=>nf(total(rows,k)))];}))}
        <h4>기사별 운송 누계</h4><label>기사 검색 <input class="input" id="metro-person-query" type="search"></label><div id="metro-person-rows"></div>`;
      const people=new Map();
      for(const member of all){
        if(!people.has(member.ownerKey))people.set(member.ownerKey,{name:member.driver?.name||member.name,metro:0,other:0,unknown:0,operating:0,reference:0,match:member.match});
        const p=people.get(member.ownerKey);
        for(const k of ['metro','other','unknown','operating','reference'])p[k]+=member[k];
      }
      const input=result.querySelector('#metro-person-query');
      const draw=()=>{result.querySelector('#metro-person-rows').innerHTML=table(['기사','수도권 도착(대)','타 권역(대)','도착지 확인 필요(대)','운영 배차(대)','참고 이력(대)','명부'],[...people.values()].filter(p=>p.name.includes(input.value.trim())).sort((a,b)=>b.metro-a.metro||a.name.localeCompare(b.name,'ko')).map(p=>[p.name,...['metro','other','unknown','operating','reference'].map(k=>nf(p[k])),p.match]));};
      input.oninput=draw;draw();
    }catch(e){if(host.isConnected)progress.textContent='누계 조회 실패 · '+e.message;}
    finally{if(host.isConnected)button.disabled=scope.disabled=false;}
  };
}
