import {customerEndpoint} from '../assets/js/core/customer-endpoint.js';
// Deliberately independent of the staff application, staff sessions, IndexedDB and cloud bootstrap.
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),nf=n=>Number(n||0).toLocaleString('ko-KR');
let token=new URLSearchParams(location.hash.slice(1)).get('key')||'',endpoint='',revision=null,next=null,busy=false;
window.addEventListener('hashchange',()=>{
  if((new URLSearchParams(location.hash.slice(1)).get('key')||'')!==token){
    clear();
    location.reload();
  }
});
const selected={day:'',model:'',destination:'',status:''};
const filterIds={model:'model',destination:'destination',status:'delivery-status'};
function resetFacets(){for(const k of Object.keys(selected))selected[k]='';}
function setFacet(key,value){if(busy)return;selected[key]=value;query(false);}
function renderFacets(facets){
 if(!facets)throw Error('조건별 조회 업데이트 중입니다. 잠시 후 다시 조회하세요.');
 const options=(items,value)=>value&&!items.some(x=>x.label===value)?[{label:value,rows:0,units:0},...items]:items;
 const dates=[{label:'',rows:null},...options(facets.day,selected.day)];
 $('day-tabs').innerHTML=dates.map(x=>'<button type="button" data-day="'+esc(x.label)+'" aria-pressed="'+(x.label===selected.day)+'">'+esc(x.label?x.label.slice(5).replace('-','/'):'기간 전체')+(x.rows==null?'':' · '+nf(x.rows)+'건')+'</button>').join('');
 for(const [key,id] of Object.entries(filterIds)){
   const items=options(facets[key],selected[key]);
   $(id).innerHTML='<option value="">전체</option>'+items.map(x=>'<option value="'+esc(x.label)+'">'+esc(x.label)+' · '+nf(x.rows)+'건</option>').join('');
   $(id).value=selected[key];
   if(key==='status')continue;
   const scope=items.filter(x=>!selected[key]||x.label===selected[key]);
   $(key+'-summary').innerHTML=scope.length?'<table><thead><tr><th>구분</th><th>조회 건수</th><th>유효 대수</th></tr></thead><tbody>'+scope.map(x=>'<tr><td><button type="button" data-value="'+esc(x.label)+'">'+esc(x.label)+'</button></td><td>'+nf(x.rows)+'건</td><td>'+nf(x.units)+'대</td></tr>').join('')+'</tbody></table>':'<p class="muted">해당 자료가 없습니다.</p>';
 }
}
$('day-tabs').onclick=e=>{const b=e.target.closest('[data-day]');if(b)setFacet('day',b.dataset.day);};
for(const [key,id] of Object.entries(filterIds)){
 $(id).onchange=()=>setFacet(key,$(id).value);
 if(key!=='status')$(key+'-summary').onclick=e=>{const b=e.target.closest('[data-value]');if(b)setFacet(key,b.dataset.value);};
}
function keyFromLink(value){try{const u=new URL(value);if(u.origin!==location.origin||!/^\/control\/customer\/(?:index\.html)?$/.test(u.pathname))throw Error();return new URLSearchParams(u.hash.slice(1)).get('key')||'';}catch{return '';}}
function clear(){ $('results').hidden=true;$('rows').innerHTML='';revision=null;next=null;}
async function query(more=false){if(busy)return;busy=true;$('query').disabled=true;$('load-more').disabled=true;$('status').className='muted';$('status').textContent='배차 정보를 확인하고 있습니다…';if(!more)clear();
 try{if(!token)throw Error('운송 담당자에게 받은 고객 전용 링크가 필요합니다.');const p={...selected,token,limit:200,offset:more?next||0:0};if($('from').value)p.from=$('from').value;if($('to').value)p.to=$('to').value;p.q=$('q').value;p.brand=$('brand').value;if(more)p.revision=revision;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);let result;try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'customer.read',payload:p}),cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});result=await response.json();if(!response.ok)throw Error(response.status===429?'조회 요청이 많습니다. 잠시 후 다시 조회하세요.':response.status>=500?'조회 서버 응답이 지연됩니다. 잠시 후 다시 조회하세요.':result.error||'링크가 만료되거나 해제되었을 수 있습니다. 운송 담당자에게 확인하세요.');}finally{clearTimeout(timer);}if(!result.ok)throw Error(result.error||'조회에 실패했습니다.');const data=result.data;
  $('title').textContent=data.label+' · 배차 현황';$('scope').textContent=`조회 가능 운송일 ${data.dateMode==='all'?'전체 기간':data.allowedFrom+' ~ '+data.allowedTo} · ${data.expiryMode==='manual'?'운영자가 해제할 때까지 유지':'링크 만료 '+new Date(data.expiresAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}`;
  for(const id of ['from','to']){$(id).min=data.allowedFrom;$(id).max=data.allowedTo;}if(!$('from').value)$('from').value=data.from;if(!$('to').value)$('to').value=data.to;
  $('brand').innerHTML='<option value="">전체 허용 브랜드</option>'+(data.brands||[]).map(b=>`<option value="${esc(b)}">${esc(b)}</option>`).join('');$('brand').value=data.brand||'';
  renderFacets(data.facets);renderDashboard(data);
  $('rows').insertAdjacentHTML('beforeend',data.rows.map(r=>`<tr><td>${esc(r.date)}${r.arrivalDate?`<div class="muted">도착 ${esc(r.arrivalDate)}</div>`:''}</td><td>${esc(r.customer)}<div class="muted">${esc(r.brand)} · ${esc(r.model)}</div></td><td>${esc(r.vin)}</td><td>${esc(r.origin)} → ${esc(r.destination)}</td><td>${r.count==null?'확인 중':nf(r.count)}</td><td><span class="tag ${r.status==='배정 완료'?'status-assigned':r.status==='배정 대기'?'status-pending':'status-other'}">${esc(r.status)}</span></td><td>${esc(r.driverName||'미배정·확인 중')}<div>${r.driverPhone?`<a href="tel:${esc(r.driverPhone.replace(/[^+0-9]/g,''))}">${esc(r.driverPhone)}</a>`:r.driverName?'연락처 미등록':''}</div></td></tr>`).join(''));
  if(!more&&!data.rows.length)$('rows').innerHTML='<tr><td colspan="7">조건에 맞는 배차 정보가 없습니다.</td></tr>';
  revision=data.revision;next=data.nextOffset;$('load-more').hidden=next===null;$('results').hidden=false;$('entry').hidden=true;$('updated').textContent=`공용 원장 조회: ${new Date(data.queriedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} · 조회 결과 ${nf(data.total)}행`; $('status').textContent='허용된 거래처의 공용 원장 정보를 표시합니다.';
 }catch(e){clear();$('status').className='error';$('status').textContent=e.name==='AbortError'?'응답이 지연됩니다. 잠시 후 다시 조회하세요.':e.message;$('entry').hidden=false;}finally{busy=false;$('query').disabled=false;$('load-more').disabled=false;}}

