import {state} from '../core/data.js';
import {loadSheetConnection,rememberSheetConnection,recoverSheetConnection} from '../core/sheet-connection.js';
import {spreadsheetId,tabDate,sourceCall,reviewSheetRows,commitSheetRows} from '../core/sheet-import.js';
import {flushShared} from '../core/cloud.js';
import {supabaseReviewBasis} from '../core/supabase-cloud.js';
import {workspaceProfile,supabaseMode} from '../core/supabase-session.js';
import {openSheetImport,sheetIssueRows,openSheetIssues} from './sheet-import-modal.js';
import {esc,todayStr} from '../core/utils.js';
let running=false,issues=[],message='아직 불러오지 않았습니다.',timer,lastAttempt=Date.now();
const interval=30*60*1000;
const allowed=()=>!supabaseMode()||workspaceProfile()?.role==='admin';
function paint(){for(const panel of document.querySelectorAll('[data-sheet-sync]')){
 panel.querySelector('[data-status]').textContent=message;
 panel.querySelector('[data-run]').disabled=running;
 panel.querySelector('[data-errors]').innerHTML=issues.length?`<div class="insight warn" role="alert"><b>최근 조회에서 반영하지 못한 ${issues.length}행</b>${issues.slice(0,10).map(r=>`<p>${esc(r.sheet)} · ${esc(r.row)}행: ${esc(r.reason)} ${r.url?`<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">원본 행 수정 ↗</a>`:''}</p>`).join('')}<p>전체 내역은 ‘문제 행 확인’에서 확인하세요.</p></div>`:'';
 const b=panel.querySelector('[data-issues]');b.textContent=`문제 행 확인 (${issues.length})`;b.disabled=!issues.length;
}}
async function execute(date){
 if(running||!allowed())return;running=true;lastAttempt=Date.now();message=`${date} 원본 조회 중…`;paint();
 try{
 const config=await recoverSheetConnection(),id=spreadsheetId(config.sourceUrl),year=date.slice(0,4);
 if(supabaseMode())supabaseReviewBasis();
 const meta=await sourceCall(config,'mainMeta',{spreadsheetId:id,year});
 if(meta.version!=='main-readonly-1'||meta.spreadsheetId!==id)throw Error('원본 연결 대상과 버전을 확인하세요.');
 const sheets=meta.sheets.filter(s=>tabDate(s.title,year)===date);if(!sheets.length)throw Error(`${date} 일자 탭이 없습니다. 기존 자료는 유지합니다.`);
 const batches=[];
 for(const s of sheets){let startRow=2,pages=0;do{
 const data=await sourceCall(config,'mainRows',{spreadsheetId:id,sheetId:s.sheetId,year,from:date,to:date,startRow,limit:500});
 if(data.sheetId!==s.sheetId||data.title!==s.title||!Array.isArray(data.headers)||!Array.isArray(data.rows)||data.nextRow!==null&&(!Number.isInteger(data.nextRow)||data.nextRow<=startRow)||++pages>200)throw Error('원본 페이지 형식 오류: 반영하지 않았습니다.');
 batches.push(data);startRow=data.nextRow;
 }while(startRow!==null);}
 const after=await sourceCall(config,'mainMeta',{spreadsheetId:id,year});
 if(sheets.some(s=>{const n=after.sheets.find(n=>n.sheetId===s.sheetId);return !n||n.lastRow!==s.lastRow||n.columns!==s.columns;}))throw Error('조회 중 원본 크기가 변경됐습니다. 다시 불러오세요.');
 if(!allowed())throw Error('로그인 또는 권한을 다시 확인하세요.');
 if(supabaseMode())supabaseReviewBasis();
 const review=await reviewSheetRows(batches,{from:date,to:date,spreadsheetId:id,existing:state.dispatch,assignments:state.assignments,drivers:state.drivers});
 issues=sheetIssueRows(review,batches,id);
 const result=await commitSheetRows([...review.rows,...review.updates],{...review,from:date,to:date,title:meta.title,sourceSpreadsheetId:id,sourceSnapshot:{...review.sourceSnapshot,checkedAt:new Date().toISOString()}});
 await flushShared();if(supabaseMode())supabaseReviewBasis();
 message=`${date} · 저장 확인 ${new Date().toLocaleTimeString('ko-KR')} · 신규 ${result.inserted} · 배정 보완 ${result.updated} · 보류 ${issues.length}행 · 저장 시 충돌 ${result.conflicts}건`;
 if(result.conflicts)message+=' · 기간별 검토에서 재확인하세요.';
 window.dispatchEvent(new Event('sheet-sync-complete'));
 }catch(e){message='불러오기 중단: '+e.message+' (연결 설정은 유지됩니다.)';}
 finally{running=false;paint();}
}
export async function refreshSheet(date){
 if(!navigator.locks){message='중복 실행 방지를 위해 최신 브라우저에서 실행하세요.';paint();return;}
 await navigator.locks.request('mmtc-main-sheet-import',{ifAvailable:true},async lock=>{if(!lock){message='다른 탭에서 불러오는 중입니다.';paint();return;}await execute(date);});
}
export function mountSheetSync(view,date){
 if(!allowed())return;
 const panel=document.createElement('section');panel.className='card card-pad';panel.dataset.sheetSync='';
 panel.innerHTML=`<h3>구글시트 배차 연결</h3><p>수동: 선택일 ${esc(date)} · 자동: 오늘 일자 · 중복·마감·수동 수정 보호 유지</p><div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn btn-primary" data-run>구글시트 새로 불러오기</button><button class="btn btn-ghost" data-settings>연결 설정·기간별 검토</button><button class="btn btn-ghost" data-issues>문제 행 확인</button><label><input type="checkbox" data-auto> 오늘 배차 30분 자동 불러오기</label></div><p data-status role="status"></p><div data-errors></div><p class="small muted">자동 실행은 이 계정으로 로그인한 관제 화면이 열려 있을 때만 가능합니다. PC 절전·화면 종료 중에는 실행되지 않습니다. 문제 행은 원본 행을 열어 수정한 뒤 다시 불러오세요.</p>`;
 view.prepend(panel);panel.querySelector('[data-run]').onclick=()=>refreshSheet(date);
 panel.querySelector('[data-settings]').onclick=()=>openSheetImport({from:date,to:date});
 panel.querySelector('[data-issues]').onclick=()=>openSheetIssues(issues);
 const auto=panel.querySelector('[data-auto]');auto.checked=loadSheetConnection().auto===true;
 recoverSheetConnection().then(config=>{if(!panel.isConnected)return;if(config.url&&config.token){if(config.auto===undefined){config.auto=true;rememberSheetConnection(config);}auto.checked=config.auto===true;if(message==='아직 불러오지 않았습니다.')message='저장된 연결 준비 완료 · 수동으로 불러오거나 30분 자동 실행을 기다리세요.';}else if(message==='아직 불러오지 않았습니다.')message='저장된 연결이 없습니다. 연결 설정에서 최초 1회 확인이 필요합니다.';paint();}).catch(()=>{message='이전 연결 복구 실패 · 연결 설정을 확인하세요.';paint();});
 auto.onchange=()=>{const config=loadSheetConnection();if(auto.checked&&(!config.url||!config.token)){auto.checked=false;message='먼저 연결 설정에서 원본 조회를 한 번 성공시켜 주세요.';paint();return;}rememberSheetConnection({...config,auto:auto.checked});lastAttempt=Date.now();};
 if(!timer)timer=setInterval(()=>{if(!allowed()||!loadSheetConnection().auto||document.hidden||!navigator.onLine||document.querySelector('.modal,.drawer')||document.activeElement?.matches('input,textarea,select')||Date.now()-lastAttempt<interval)return;refreshSheet(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));},15000);
 paint();
}

