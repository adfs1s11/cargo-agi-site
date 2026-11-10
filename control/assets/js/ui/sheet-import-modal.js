import {loadSheetConnection,rememberSheetConnection,recoverSheetConnection,validSheetConnection} from '../core/sheet-connection.js';
import {flushShared} from '../core/cloud.js';
import { state,saveSettings,setWorkdate } from '../core/data.js';
import { esc,nf,todayStr,openModal,toast,exportXlsx } from '../core/utils.js';
import { spreadsheetId,validatePeriod,tabDate,sourceCall,reviewSheetRows,commitSheetRows } from '../core/sheet-import.js';

export function sheetIssueRows(result,batches,sourceId){
  const source=new Map();for(const b of batches)for(const r of b.rows||[])source.set(b.title+'|'+r.rowNumber,{b,r});
  return [...result.held.map(x=>({...x,kind:'보류'})),...result.outside.map(x=>({...x,kind:'날짜 불일치'}))].map(x=>{
    const hit=source.get(x.sheet+'|'+x.row),b=hit?.b||batches.find(b=>b.title===x.sheet),values=hit?.r.values||[],headers=b?.headers||[];
    const cell=name=>{const i=headers.indexOf(name);return i<0?'':String(values[i]??'');};
    const missing=['거래처','출발지','도착지','차대번호'].filter(k=>!cell(k).trim());
    const row=Number(x.row),url=b&&Number.isInteger(row)&&row>0?'https://docs.google.com/spreadsheets/d/'+encodeURIComponent(sourceId)+'/edit#gid='+encodeURIComponent(b.sheetId)+'&range='+encodeURIComponent('A'+row+':V'+row):'';
    return {...x,url,customer:cell('거래처'),dateRaw:cell('출발시간'),vin:cell('차대번호'),model:cell('차종'),countRaw:cell('댓수'),origin:cell('출발지'),destination:cell('도착지'),missing:missing.join(' · ')};
  });
}
export function openSheetIssues(issues){
  let page=0;
  openModal({title:'원본 문제 행 확인',sub:'원본은 자동 수정하지 않습니다. 담당자가 확인·수정한 뒤 일자 확인·미리보기를 다시 실행하세요.',size:'wide',body:'<div class="row" style="gap:10px;flex-wrap:wrap"><label>문제 구분<select class="select" id="issue-kind"><option value="">전체</option><option>보류</option><option>날짜 불일치</option></select></label><label style="flex:1">검색<input class="input" id="issue-search" placeholder="탭·행 번호·거래처·VIN·문제 사유"></label></div><div id="issue-table" style="margin-top:12px"></div>',foot:'<button class="btn btn-primary" data-close>닫기</button>',onMount(el,close){
    el.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close();}});el.querySelector('#issue-search').focus();
    const draw=()=>{const q=el.querySelector('#issue-search').value.trim().toLowerCase(),kind=el.querySelector('#issue-kind').value,rows=issues.filter(r=>(!kind||r.kind===kind)&&(!q||[r.sheet,r.row,r.customer,r.vin,r.reason,r.missing,r.model].join(' ').toLowerCase().includes(q))),pages=Math.max(1,Math.ceil(rows.length/50));page=Math.min(page,pages-1);
      el.querySelector('#issue-table').innerHTML=`<p><b>${nf(rows.length)}행</b> · ${page+1}/${pages}페이지 · 공란은 임의로 채우지 마세요.</p><div class="scroll-x" style="max-height:55vh;overflow:auto"><table class="data"><thead><tr><th>원본 위치</th><th>문제·확인 사항</th><th>거래처·차종</th><th>원문 일자·대수</th><th>VIN·구간</th></tr></thead><tbody>${rows.slice(page*50,page*50+50).map(r=>`<tr><td>${esc(r.sheet)} · ${nf(r.row)}행<br>${r.url?`<a class="btn btn-sm btn-ghost" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">원본 행 열기 ↗</a>`:''}</td><td><b>${esc(r.kind)}</b><p>${esc(r.reason)}</p>${r.missing?`<p class="text-red">공란: ${esc(r.missing)}</p>`:''}</td><td>${esc(r.customer||'미입력')}<br>${esc(r.model||'미입력')}</td><td>${esc(r.dateRaw||'일자 공란')}<br>댓수: ${esc(r.countRaw||'미입력')}</td><td>${esc(r.vin||'VIN 미입력')}<br>${esc(r.origin||'출발지 미입력')} → ${esc(r.destination||'도착지 미입력')}</td></tr>`).join('')||'<tr><td colspan="5">검색 조건에 해당하는 문제가 없습니다.</td></tr>'}</tbody></table></div><div class="row" style="gap:10px;margin-top:12px"><button class="btn btn-ghost" id="issue-prev" ${page===0?'disabled':''}>이전</button><button class="btn btn-ghost" id="issue-next" ${page>=pages-1?'disabled':''}>다음</button></div>`;
      el.querySelector('#issue-prev').onclick=()=>{page--;draw();};el.querySelector('#issue-next').onclick=()=>{page++;draw();};
    };for(const id of ['issue-kind','issue-search'])el.querySelector('#'+id).oninput=()=>{page=0;draw();};draw();
  }});
}