function renderDashboard(data){
 const s=data.summary,d=data.dashboard,percent=s.units?Math.round(s.assigned/s.units*1000)/10:0;
 $('stats').innerHTML=[['총운송량',s.units,'대','취소·확인 중 제외',''],['배정 완료',s.assigned,'대','배송 완료와 구분',''],['배정 대기',s.pending,'대','기사 배정 필요','pending'],['정보 확인 중',s.checking,'행','대수 집계에서 제외','checking']].map(([label,n,unit,hint,tone])=>'<div class="stat-card '+tone+'">'+label+'<b>'+nf(n)+'<span style="font-size:15px"> '+unit+'</span></b><small>'+hint+'</small></div>').join('');
 const legend='<p class="legend"><span><i class="dot" style="background:#2277bd"></i>배정 완료</span><span><i class="dot" style="background:#e8a526"></i>배정 대기</span></p>';
 const bar=(label,a,p,max)=>'<div class="chart-row" role="img" aria-label="'+esc(label)+': 배정 완료 '+nf(a)+'대, 배정 대기 '+nf(p)+'대"><span>'+esc(label)+'</span><div class="bar-track"><span class="bar-assigned" style="width:'+(max?a/max*100:0)+'%"></span><span class="bar-pending" style="width:'+(max?p/max*100:0)+'%"></span></div><strong>'+nf(a+p)+'대</strong></div>';
 $('progress-chart').innerHTML=s.units?'<div class="dashboard-rate">'+percent+'% <span class="muted">배정률</span></div>'+bar('전체',s.assigned,s.pending,s.units)+legend:'<p class="chart-empty">선택 조건에 집계 가능한 운송이 없습니다.</p>';
 if(!d){$('daily-chart').innerHTML=$('region-chart').innerHTML='<p class="chart-empty">상세 집계를 준비 중입니다. 잠시 후 다시 조회하세요.</p>';return;}
 const maxDay=Math.max(0,...d.daily.map(x=>x.units));$('daily-chart').innerHTML=d.daily.length?d.daily.map(x=>bar(x.date.slice(5),x.assigned,x.pending,maxDay)).join('')+legend:'<p class="chart-empty">일자별 운송 자료가 없습니다.</p>';
 const maxRegion=Math.max(0,...d.regions.map(x=>x.units));$('region-chart').innerHTML=d.regions.length?d.regions.map(x=>bar(x.label,x.assigned,x.pending,maxRegion)).join('')+legend+'<div class="scroll"><table class="region-table"><thead><tr><th>도착 권역</th><th>총운송량</th><th>배정 완료</th><th>배정 대기</th><th>비중</th></tr></thead><tbody>'+d.regions.map(x=>'<tr><td>'+esc(x.label)+'</td><td>'+nf(x.units)+'대</td><td>'+nf(x.assigned)+'대</td><td>'+nf(x.pending)+'대</td><td>'+(s.units?Math.round(x.units/s.units*1000)/10:0)+'%</td></tr>').join('')+'</tbody></table></div>':'<p class="chart-empty">권역별 운송 자료가 없습니다.</p>';
}

document.querySelectorAll('.portal-nav a').forEach(a=>a.onclick=e=>{e.preventDefault();document.querySelector(a.getAttribute('href'))?.scrollIntoView({behavior:'smooth',block:'start'});});
$('all-dates').onclick=()=>{if(!$('from').min)return;resetFacets();$('from').value=$('from').min;$('to').value=$('to').max;query(false);};
$('filters').onsubmit=e=>{e.preventDefault();resetFacets();query(false);};$('brand').onchange=()=>{resetFacets();query(false);};$('load-more').onclick=()=>query(true);$('open').onclick=()=>{resetFacets();token=keyFromLink($('link').value);$('link').value='';for(const id of ['from','to','q'])$(id).value='';$('brand').innerHTML='<option value="">전체 허용 브랜드</option>';query(false);};
try{const response=await fetch('../shared-access.json',{cache:'no-store'}),config=await response.json();endpoint=customerEndpoint(config);if(token)await query();else{$('entry').hidden=false;$('status').textContent='전달받은 고객 전용 링크를 입력하세요.';}}catch(e){$('status').className='error';$('status').textContent=e.message;$('query').disabled=true;}

