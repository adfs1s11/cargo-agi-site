import * as db from '../core/db.js';
import {state,reloadStores} from '../core/data.js';
import {esc,openModal,todayStr} from '../core/utils.js';
import {validDate} from '../core/schedule.js';
import {supabaseMode,workspaceProfile} from '../core/supabase-session.js';
import {confirmSupabaseSaved} from '../core/supabase-cloud.js';

export const canCheckUsage=()=>!supabaseMode()||workspaceProfile()?.role==='admin';
export function usageSummary(r) {
  return `사용 ${r.usage.used}일 · 미사용 ${r.usage.unused}일 · ${r.usage.checked?'확인한 날짜 기준':'미확인 · 다른 지표로 100점 환산'}`;
}

export async function saveUsageDate(day,edits) {
  if(!canCheckUsage())throw Error('관리자만 사용 여부를 입력할 수 있습니다.');
  if(!validDate(day)||day>todayStr())throw Error('오늘 또는 이전 날짜를 선택하세요.');
  if(!edits.length)return;
  const database=await db.openDb();
  await new Promise((resolve,reject)=>{
    const tx=database.transaction('drivers','readwrite'),drivers=tx.objectStore('drivers');
    let reason;
    tx.oncomplete=resolve;
    tx.onabort=()=>reject(reason||tx.error||Error('저장되지 않았습니다.'));
    for(const edit of edits) {
      const req=drivers.get(edit.id);
      req.onsuccess=()=>{
        const driver=req.result;
        if(!driver||!['','used','unused'].includes(edit.value)||(driver.systemUseDays?.[day]||'')!==edit.before) {
          reason=Error('기사 또는 해당 날짜의 기록이 변경됐습니다. 날짜별 기록을 다시 확인하세요.');tx.abort();return;
        }
        const days={...driver.systemUseDays};
        if(edit.value)days[day]=edit.value;else delete days[day];
        drivers.put({...driver,systemUseDays:days});
      };
    }
  });
  await reloadStores(['drivers']);
}

export function openUsageEditor(onSaved,{driverId='',day=todayStr()}={}) {
  if(!canCheckUsage())return;
  openModal({title:'시스템 활용 확인',size:'wide',body:`<div class="form-grid"><label>확인일<input class="input" id="use-day" type="date" value="${esc(day)}" max="${todayStr()}"></label><label>기사 검색<input class="input" id="use-search" placeholder="이름 또는 차량번호"></label></div><p class="small muted">모바일 TMS 등 업무 시스템 사용을 확인한 날짜만 평가합니다. 미확인은 계산에서 제외합니다.</p><div style="max-height:42vh;overflow:auto"><table class="table"><thead><tr><th>기사</th><th>차량</th><th>사용 여부</th></tr></thead><tbody id="use-rows"></tbody></table></div><p role="status" id="use-status"></p>`,
    foot:'<button class="btn btn-ghost" data-close>닫기</button><button class="btn btn-primary" id="use-save">확인값 저장</button>',onMount(el,close){
      const field=el.querySelector('#use-day'),search=el.querySelector('#use-search'),body=el.querySelector('#use-rows'),status=el.querySelector('#use-status'),save=el.querySelector('#use-save');
      let date=field.value,applied=false;
      function draw(){
        body.innerHTML=state.drivers.filter(d=>!driverId||d.id===driverId).sort((a,b)=>a.name.localeCompare(b.name,'ko')).map(d=>{
          const value=d.systemUseDays?.[date]||'';
          return `<tr><td>${esc(d.name)}</td><td>${esc(d.vehicleNo||'—')}</td><td><select aria-label="${esc(d.name)} 사용 여부" data-driver="${esc(d.id)}" data-before="${esc(value)}"><option value="">미확인</option><option value="used" ${value==='used'?'selected':''}>사용</option><option value="unused" ${value==='unused'?'selected':''}>미사용</option></select></td></tr>`;
        }).join('');
        filter();
      }
      function filter(){const q=search.value.trim().toLowerCase();for(const row of body.rows)row.hidden=![row.cells[0],row.cells[1]].some(c=>c.textContent.toLowerCase().includes(q));}
      function edits(){return [...body.querySelectorAll('select')].filter(s=>s.value!==s.dataset.before).map(s=>({id:s.dataset.driver,before:s.dataset.before,value:s.value}));}
      field.onchange=()=>{if(!validDate(field.value)||field.value>todayStr()||edits().length){field.value=date;status.textContent='현재 날짜의 입력을 저장한 후 오늘 또는 이전 날짜를 선택하세요.';return;}date=field.value;status.textContent='';draw();};
      search.oninput=filter;draw();
      save.onclick=async()=>{
        save.disabled=true;
        try{
          if(!applied){const changes=edits();if(!changes.length){status.textContent='변경한 확인값이 없습니다.';return;}await saveUsageDate(date,changes);applied=true;field.disabled=true;for(const s of body.querySelectorAll('select'))s.disabled=true;}
          if(supabaseMode())await confirmSupabaseSaved();
          close();onSaved();
        }catch(e){status.textContent=e.message;if(applied)save.textContent='서버 저장 다시 확인';}
        finally{save.disabled=false;}
      };
    }});
}
