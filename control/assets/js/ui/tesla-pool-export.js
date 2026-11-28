import {buildTeslaPoolReport} from '../core/tesla-pool-report.js';
import {state} from '../core/data.js';
import {ensureWorkspaceStores,supabaseReviewBasis} from '../core/supabase-cloud.js';
import {workspaceProfile,supabaseMode} from '../core/supabase-session.js';
import {openModal,downloadBlob,todayStr} from '../core/utils.js';

export function openTeslaPoolExport(){
  if(supabaseMode()&&!['admin','safety'].includes(workspaceProfile()?.role))throw Error('장비 안전자료 조회 권한이 필요합니다.');
  openModal({title:'테슬라 고정풀 안전관리 현황',sub:'원본 양식에 있는 차량을 차량번호로 대조합니다.',
    body:'<label class="field"><b>고정풀 안전관리 원본 (.xlsx)</b><input class="input" type="file" accept=".xlsx" data-source></label><p class="small muted">차량·기사·안전점검과 테슬라 계획서를 반영합니다. 차량별 반영 항목과 확인할 내용은 엑셀의 대조내역 시트에서 확인하세요.</p><p role="status" aria-live="polite" data-status>원본 파일을 선택하세요.</p>',
    foot:'<button class="btn btn-primary" data-download disabled>현황 엑셀 다운로드</button>',
    onMount(el){
      const file=el.querySelector('[data-source]'),status=el.querySelector('[data-status]'),button=el.querySelector('[data-download]');
      let ready=null,run=0;
      file.onchange=async()=>{
        const id=++run,source=file.files[0];ready=null;button.disabled=true;
        if(!source){status.textContent='원본 파일을 선택하세요.';return;}
        status.textContent='차량·기사·안전 원장을 확인하고 있습니다…';
        try{
          if(supabaseMode())await ensureWorkspaceStores(['equipment','drivers','safety']);
          const input=new Uint8Array(await source.arrayBuffer());if(id!==run||!el.isConnected)return;
          status.textContent='차량별 안전조치를 대조하고 있습니다…';
          await new Promise(r=>setTimeout(r,20));
          if(id!==run||!el.isConnected)return;
          const basis=supabaseMode()?'Supabase 운영 원장 '+supabaseReviewBasis().revision+'차':'이 기기의 차량·안전 원장';
          const report=buildTeslaPoolReport(input,state,{asOf:todayStr(),source:basis});
          const {rows,matched,unmatched,duplicate,drivers}=report.result;
          ready=report.data;button.disabled=false;
          status.textContent='원본 '+rows+'행 · 차량 일치 '+matched+'행 · 미연결 '+unmatched+'행 · 중복 '+duplicate+'행 · 기사명 반영 '+drivers+'행';
        }catch(error){if(id===run)status.textContent=error.message||'파일을 읽을 수 없습니다. 원본 양식을 확인하세요.';}
      };
      button.onclick=()=>{if(ready)downloadBlob(new Blob([ready],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'테슬라_고정풀_안전관리_현황_'+todayStr()+'.xlsx');};
    }});
}
