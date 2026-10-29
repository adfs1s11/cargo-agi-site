import { state,saveSettings,setWorkdate } from '../core/data.js';
import { esc,nf,todayStr,openModal,toast,exportXlsx } from '../core/utils.js';
import { spreadsheetId,validatePeriod,tabDate,sourceCall,reviewSheetRows,commitSheetRows } from '../core/sheet-import.js';

export function openSheetImport({from=state.workdate||todayStr(),to=from,onImported=()=>{}}={}){
  let preview=null,busy=false,requestVersion=0;
  const saved=state.settings.google?.mainBoard||{};
  openModal({title:'구글시트에서 배차 불러오기',sub:'선택한 일자의 신규 운송과 기존 건의 빈 배정 정보를 확인합니다. 원본 시트는 변경하지 않습니다.',size:'wide',
    body:`<div class="form-grid"><label class="field full">원본 구글시트 URL<input class="input" id="gi-source" placeholder="https://docs.google.com/spreadsheets/d/…/edit" value="${esc(saved.sourceUrl||'')}"></label><label class="field">시작일<input class="input" type="date" id="gi-from" value="${esc(from)}"></label><label class="field">종료일<input class="input" type="date" id="gi-to" value="${esc(to)}"></label></div><p class="small muted">같은 연도에서 최대 31일 · 날짜 탭 기준 · 명시된 다른 날짜는 제외 · 차대번호 1개인 행의 빈 댓수는 1대 적용</p><details ${saved.url?'':'open'}><summary>비공개 원본 연결 설정 (최초 1회)</summary><div class="form-grid" style="margin-top:12px"><label class="field full">읽기 전용 웹앱 URL<input class="input" id="gi-url" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(saved.url||'')}"></label><label class="field full">연결 토큰<input class="input" type="password" id="gi-token" autocomplete="off" value="${esc(saved.token||'')}"></label></div><p class="small">관리자 조회용 읽기 전용 연결입니다. 직원별 권한 기능을 대신하지 않습니다. 토큰은 이 브라우저에 저장되므로 관리자가 사용하는 환경에서 설정하세요.</p><button class="btn btn-sm btn-ghost" id="gi-guide">연결 안내·코드 보기</button></details><div class="row" style="gap:8px;margin:16px 0;flex-wrap:wrap"><button class="btn btn-primary" id="gi-preview">일자 확인·미리보기</button><span id="gi-progress" role="status" class="small muted"></span></div><div id="gi-results" aria-live="polite"></div>`,
    foot:'<button class="btn btn-ghost" data-close>닫기</button><button class="btn btn-primary" id="gi-import" disabled>확인한 신규·배정 갱신 반영</button>',
    onMount(el,close){
      const get=id=>el.querySelector('#gi-'+id),invalidate=()=>{preview=null;requestVersion++;get('import').disabled=true;get('results').innerHTML='';get('progress').textContent='조건을 확인한 뒤 미리보기를 다시 실행하세요.';};
      for(const id of ['source','from','to','url','token'])get(id).oninput=invalidate;
      const lock=active=>{busy=active;get('preview').disabled=active;for(const id of ['source','from','to','url','token'])get(id).disabled=active;};
      get('guide').onclick=async()=>{
        let code;try{const response=await fetch('apps-script/MainBoardReadOnly.gs',{cache:'no-store'});if(!response.ok)throw Error();code=await response.text();}catch{toast('연결 안내 코드를 불러오지 못했습니다. 새로고침 후 다시 시도하세요.','warn');return;}
        openModal({title:'메인 배차판 읽기 전용 연결',size:'wide',sub:'원본을 공개 공유할 필요가 없습니다. 기존 Code.gs와 별도의 Apps Script 프로젝트를 사용하세요.',body:`<ol style="line-height:1.9;padding-left:20px"><li>Google Apps Script에서 새 프로젝트를 만들고 아래 코드를 붙여넣습니다.</li><li>프로젝트 설정 → 스크립트 속성에 <b>SOURCE_SPREADSHEET_ID</b> (원본 URL의 /d/ 다음 ID)와 <b>READ_TOKEN</b> (32자 이상의 임의 문자열)을 저장합니다.</li><li>원본 열람 권한이 있는 계정으로 웹앱을 배포합니다. 실행 계정은 본인, 액세스는 모든 사용자로 설정합니다. 원본 시트의 공유 설정은 유지되며 토큰 없는 요청은 차단됩니다. 이 연결은 토큰으로 관리자 조회만 허용합니다.</li><li>배포된 /exec URL과 READ_TOKEN을 불러오기 화면에 입력합니다.</li></ol><p class="small">시트 URL·토큰을 원본 셀이나 공개 저장소에 기록하지 마세요. 이 코드는 원본의 내용·수식·공유 설정을 변경하지 않습니다.</p><textarea class="textarea" readonly rows="14" style="font-family:monospace;font-size:12px" aria-label="읽기 전용 연결 코드">${esc(code)}</textarea>`,foot:'<button class="btn btn-primary" data-close>닫기</button>'});
      };
      get('preview').onclick=async()=>{
        if(busy)return;preview=null;get('import').disabled=true;get('results').innerHTML='';
        const version=++requestVersion;
        try{
          const sourceUrl=get('source').value.trim(),sourceId=spreadsheetId(sourceUrl),from=get('from').value,to=get('to').value;validatePeriod(from,to);
          const config={url:get('url').value.trim(),token:get('token').value.trim()};lock(true);get('progress').textContent='원본의 일자 탭 확인 중…';
          const meta=await sourceCall(config,'mainMeta',{spreadsheetId:sourceId,year:from.slice(0,4)});
          if(meta.version!=='main-readonly-1'||meta.spreadsheetId!==sourceId)throw Error('읽기 전용 연결 코드 버전과 원본 ID를 확인하세요.');
          const selected=(meta.sheets||[]).filter(s=>{const d=tabDate(s.title,from.slice(0,4));return d&&d>=from&&d<=to;});
          if(!selected.length)throw Error('선택한 기간에 해당하는 일자 탭이 없습니다. 원본 파일과 연도·월을 확인하세요.');
          await saveSettings({google:{mainBoard:{sourceUrl,...config}}});
          const batches=[];
          for(let i=0;i<selected.length;i++){
            const sheet=selected[i];let startRow=2,pageCount=0;
            do{
              get('progress').textContent=`${i+1}/${selected.length} · ${sheet.title} 탭 ${startRow}행부터 조회 중…`;
              const data=await sourceCall(config,'mainRows',{spreadsheetId:sourceId,sheetId:sheet.sheetId,year:from.slice(0,4),from,to,startRow,limit:500});
              if(data.sheetId!==sheet.sheetId||data.title!==sheet.title||!Array.isArray(data.headers)||!Array.isArray(data.rows))throw Error('원본 조회 형식이 일치하지 않습니다.');
              if(data.nextRow!==null&&(!Number.isInteger(data.nextRow)||data.nextRow<=startRow))throw Error('원본 페이지 순서가 올바르지 않습니다.');
              batches.push(data);startRow=data.nextRow;if(++pageCount>200)throw Error('한 번에 조회할 행이 너무 많습니다.');
            }while(startRow!==null);
          }
          const result=await reviewSheetRows(batches,{from,to,spreadsheetId:sourceId,existing:state.dispatch});
          if(version!==requestVersion)return;
          preview={...result,from,to,title:meta.title};
          const actionable=[...result.rows,...result.updates];
          const dates=[...new Set(actionable.map(r=>r.date))].sort();
          get('progress').textContent=`${meta.title} · 조회한 일자 탭 ${selected.length}개`;
          get('results').innerHTML=`<div class="insight">원본 대상 ${nf(result.reviewed)}행 → 신규 ${nf(result.rows.length)}건 · 빈 배정 갱신 ${nf(result.updates.length)}건 · 기존 동일 ${nf(result.duplicates.length)}건 · 보류 ${nf(result.held.length)}건 · 기간 밖 ${nf(result.outside.length)}건<br>선택 기간 ${esc(from)} ~ ${esc(to)} · 조회 시점의 복사본입니다.<br>일자 탭 날짜 적용 ${nf(result.inferredDates)}건 · 단일 차대번호 기준 1대 적용 ${nf(result.inferredCounts)}건 (원본 값 보존)<br>청구·하불은 원본 값으로 보관하며 정산 확정금액으로 자동 적용하지 않습니다.</div><p class="small">${dates.map(date=>`${esc(date)}: ${nf(actionable.filter(r=>r.date===date).length)}건`).join(' · ')||'반영할 신규·배정 갱신이 없습니다.'}</p><div class="scroll-x"><table class="data"><thead><tr><th>운송일 / 원본</th><th>거래처 / 구간</th><th>차대번호 / 기사</th><th>대수</th></tr></thead><tbody>${actionable.slice(0,50).map(r=>`<tr><td>${esc(r.date)}<div class="tiny muted">${esc(r.tab)} ${r.rowNumber}행</div></td><td>${esc(r.customer)}<div class="small muted">${esc(r.origin)} → ${esc(r.destination)}</div></td><td>${esc(r.vin)}<div class="small muted">${esc(r.driver||'미배차')}${r.vin.length!==17?' · 축약 번호 원문':''}</div></td><td>${nf(r.count)}</td></tr>`).join('')}</tbody></table></div><p class="small muted">신규·배정 갱신 상위 50건 표시 · 동일 일자·VIN·구간이 유일하고 기존 기사·차량 정보가 비어 있는 경우만 보완합니다. 기존 배정 변경·수동 취소·확정 정산은 보류합니다. 기사는 자동 등록하지 않습니다.</p>${result.held.length?`<details><summary>보류 사유 ${nf(result.held.length)}건</summary>${result.held.slice(0,100).map(r=>`<p class="small">${esc(r.sheet)} ${r.row}행: ${esc(r.reason)}</p>`).join('')}${result.held.length>100?'<p>상위 100건 표시</p>':''}</details>`:''}${result.held.length||result.outside.length?'<button class="btn btn-sm btn-ghost" id="gi-exclusions">보류·기간 밖 전체 내역 내려받기</button>':''}<label class="check" style="margin:14px 0"><input type="checkbox" id="gi-confirm">일자·신규 및 배정 갱신·보류 사유를 확인했습니다.</label>`;
          if(get('exclusions'))get('exclusions').onclick=()=>exportXlsx({'보류·기간밖':[['구분','원본 탭','원본 행','확인 운송일','사유'],...result.held.map(r=>['보류',r.sheet,r.row,r.date||'',r.reason]),...result.outside.map(r=>['기간 밖',r.sheet,r.row,r.date,r.reason||'선택 기간 밖'])]},`배차불러오기_제외내역_${from}_${to}.xlsx`);
          get('confirm').onchange=()=>{get('import').disabled=!get('confirm').checked||!(preview?.rows.length||preview?.updates.length);};
        }catch(e){get('progress').textContent='';get('results').innerHTML=`<p class="insight warn">${esc(e.message)}</p>`;}finally{lock(false);}
      };
      get('import').onclick=async()=>{
        if(busy||!preview||!get('confirm')?.checked)return;lock(true);get('import').disabled=true;
        try{
          const result=await commitSheetRows([...preview.rows,...preview.updates],preview);if(result.inserted||result.updated)await setWorkdate(preview.to);
          close();toast(`구글시트 신규 ${nf(result.inserted)}건 불러옴 · 빈 배정 ${nf(result.updated)}건 갱신 · 중복 ${nf(result.duplicates)}건 · 변경 충돌 ${nf(result.conflicts)}건 제외`,'success',6000);onImported();
        }catch(e){toast(e.message,'warn',6000);get('import').disabled=false;}finally{lock(false);}
      };
    }
  });
}
