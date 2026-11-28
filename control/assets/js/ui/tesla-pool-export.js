import {buildTeslaPoolReport,poolRegistrationRows,completedPoolWorkbook} from '../core/tesla-pool-report.js';
import {state} from '../core/data.js';
import {ensureWorkspaceStores,supabaseReviewBasis} from '../core/supabase-cloud.js';
import {workspaceProfile,supabaseMode} from '../core/supabase-session.js';
import {openModal,downloadBlob,todayStr,esc} from '../core/utils.js';

const tabs=['전체','등록 완료','보완 필요','확인 필요'];
const badge={'등록 완료':'green','보완 필요':'red','확인 필요':'amber'};
function displayRegistry(el,rows,asOf,basis){
  const region=el.querySelector('[data-registry]'),search=el.querySelector('[data-search]'),button=el.querySelector('[data-completed]');
  let active='전체',visible=[];
  const tabsEl=el.querySelector('[data-tabs]');
  const counts=Object.fromEntries(tabs.map(t=>[t,t==='전체'?rows.length:rows.filter(r=>r.status===t).length]));
  const render=()=>{
    const q=search.value.replace(/\s/g,'').toLowerCase();
    visible=rows.filter(r=>(active==='전체'||active===r.status)&&(r.plate+' '+r.driver).replace(/\s/g,'').toLowerCase().includes(q));
    for(const tab of tabsEl.querySelectorAll('button')){
      const selected=tab.dataset.tab===active;
      tab.setAttribute('aria-pressed',String(selected));tab.className='btn '+(selected?'btn-primary':'btn-ghost');
    }
    const done=visible.filter(r=>r.status==='등록 완료').length;
    button.disabled=!done;button.textContent='완료 차량 엑셀 다운로드 ('+done+'대)';
    region.querySelector('[data-range]').textContent=done?'A2:U'+(done+1):'제목 아래의 데이터 행';
    region.querySelector('[data-count]').textContent=basis+' · 조회 '+visible.length+'대';
    region.querySelector('tbody').innerHTML=visible.map(r=>{
      const v=r.safety;
      return '<tr><td><b>'+esc(r.plate||'번호 미등록')+'</b><div>'+esc(r.driver||'기사 확인 필요')+'</div></td><td><span class="badge '+badge[r.status]+'">'+r.status+'</span><div class="small">'+esc(r.issues.join(' · '))+'</div></td><td>'+esc(v.deckLift||'—')+'<div class="small">낙하방지 · '+esc(v.deckFall||'—')+'</div></td><td>'+esc([v.fallProtect,v.fallProtectionNote].filter(Boolean).join(' / ')||'—')+'</td><td>'+esc(v.specialInspection||'—')+'<div>'+esc(v.specialInspectionResult||'—')+'</div></td><td>'+esc(r.plan)+'</td></tr>';
    }).join('')||'<tr><td colspan="6">해당 조건의 차량이 없습니다.</td></tr>';
  };
  tabsEl.innerHTML=tabs.map(t=>'<button type="button" data-tab="'+t+'">'+t+' '+counts[t]+'대</button>').join(' ');
  tabsEl.onclick=event=>{const tab=event.target.closest('[data-tab]');if(tab){active=tab.dataset.tab;render();}};
  search.oninput=render;button.onclick=()=>{try{saveExcel(completedPoolWorkbook(visible,{asOf}),'안전조치_등록완료_차량_'+asOf);}catch(e){region.querySelector('[data-count]').textContent=e.message;}};
  region.hidden=false;render();
}
function saveExcel(data,name){downloadBlob(new Blob([data],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),name+'.xlsx');}