export async function openSheetImport({from=state.workdate||todayStr(),to=from,onImported=()=>{}}={}){
  let preview=null,busy=false,requestVersion=0;
  let saved=await recoverSheetConnection(),editingConnection=false;
  openModal({title:'구글시트에서 배차 불러오기',sub:'선택한 일자의 신규 운송과 기존 건의 빈 배정 정보를 확인합니다. 원본 시트는 변경하지 않습니다.',size:'wide',
    body:`<div class="form-grid"><label class="field full">원본 구글시트 URL<input class="input" id="gi-source" type="url" autocomplete="off" data-lpignore="true" data-1p-ignore placeholder="https://docs.google.com/spreadsheets/d/…/edit" value="${esc(saved.sourceUrl||'')}"></label><label class="field">시작일<input class="input" type="date" id="gi-from" value="${esc(from)}"></label><label class="field">종료일<input class="input" type="date" id="gi-to" value="${esc(to)}"></label></div><p class="small muted">같은 연도에서 최대 31일 · 날짜 탭 기준 · 명시된 다른 날짜는 제외 · 차대번호 1개인 행의 빈 댓수는 1대 적용</p><label class="check" style="margin:12px 0"><input type="checkbox" id="gi-restore">수정 보호된 빈 배정도 원본으로 복원 검토</label><p class="small muted">선택 시 사용자가 해제했거나 수정 이력으로 보호된 빈 배정을 복원 후보로 표시합니다. 원본의 기사·차량·일자·대수를 확인한 뒤 확정하세요. 이미 입력된 기사 교체, 차량 충돌, 확정 편성·정산·마감은 자동 변경하지 않습니다.</p><section class="insight"><b id="gi-connection-status">${validSheetConnection(saved)?'저장된 연결을 사용합니다. 로그인 정보는 입력하지 마세요.':'이 브라우저·계정에 저장된 연결이 없습니다.'}</b><p class="small">${validSheetConnection(saved)?'날짜를 선택하고 일자 확인·미리보기를 누르세요.':'아래 연결 설정을 눌러 웹앱 주소와 READ_TOKEN을 한 번 등록하세요.'}</p><button type="button" class="btn btn-sm btn-ghost" id="gi-edit-connection">${validSheetConnection(saved)?'연결 설정 변경':'연결 설정'}</button><div id="gi-connection-editor" hidden><div class="form-grid" style="margin-top:12px"><label class="field full">읽기 전용 웹앱 주소 (이메일 아님)<textarea class="input" id="gi-url" rows="2" autocomplete="off" autocapitalize="none" spellcheck="false" data-lpignore="true" data-1p-ignore disabled placeholder="https://script.google.com/macros/s/…/exec"></textarea></label><label class="field full">READ_TOKEN 연결키 (로그인 비밀번호 아님)<textarea class="input" id="gi-token" rows="2" autocomplete="off" autocapitalize="none" spellcheck="false" data-lpignore="true" data-1p-ignore style="-webkit-text-security:disc" disabled placeholder="Apps Script에 저장한 READ_TOKEN · 32자 이상"></textarea></label></div><p class="small">계정 비밀번호를 입력하지 마세요. 연결키는 이 PC의 현재 브라우저·계정에만 저장됩니다. 다른 PC나 브라우저에는 자동 공유되지 않습니다.</p><button type="button" class="btn btn-sm btn-ghost" id="gi-cancel-connection">설정 변경 취소</button><button type="button" class="btn btn-sm btn-ghost" id="gi-guide">연결 안내·코드 보기</button></div></section><div class="row" style="gap:8px;margin:16px 0;flex-wrap:wrap"><button class="btn btn-primary" id="gi-preview">일자 확인·미리보기</button><span id="gi-progress" role="status" class="small muted"></span></div><div id="gi-results" aria-live="polite"></div>`,
    foot:'<button class="btn btn-ghost" data-close>닫기</button><button class="btn btn-primary" id="gi-import" disabled>확인한 신규·배정 갱신 반영</button>',
    onMount(el,close){
      const get=id=>el.querySelector('#gi-'+id),invalidate=()=>{preview=null;requestVersion++;get('import').disabled=true;get('results').innerHTML='';get('progress').textContent='조건을 확인한 뒤 미리보기를 다시 실행하세요.';};
      for(const id of ['source','from','to','url','token'])get(id).oninput=invalidate;get('restore').onchange=invalidate;
      const editor=active=>{editingConnection=active;get('connection-editor').hidden=!active;for(const id of ['url','token']){get(id).value='';get(id).disabled=!active;}invalidate();};
      get('edit-connection').onclick=()=>{editor(true);get('url').focus();};
      get('cancel-connection').onclick=()=>editor(false);
      const lock=active=>{busy=active;get('preview').disabled=active;for(const id of ['source','from','to','url','token','restore'])get(id).disabled=active||(['url','token'].includes(id)&&!editingConnection);get('edit-connection').disabled=active;get('cancel-connection').disabled=active;};
      get('guide').onclick=async()=>{
        let code;try{const response=await fetch('apps-script/MainBoardReadOnly.gs',{cache:'no-store'});if(!response.ok)throw Error();code=await response.text();}catch{toast('연결 안내 코드를 불러오지 못했습니다. 새로고침 후 다시 시도하세요.','warn');return;}
        openModal({title:'메인 배차판 읽기 전용 연결',size:'wide',sub:'원본을 공개 공유할 필요가 없습니다. 기존 Code.gs와 별도의 Apps Script 프로젝트를 사용하세요.',body:`<ol style="line-height:1.9;padding-left:20px"><li>Google Apps Script에서 새 프로젝트를 만들고 아래 코드를 붙여넣습니다.</li><li>프로젝트 설정 → 스크립트 속성에 <b>SOURCE_SPREADSHEET_ID</b> (원본 URL의 /d/ 다음 ID)와 <b>READ_TOKEN</b> (32자 이상의 임의 문자열)을 저장합니다.</li><li>원본 열람 권한이 있는 계정으로 웹앱을 배포합니다. 실행 계정은 본인, 액세스는 모든 사용자로 설정합니다. 원본 시트의 공유 설정은 유지되며 토큰 없는 요청은 차단됩니다. 이 연결은 토큰으로 관리자 조회만 허용합니다.</li><li>배포된 /exec URL과 READ_TOKEN을 불러오기 화면에 입력합니다.</li></ol><p class="small">시트 URL·토큰을 원본 셀이나 공개 저장소에 기록하지 마세요. 이 코드는 원본의 내용·수식·공유 설정을 변경하지 않습니다.</p><textarea class="textarea" readonly rows="14" style="font-family:monospace;font-size:12px" aria-label="읽기 전용 연결 코드">${esc(code)}</textarea>`,foot:'<button class="btn btn-primary" data-close>닫기</button>'});
      };
      get('preview').onclick=async()=>{
        if(busy)return;preview=null;get('import').disabled=true;get('results').innerHTML='';
        const version=++requestVersion;
        try{
          const sourceUrl=get('source').value.trim(),sourceId=spreadsheetId(sourceUrl),from=get('from').value,to=get('to').value;validatePeriod(from,to);
          const allowProtectedEmpty=get('restore').checked;
          const config=editingConnection?{url:get('url').value.trim(),token:get('token').value.trim()}:saved;
          if(!validSheetConnection(config))throw Error(editingConnection?'웹앱 주소는 https://script.google.com/macros/s/…/exec 형식, READ_TOKEN은 32자 이상입니다. 로그인 이메일·비밀번호는 사용할 수 없습니다.':'저장된 연결이 없습니다. 연결 설정을 눌러 최초 1회 등록하세요.');lock(true);get('progress').textContent='원본의 일자 탭 확인 중…';
          const meta=await sourceCall(config,'mainMeta',{spreadsheetId:sourceId,year:from.slice(0,4)});
          if(meta.version!=='main-readonly-1'||meta.spreadsheetId!==sourceId)throw Error('읽기 전용 연결 코드 버전과 원본 ID를 확인하세요.');
          const selected=(meta.sheets||[]).filter(s=>{const d=tabDate(s.title,from.slice(0,4));return d&&d>=from&&d<=to;});
          if(!selected.length)throw Error('선택한 기간에 해당하는 일자 탭이 없습니다. 원본 파일과 연도·월을 확인하세요.');
          saved={...loadSheetConnection(),...config,sourceUrl};rememberSheetConnection(saved);
          editingConnection=false;get('connection-editor').hidden=true;get('url').value='';get('token').value='';get('connection-status').textContent='연결 확인 완료 · 저장된 연결을 사용합니다.';get('edit-connection').textContent='연결 설정 변경';
          window.dispatchEvent(new Event('sheet-connection-saved'));
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
          const after=await sourceCall(config,'mainMeta',{spreadsheetId:sourceId,year:from.slice(0,4)});
          if(selected.some(s=>{const now=after.sheets.find(x=>x.sheetId===s.sheetId);return !now||now.lastRow!==s.lastRow||now.columns!==s.columns;}))throw Error('조회 중 원본의 행·열 수가 변경됐습니다. 일자 확인·미리보기를 다시 실행하세요.');
          const result=await reviewSheetRows(batches,{from,to,spreadsheetId:sourceId,existing:state.dispatch,assignments:state.assignments,drivers:state.drivers,allowProtectedEmpty});
          if(version!==requestVersion)return;
          preview={...result,sourceSnapshot:{...result.sourceSnapshot,checkedAt:new Date().toISOString()},from,to,title:meta.title,sourceSpreadsheetId:sourceId,allowProtectedEmpty};
          const issues=sheetIssueRows(result,batches,sourceId);
          const actionable=[...result.rows,...result.updates];
          const dates=[...new Set(actionable.map(r=>r.date))].sort();
          get('import').textContent=actionable.length?'확인한 신규·배정 갱신 반영':'대조 결과 저장';
          get('progress').textContent=`${meta.title} · 조회한 일자 탭 ${selected.length}개`;
          get('results').innerHTML=`${issues.length?`<div class="insight warn" role="alert" style="margin-bottom:14px"><b>확인 필요 ${nf(issues.length)}행 · 이 자료는 아직 반영되지 않았습니다.</b><p>보류 ${nf(result.held.length)}행 / 날짜 불일치 ${nf(result.outside.length)}행. 신규 0건이어도 원본 전체가 반영된 것은 아닙니다.</p><button class="btn btn-primary" id="gi-issues">문제 행 바로 확인 · 원본 열기</button></div>`:''}<div class="insight">동일 기준 대조: 원본 유효 ${nf(result.sourceSnapshot.source.units)}대 (배정 ${nf(result.sourceSnapshot.source.assigned)} · 미배차 ${nf(result.sourceSnapshot.source.pending)}) / 공용 유효 ${nf(result.sourceSnapshot.stored.units)}대 (배정 ${nf(result.sourceSnapshot.stored.assigned)} · 미배차 ${nf(result.sourceSnapshot.stored.pending)})<br>공용 미배차 중 사용자 해제 ${nf(result.sourceSnapshot.stored.manualPending)}대 · 수정 이력 보호 ${nf(result.sourceSnapshot.stored.modifiedPending)}대. 원본과의 차이가 모두 오류를 뜻하지는 않습니다. 수동 해제·수정, 상태 변경과 보류 사유를 확인하세요.<br>원본 대상 ${nf(result.reviewed)}행 → 신규 ${nf(result.rows.length)}건 · 빈 배정 갱신 ${nf(result.updates.length)}건 · 기존 동일 ${nf(result.duplicates.length)}건 · 보류 ${nf(result.held.length)}건 · 기간 밖 ${nf(result.outside.length)}건<br>선택 기간 ${esc(from)} ~ ${esc(to)} · 조회 시점의 복사본입니다.<br>일자 탭 날짜 적용 ${nf(result.inferredDates)}건 · 단일 차대번호 기준 1대 적용 ${nf(result.inferredCounts)}건 (원본 값 보존)<br>청구·하불은 원본 값으로 보관하며 정산 확정금액으로 자동 적용하지 않습니다.</div><p class="small">${dates.map(date=>`${esc(date)}: ${nf(actionable.filter(r=>r.date===date).length)}건`).join(' · ')||'반영할 신규·배정 갱신이 없습니다.'}</p><div class="scroll-x"><table class="data"><thead><tr><th>운송일 / 원본</th><th>거래처 / 구간</th><th>차대번호 / 기사</th><th>대수</th></tr></thead><tbody>${actionable.slice(0,50).map(r=>`<tr><td>${esc(r.date)}<div class="tiny muted">${esc(r.tab)} ${r.rowNumber}행</div></td><td>${esc(r.customer)}<div class="small muted">${esc(r.origin)} → ${esc(r.destination)}</div></td><td>${esc(r.vin)}<div class="small muted">${esc(r.driver||'미배차')}${r.vin.length!==17?' · 축약 번호 원문':''}</div></td><td>${nf(r.count)}</td></tr>`).join('')}</tbody></table></div><p class="small muted">신규·배정 갱신 상위 50건 표시 · 동일 일자·VIN·구간이 유일하고 기존 기사·차량 정보가 비어 있는 경우만 보완합니다. 기존 배정 변경·수동 취소·확정 정산은 보류합니다. 기사는 자동 등록하지 않습니다.</p><button class="btn btn-sm btn-ghost" id="gi-candidates">신규·갱신·복원 전체 후보 내려받기</button>${result.held.length?`<details><summary>보류 사유 ${nf(result.held.length)}건</summary>${result.held.slice(0,100).map(r=>`<p class="small">${esc(r.sheet)} ${r.row}행: ${esc(r.reason)}</p>`).join('')}${result.held.length>100?'<p>상위 100건 표시</p>':''}</details>`:''}${result.held.length||result.outside.length?'<button class="btn btn-sm btn-ghost" id="gi-exclusions">보류·기간 밖 전체 내역 내려받기</button>':''}<label class="check" style="margin:14px 0"><input type="checkbox" id="gi-confirm">일자·신규·배정 갱신 및 복원 후보·보류 사유를 확인했습니다.</label>`;
          if(get('issues'))get('issues').onclick=()=>openSheetIssues(issues);
          get('candidates').onclick=()=>exportXlsx({'반영 후보':[['운송일','원본 탭','행','VIN','출발지','도착지','기사','차량번호','대수','복원검토옵션'],...actionable.map(r=>[r.date,r.tab,r.rowNumber,r.vin,r.origin,r.destination,r.driver,r.vehicleNo,r.count,preview.allowProtectedEmpty?'선택':'미선택'])]},`배차반영후보_${from}_${to}.xlsx`);
          if(get('exclusions'))get('exclusions').onclick=()=>exportXlsx({'보류·기간밖':[['구분','원본 탭','원본 행','확인 운송일','사유'],...result.held.map(r=>['보류',r.sheet,r.row,r.date||'',r.reason]),...result.outside.map(r=>['기간 밖',r.sheet,r.row,r.date,r.reason||'선택 기간 밖'])]},`배차불러오기_제외내역_${from}_${to}.xlsx`);
          get('confirm').onchange=()=>{get('import').disabled=!get('confirm').checked;};
        }catch(e){get('progress').textContent='';get('results').innerHTML=`<p class="insight warn">${esc(e.message)}</p>`;}finally{lock(false);}
      };
      get('import').onclick=async()=>{
        if(busy||!preview||!get('confirm')?.checked)return;lock(true);get('import').disabled=true;
        try{
          const result=await commitSheetRows([...preview.rows,...preview.updates],preview);if(result.inserted||result.updated)await setWorkdate(preview.to);
          await flushShared();
          close();toast(`구글시트 신규 ${nf(result.inserted)}건 불러옴 · 빈 배정 ${nf(result.updated)}건 갱신 · 중복 ${nf(result.duplicates)}건 · 변경 충돌 ${nf(result.conflicts)}건 제외`,'success',6000);onImported();
        }catch(e){toast(e.message,'warn',6000);get('import').disabled=false;}finally{lock(false);}
      };
    }
  });
}
