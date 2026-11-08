import {dashboard,table,filterRows,stageOptions,printReport} from './view.js';
const $=id=>document.getElementById(id);
let key=new URLSearchParams(location.hash.slice(1)),endpoint='',rows=[],busy=false,loaded=false,label='',expiresAt='',loadedAt='';
history.replaceState(null,'',location.pathname);
$('stage').innerHTML='<option value="">전체 단계</option>'+stageOptions();
function criteria(){return {q:$('q').value,brand:$('brand').value,stage:$('stage').value,from:$('from').value,to:$('to').value};}
function visible(){const c=criteria();if(c.from&&c.to&&c.from>c.to)return [];return filterRows(rows,c);}
function draw(){const found=visible();$('dashboard').innerHTML=loaded?dashboard(found):'';$('data').innerHTML=loaded?table(found):'';$('print').disabled=!loaded||busy||!found.length;$('result').textContent=loaded?`조회 ${found.length}대 / 허용 차량 ${rows.length}대 · 조회 시각 ${loadedAt}`:'';if($('from').value&&$('to').value&&$('from').value>$('to').value)$('result').textContent='시작일이 종료일보다 늦습니다.';}
async function query(){
 if(busy)return;busy=true;loaded=false;rows=[];draw();$('refresh').disabled=$('open').disabled=true;$('status').textContent='조회 중…';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
 try{
  if(!endpoint)throw Error('서버 연결 설정을 확인하세요.');
  if(!key.get('id')||!key.get('token'))throw Error('운영자에게 받은 전체 링크를 입력하세요.');
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'truck.read',payload:{id:key.get('id'),token:key.get('token')}}),signal:controller.signal,cache:'no-store',referrerPolicy:'no-referrer'});
  if(!response.ok)throw Error('서버 연결 실패');const result=await response.json();if(!result.ok)throw Error(result.error||'조회할 수 없습니다.');
  if(!Array.isArray(result.data?.rows))throw Error('차량 목록 응답을 확인할 수 없습니다.');
  rows=result.data.rows;label=result.data.label;expiresAt=result.data.expiresAt;loadedAt=new Date().toLocaleString('ko-KR');loaded=true;
  $('title').textContent=label+' · 상용트럭 운송 현황';$('status').textContent=`링크 만료 ${new Date(expiresAt).toLocaleString('ko-KR')} · 허용된 차량의 최신 단계만 표시합니다.`;
 }catch(error){$('status').textContent=error.name==='AbortError'?'응답이 지연됩니다. 다시 조회하세요.':error.message;}
 finally{clearTimeout(timer);busy=false;$('refresh').disabled=$('open').disabled=false;draw();}
}
for(const id of ['q','brand','stage','from','to'])$(id).addEventListener('input',draw);
$('clear').onclick=()=>{for(const id of ['q','brand','stage','from','to'])$(id).value='';draw();};
$('refresh').onclick=query;
$('print').onclick=()=>printReport(visible(),label+' · 상용트럭 운송 현황',`${$('result').textContent} · 입항예정일 ${$('from').value||'전체'} ~ ${$('to').value||'전체'}`);
$('open').onclick=()=>{try{const url=new URL($('link').value.trim());const next=new URLSearchParams(url.hash.slice(1));if(!next.get('id')||!next.get('token'))throw Error();key=next;$('link').value='';for(const id of ['q','brand','stage','from','to'])$(id).value='';query();}catch{$('status').textContent='전달받은 상용트럭 전체 링크를 입력하세요.';}};
try{const config=await(await fetch('../shared-access.json',{cache:'no-store'})).json();if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(config.endpoint||''))throw Error('서버 연결을 준비 중입니다.');endpoint=config.endpoint;if(key.get('token'))query();else $('status').textContent='운영자에게 받은 링크를 입력하세요.';}catch(error){$('status').textContent=error.message;}