export function openTeslaPoolExport(){
  if(supabaseMode()&&!['admin','safety'].includes(workspaceProfile()?.role))throw Error('장비 안전자료 조회 권한이 필요합니다.');
  openModal({title:'등록 차량 안전관리 현황',size:'wide',sub:'전체 등록 장비 기준 · 차량번호 및 승무 기사로 조회',
    body:`<p role="status" data-loading>등록 차량과 안전정보를 불러오는 중입니다…</p>
    <section data-registry hidden>
      <div class="toolbar" role="group" aria-label="안전정보 등록 상태" data-tabs></div>
      <p class="small">차량과 기사가 식별되고 2층 인양·낙하방지, 추락방지 시설, 점검일과 양호 결과가 기록되면 등록 완료입니다. 미조치·예정 사항은 보완 대상으로 표시합니다.</p>
      <div class="toolbar"><input class="input" type="search" placeholder="차량번호·기사 검색" aria-label="차량번호·기사 검색" data-search><button class="btn btn-primary" data-completed disabled>완료 차량 엑셀 다운로드</button></div>
      <p class="small muted">엑셀에서 <b data-range></b>을 복사해 빈 기본 양식의 B5에 값으로 붙여넣으세요. 차량번호가 이미 있는 양식은 아래 ‘기존 양식에 차량번호로 반영’을 이용하세요.</p>
      <p class="small" role="status" data-count></p>
      <div class="table-scroll" style="max-height:48vh;overflow:auto"><table class="data"><thead style="position:sticky;top:0;background:white"><tr><th>차량 / 기사</th><th>상태 / 확인 항목</th><th>2층 인양 / 낙하방지</th><th>추락방지 시설</th><th>장비 점검</th><th>테슬라 계획서</th></tr></thead><tbody></tbody></table></div>
    </section>
    <details style="margin-top:15px"><summary>기존 양식에 차량번호로 반영</summary><label class="field"><b>고정풀 안전관리 원본 (.xlsx)</b><input class="input" type="file" accept=".xlsx" data-source></label><p role="status" aria-live="polite" data-status>원본 파일을 선택하세요.</p><button class="btn btn-ghost" data-download disabled>원본 양식 엑셀 다운로드</button> <button class="btn btn-ghost" data-pool-only disabled>원본 명단 중 완료 차량 엑셀</button></details>`,
    onMount(el){
      const file=el.querySelector('[data-source]'),status=el.querySelector('[data-status]'),button=el.querySelector('[data-download]');
      const poolOnly=el.querySelector('[data-pool-only]');
      let ready=null,matchedDone=[],run=0;
      const basis=()=>supabaseMode()?'Supabase 운영 원장 '+supabaseReviewBasis().revision+'차':'이 기기의 차량·안전 원장';
      const loading=el.querySelector('[data-loading]');
      async function load(){
        loading.textContent='등록 차량과 안전정보를 불러오는 중입니다…';
        try{
          if(supabaseMode())await ensureWorkspaceStores(['equipment','drivers','safety']);
          if(!el.isConnected)return;
          const asOf=todayStr();displayRegistry(el,poolRegistrationRows(state,asOf),asOf,basis());loading.hidden=true;
        }catch(error){
          loading.textContent=error.message+' ';const retry=document.createElement('button');retry.className='btn btn-ghost';retry.textContent='다시 조회';retry.onclick=load;loading.append(retry);
        }
      }
      load();
      file.onchange=async()=>{
        const id=++run,source=file.files[0];ready=null;matchedDone=[];button.disabled=true;poolOnly.disabled=true;poolOnly.textContent='원본 명단 중 완료 차량 엑셀';
        if(!source){status.textContent='원본 파일을 선택하세요.';return;}
        status.textContent='차량·기사·안전 원장을 확인하고 있습니다…';
        try{
          if(supabaseMode())await ensureWorkspaceStores(['equipment','drivers','safety']);
          const input=new Uint8Array(await source.arrayBuffer());if(id!==run||!el.isConnected)return;
          status.textContent='차량별 안전조치를 대조하고 있습니다…';
          await new Promise(r=>setTimeout(r,20));
          if(id!==run||!el.isConnected)return;
          const asOf=todayStr(),report=buildTeslaPoolReport(input,state,{asOf,source:basis(),registrationRows:poolRegistrationRows(state,asOf)});
          const {rows,matched,unmatched,duplicate,drivers}=report.result;
          ready=report.data;button.disabled=false;
          matchedDone=report.completed;poolOnly.disabled=!matchedDone.length;poolOnly.textContent='원본 명단 중 완료 차량 엑셀 ('+matchedDone.length+'대)';
          status.textContent='원본 '+rows+'행 · 차량 일치 '+matched+'행 · 미연결 '+unmatched+'행 · 중복 '+duplicate+'행 · 기사명 반영 '+drivers+'행';
        }catch(error){if(id===run)status.textContent=error.message||'파일을 읽을 수 없습니다. 원본 양식을 확인하세요.';}
      };
      button.onclick=()=>{if(ready)saveExcel(ready,'테슬라_고정풀_안전관리_현황_'+todayStr());};
      poolOnly.onclick=()=>{if(matchedDone.length)saveExcel(completedPoolWorkbook(matchedDone,{asOf:todayStr()}),'테슬라_고정풀_등록완료_차량_'+todayStr());};
    }});
}
