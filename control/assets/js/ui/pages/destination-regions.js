import {state} from '../../core/data.js';
import {workspaceProfile} from '../../core/supabase-session.js';
import {ensureReferenceHistory} from '../../core/supabase-cloud.js';
import {REGIONS,REGION_STATES,mappingKey,buildRegionCandidates,mergeMappings,mappingSheet,parseMappingSheet} from '../../core/destination-regions.js';
import {loadRegionMappings,saveRegionMappings} from '../../core/destination-regions-store.js';
import {esc,nf,exportXlsx,readFile,openModal,confirmBox,todayStr} from '../../core/utils.js';
import {pageHead} from '../components.js';

export default async function renderDestinationRegions(view){
 const editable=['admin','dispatch'].includes(workspaceProfile()?.role),token=Symbol();view.regionRequest=token;
 let rows=[],revision=0,dirty=false,q='',filter='',page=0,busy=false;
 view.innerHTML=pageHead('도착지·권역 전환표','거래처별 도착지 이름을 찾아 공통 권역으로 자동 분류합니다.')+`<section class="card card-pad"><p>적용 순서: <b>거래처별 전환표 → 공통 전환표 → 도착지의 시·도/시·군 명칭</b>. 공백·영문 대소문자만 무시하고 도착지 전체 이름을 비교합니다.</p><p>원본 도착지·차대번호·금액·마감본은 변경하지 않습니다. 확인필요·사용안함은 기타/미확인으로 표시합니다.</p><div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" id="region-reload">서버 조회</button>${editable?'<button class="btn" id="region-build">기존 배차에서 전환표 만들기</button><button class="btn" id="region-history">과거 참고 이력도 추가</button><button class="btn" id="region-new">직접 추가</button><button class="btn" id="region-upload">엑셀 업로드</button>':''}<button class="btn" id="region-download">전환표 다운로드</button><button class="btn" id="region-template">업로드 양식</button>${editable?'<button class="btn btn-primary" id="region-save">공용 전환표 저장</button>':''}<input type="file" id="region-file" accept=".xlsx,.xls" hidden></div><p id="region-message" role="status">전환표 조회 중…</p><div class="row" style="gap:10px;flex-wrap:wrap"><input class="input" id="region-query" aria-label="전환표 검색" placeholder="거래처·도착지·검토 메모 검색" style="max-width:420px"><select class="select" id="region-filter" aria-label="전환표 상태"><option value="">전체 상태</option>${REGION_STATES.map(x=>`<option>${x}</option>`).join('')}</select></div><p id="region-summary"></p><div class="scroll-x"><table class="data"><thead><tr><th>거래처 (빈칸=공통)</th><th>원본 도착지</th><th>권역</th><th>적용상태</th><th>검토 메모</th><th>관리</th></tr></thead><tbody id="region-body"></tbody></table></div><div class="row" style="gap:12px;margin-top:16px"><button class="btn" id="region-prev">이전</button><span id="region-page"></span><button class="btn" id="region-next">다음</button></div></section>`;
 const $=s=>view.querySelector(s),message=t=>{$('#region-message').textContent=t;};
 function lock(value){busy=value;for(const b of view.querySelectorAll('button'))b.disabled=value;if(!value)draw();}
 function draw(){
  view.dataset.regionDirty=String(dirty);
  const found=rows.filter(r=>(!filter||r.status===filter)&&(!q||[r.customer,r.destination,r.note].join(' ').toLowerCase().includes(q)));
  page=Math.min(page,Math.max(0,Math.ceil(found.length/50)-1));
  $('#region-summary').textContent=`전체 ${nf(rows.length)}곳 · 자동 ${nf(rows.filter(r=>r.status==='자동').length)} · 확정 ${nf(rows.filter(r=>r.status==='확정').length)} · 확인필요 ${nf(rows.filter(r=>r.status==='확인필요').length)} · ${dirty?'미저장 변경 있음':`서버 ${revision}차`}`;
  $('#region-body').innerHTML=found.slice(page*50,page*50+50).map(r=>`<tr><td>${esc(r.customer||'공통')}</td><td>${esc(r.destination)}</td><td>${esc(r.region)}</td><td><span class="badge ${r.status==='확인필요'?'amber':'green'}">${esc(r.status)}</span></td><td>${esc(r.note)}</td><td>${editable?`<button class="btn btn-sm" data-region-edit="${rows.indexOf(r)}">수정</button>`:'조회 전용'}</td></tr>`).join('')||'<tr><td colspan="6">전환표가 없습니다. 기존 배차에서 만들거나 업로드하세요.</td></tr>';
  $('#region-page').textContent=`${page+1} / ${Math.max(1,Math.ceil(found.length/50))} 페이지 · 검색 ${nf(found.length)}곳`;
  $('#region-prev').disabled=busy||page===0;$('#region-next').disabled=busy||(page+1)*50>=found.length;
  if($('#region-save'))$('#region-save').disabled=busy||!dirty;
  for(const b of view.querySelectorAll('[data-region-edit]'))b.onclick=()=>edit(Number(b.dataset.regionEdit));
 }
 async function run(fn){if(busy)return;lock(true);try{await fn();}catch(e){message(e.message);}finally{if(view.regionRequest===token&&view.isConnected)lock(false);}}
 async function reload(){const data=await loadRegionMappings({force:true});if(view.regionRequest!==token)return;rows=data.rows;revision=data.revision;dirty=false;message('공용 전환표 조회 완료. 변경 후 공용 전환표 저장을 눌러주세요.');}
 function addCandidates(records){const added=buildRegionCandidates(records,rows);rows=mergeMappings(rows,added);dirty=dirty||added.length>0;message(`${nf(added.length)}곳 추가 · 원문과 기존 권역이 충돌하거나 위치가 불명확하면 확인필요로 남깁니다. 저장 전 검토하세요.`);draw();}
 function edit(index=-1){const old=rows[index]||{customer:'',destination:'',region:'기타/미확인',status:'확인필요',note:''};
  openModal({title:'도착지 권역 지정',body:`<form id="region-edit-form"><label>거래처 (빈칸이면 모든 거래처 공통)<input class="input" name="customer" value="${esc(old.customer)}" maxlength="200"></label><label>원본 도착지<input class="input" name="destination" value="${esc(old.destination)}" maxlength="500" required></label><label>권역<select class="select" name="region">${REGIONS.map(r=>`<option ${r===old.region?'selected':''}>${r}</option>`).join('')}</select></label><label>적용상태<select class="select" name="status">${REGION_STATES.map(r=>`<option ${r==='확정'?'selected':''}>${r}</option>`).join('')}</select></label><label>검토 메모<input class="input" name="note" value="${esc(old.note)}" maxlength="600"></label><p role="alert" id="region-edit-error"></p><button class="btn btn-primary" type="submit">목록에 적용</button></form>`,onMount(el,close){el.querySelector('form').onsubmit=e=>{e.preventDefault();try{const v=Object.fromEntries(new FormData(e.currentTarget));const others=rows.filter((_,i)=>i!==index);if(others.some(r=>mappingKey(r)===mappingKey(v)))throw Error('같은 거래처·도착지가 이미 있습니다. 기존 항목을 수정하세요.');rows=mergeMappings(others,[v]);dirty=true;draw();message('목록 변경 완료 · 공용 전환표 저장을 눌러야 다른 직원과 공유됩니다.');close();}catch(e){el.querySelector('#region-edit-error').textContent=e.message;}};}});
 }
 $('#region-query').oninput=e=>{q=e.target.value.trim().toLowerCase();page=0;draw();};$('#region-filter').onchange=e=>{filter=e.target.value;page=0;draw();};$('#region-prev').onclick=()=>{page--;draw();};$('#region-next').onclick=()=>{page++;draw();};
 $('#region-reload').onclick=()=>run(async()=>{if(dirty&&!await confirmBox('변경 취소','저장하지 않은 전환표 변경을 버리고 서버에서 다시 조회할까요?'))return;await reload();});
 $('#region-download').onclick=()=>exportXlsx({'권역 전환표':mappingSheet(rows)},`도착지_권역전환표_${todayStr()}${dirty?'_검토중':''}.xlsx`);
 $('#region-template').onclick=()=>exportXlsx({'권역 전환표':mappingSheet([]),'작성 안내':[['항목','설명'],['거래처','빈칸이면 공통, 입력하면 해당 거래처 우선'],['원본 도착지','배차판에 입력된 전체 명칭. 원문은 변경하지 않음'],['권역',REGIONS.join(', ')],['적용상태',REGION_STATES.join(', ')],['업로드','같은 거래처·도착지는 갱신, 나머지는 유지. 삭제하려면 사용안함'],['확인필요','명칭이 모호하거나 기존 권역이 다른 경우 직접 확인 후 확정']]},'도착지_권역전환표_업로드양식.xlsx');
 if(editable){
  $('#region-new').onclick=()=>edit();$('#region-build').onclick=()=>addCandidates(state.dispatch||[]);
  $('#region-history').onclick=()=>run(async()=>{message('과거 참고 이력을 추가 조회 중입니다. 최초 접속 시에는 읽지 않습니다.');await ensureReferenceHistory(p=>message(`${nf(p.loaded)} / ${nf(p.total)}건 조회 중…`));addCandidates([...(state.dispatch||[]),...(state.transportHistory||[])]);});
  $('#region-upload').onclick=()=>$('#region-file').click();$('#region-file').onchange=e=>{const file=e.target.files[0];e.target.value='';if(!file)return;run(async()=>{if(file.size>10*1024*1024)throw Error('엑셀 파일은 10MB 이하로 나누어 주세요.');const wb=XLSX.read(await readFile(file),{type:'array'}),sheet=wb.Sheets['권역 전환표'];if(!sheet)throw Error('권역 전환표 시트가 없습니다. 업로드 양식을 사용하세요.');const incoming=parseMappingSheet(XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false}));const merged=mergeMappings(rows,incoming),oldKeys=new Set(rows.map(mappingKey)),updates=incoming.filter(r=>oldKeys.has(mappingKey(r))).length;
   if(!await confirmBox('전환표 업로드 검토',`신규 ${incoming.length-updates}곳 · 기존 ${updates}곳 갱신. 다른 항목은 유지합니다. 목록에 적용한 뒤 공용 전환표 저장을 눌러주세요.`))return;rows=merged;dirty=true;message('엑셀 반영 완료 · 목록 검토 후 공용 전환표 저장을 눌러주세요.');});};
  $('#region-save').onclick=()=>run(async()=>{const data=await saveRegionMappings(rows,revision);revision=data.revision;rows=data.rows;dirty=false;message(`서버 ${revision}차 저장 완료 · 기존 배차 조회와 앞으로 불러오는 배차에 같은 기준을 적용합니다.`);});
 }
 await run(reload);
}
