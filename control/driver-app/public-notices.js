import {NOTICE_CATEGORIES,noticeCategory} from './notice-model.js';
const root=document.querySelector('#app');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric'}).format(new Date(v)):'';
let notices=[],category='',brand='',query='',busy=false,error='',loaded=false,config;
root.classList.add('notice-center');
function selectedId(){try{return decodeURIComponent(location.hash.slice(1));}catch{return '';}}
function showList(){history.replaceState(null,'',location.pathname+location.search);draw();}
function draw(){
 const selected=notices.find(n=>n.id===selectedId());
 if(selected){
  root.innerHTML=`<section><div class="nc-toolbar"><button id="back" class="secondary">← 공지 목록</button><button id="refresh" class="secondary" ${busy?'disabled':''}>새로고침</button></div><div class="nc-tags"><span>${esc(noticeCategory(selected))}</span>${selected.brand?`<span>${esc(selected.brand)}</span>`:''}${selected.important?'<span class="nc-important">필독</span>':''}${selected.pinned?'<span>상단 고정</span>':''}</div><h1>${esc(selected.title)}</h1><p class="muted">${date(selected.updated_at)} · ${selected.revision}차 개정 · ${selected.expires_at?date(selected.expires_at)+'까지 게시':'상시 게시'}</p>${selected.summary?`<p class="nc-summary">${esc(selected.summary)}</p>`:''}<div class="nc-body">${esc(selected.body)}</div><p class="muted">로그인 없이 보는 공지입니다. 개인별 확인 기록은 남기지 않습니다.</p></section>`;
  root.querySelector('#back').onclick=showList;root.querySelector('#refresh').onclick=refresh;return;
 }
 root.innerHTML=`<section class="nc-hero"><span class="nc-eyebrow">M&M 기사 공지함</span><h1>출발 전, 꼭 확인해 주세요</h1><p>로그인 없이 바로 보는 공지입니다.<br>상단 고정과 필독 안내를 먼저 확인해 주세요.</p><div class="nc-stats"><div><strong>${notices.length}</strong><span>게시 중</span></div><div><strong>${notices.filter(n=>n.important).length}</strong><span>필독 공지</span></div><div><strong>${notices.filter(n=>n.pinned).length}</strong><span>상단 고정</span></div></div></section><section><div class="nc-toolbar"><h2>공지 찾아보기</h2><button id="refresh" class="secondary" ${busy?'disabled':''}>${busy?'불러오는 중…':'새로고침'}</button></div><p role="status" class="${error?'nc-error':'muted'}">${esc(error||(busy?'최신 공지를 불러오고 있습니다.':selectedId()?'게시가 종료되었거나 볼 수 없는 공지입니다.':'사고 전파 · 브랜드별 출고 주의사항 · 기타 공지'))}</p><div class="nc-tabs" role="group" aria-label="공지 분류">${['전체',...NOTICE_CATEGORIES].map((c,i)=>`<button type="button" data-category="${i?esc(c):''}" aria-pressed="${category===(i?c:'')}">${esc(c)}</button>`).join('')}</div><div class="nc-filters"><label>검색<input id="search" type="search" placeholder="제목·내용·브랜드 검색" value="${esc(query)}"></label><label>브랜드<select id="brand"><option value="">모든 브랜드</option>${[...new Set(notices.map(n=>n.brand).filter(Boolean))].sort().map(b=>`<option value="${esc(b)}" ${brand===b?'selected':''}>${esc(b)}</option>`).join('')}</select></label></div><div id="list"></div></section><p class="muted">이 링크는 누구나 열 수 있습니다. 개인별 확인 여부는 기록하지 않습니다.</p>`;
 root.querySelector('#refresh').onclick=refresh;
 root.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{category=b.dataset.category;brand='';draw();});
 root.querySelector('#search').oninput=e=>{query=e.target.value;list();};
 root.querySelector('#brand').onchange=e=>{brand=e.target.value;list();};list();
}
function list(){
 const q=query.trim().toLocaleLowerCase();
 const rows=notices.filter(n=>(!category||noticeCategory(n)===category)&&(!brand||n.brand===brand)&&(!q||[n.title,n.summary,n.body,n.brand].join(' ').toLocaleLowerCase().includes(q)))
 .sort((a,b)=>Number(b.pinned)-Number(a.pinned)||Number(b.important)-Number(a.important)||String(b.updated_at).localeCompare(String(a.updated_at))||String(a.id).localeCompare(String(b.id)));
 root.querySelector('#list').innerHTML=rows.map(n=>`<article class="nc-card ${n.important?'nc-required':''}"><div class="nc-tags"><span>${esc(noticeCategory(n))}</span>${n.brand?`<span>${esc(n.brand)}</span>`:''}${n.pinned?'<span>상단 고정</span>':''}${n.important?'<span class="nc-important">필독</span>':''}</div><h3>${esc(n.title)}</h3><p>${esc(n.summary||n.body.slice(0,100))}</p><div class="nc-toolbar"><small>${date(n.updated_at)} · ${n.revision}차 개정</small><button data-open="${esc(n.id)}">내용 보기 →</button></div></article>`).join('')||`<p class="nc-empty">${busy?'공지를 불러오고 있습니다.':error?'연결을 확인하고 새로고침해 주세요.':loaded&&!notices.length?'아직 게시된 공지가 없습니다.<br>공지 등록 후 이곳에서 확인할 수 있습니다.':'조건에 맞는 공지가 없습니다.'}</p>`;
 root.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{location.hash=encodeURIComponent(b.dataset.open);});
}
async function refresh(){
 if(busy)return;busy=true;error='';draw();
 try{
  if(!config){const response=await fetch('./config.json',{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error();config=await response.json();if(config.url!=='https://wlrtwatqcspdroraeuni.supabase.co')throw Error();}
  const response=await fetch(config.url+'/rest/v1/rpc/tms_public_notices',{method:'POST',credentials:'omit',cache:'no-store',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error();const result=await response.json();if(!Array.isArray(result.notices))throw Error();notices=result.notices;loaded=true;
 }catch{notices=[];config=null;error='최신 공지를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';}
 finally{busy=false;draw();}
}
window.addEventListener('hashchange',()=>{draw();root.scrollIntoView({block:'start'});});
// Refresh when returning from a background tab; no hidden dispatch/session requests.
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
draw();refresh();
