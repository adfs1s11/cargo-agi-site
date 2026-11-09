import {canonical,sha,checkManifest} from './migration-core.js';
import {readImport} from './import-file.js';
import {reconcileResume} from './resume-core.js';
const $=id=>document.getElementById(id);let config,endpoint,sourceSession=null,session=null,plan=null,busy=false;
let resume=null,core=null;
async function source(action,payload={}){const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},credentials:'omit',cache:'no-store',body:JSON.stringify({action,payload,token:sourceSession?.token||''}),signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('원본 서버 연결 실패');const d=await r.json();if(!d.ok)throw Error(d.error||'원본 조회 실패');return d.data;}
async function request(path,body,auth=true){if(auth&&(!session||session.until<=Date.now()))throw Error('새 DB 관리자 인증을 다시 확인하세요.');const r=await fetch(config.url+path,{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+session.token}:{})},credentials:'omit',cache:'no-store',body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});const d=await r.json();if(!r.ok)throw Error(d.message||d.msg||'새 DB 요청 실패');return d;}
const rpc=(name,body={})=>request('/rest/v1/rpc/'+name,body);
function buttons(){document.querySelectorAll('button').forEach(b=>b.disabled=busy);$('check').disabled=busy||!sourceSession||!session;$('upload').disabled=busy||!plan;$('core-check').disabled=busy||!sourceSession||!session;$('core-upload').disabled=busy||!core;}
async function work(fn){if(busy)return;busy=true;buttons();$('error').textContent='';try{await fn();}catch(e){$('error').textContent=e.message;}finally{busy=false;buttons();}}
$('source-login').onsubmit=e=>{e.preventDefault();const f=e.currentTarget;work(async()=>{try{sourceSession=await source('auth.login',{username:f.elements.username.value.trim(),password:f.elements.password.value});checkManifest(await source('cloud.snapshot'));$('source-status').textContent='기존 원본 연결 확인 완료';plan=null;}finally{f.elements.password.value='';}});};
$('admin-login').onsubmit=e=>{e.preventDefault();const f=e.currentTarget;work(async()=>{try{session=null;const d=await request('/auth/v1/token?grant_type=password',{email:f.elements.email.value.trim(),password:f.elements.password.value},false);session={token:d.access_token,until:Date.now()+d.expires_in*1000};const p=await rpc('tms_pilot_profile');if(p.role!=='admin'){session=null;throw Error('관리자만 이전할 수 있습니다.');}$('admin-status').textContent='새 DB 관리자 확인 완료';}finally{f.elements.password.value='';}});};
$('resume-file').onchange=()=>{resume=null;core=null;buttons();};
$('core-check').onclick=()=>work(async()=>{
 core=null;const file=$('resume-file').files[0];if(!file)throw Error('검증된 변경분 대조 파일을 선택하세요.');
 if(!resume)resume=await readImport(file,n=>$('core-status').textContent=`보관 자료 ${n.toLocaleString()}건 확인`,{allowResume:true});
 core=await reconcileResume(resume,source,text=>$('core-status').textContent=text);
 $('core-status').textContent=`변경분 대조 완료 · 원본 ${core.header.revision}차 · ${core.count.toLocaleString()}건 · 배차 ${core.stores.dispatch.size.toLocaleString()}건. 아직 이전하지 않았습니다.`;
});
$('core-upload').onclick=()=>work(async()=>{
 if(!core||canonical(checkManifest(await source('cloud.status')))!==canonical(core.manifest))throw Error('원본이 변경됐습니다. 변경분을 다시 대조하세요.');
 const {header,stores}=core,run=await rpc('tms_import_begin',{p_archive_sha256:header.archiveSha256,p_revision:header.revision,p_expected:header.expected});
 if(run.state!=='validated')for(const e of header.expected){let batch=[],bytes=0;const send=async()=>{if(!batch.length)return;const d=await rpc('tms_import_chunk',{p_id:run.id,p_store:e.store,p_rows:batch});$('core-status').textContent=`${e.store} ${d.records.toLocaleString()} / ${e.records.toLocaleString()}건 비공개 이전`;batch=[];bytes=0;};for(const row of stores[e.store].values()){const n=new TextEncoder().encode(JSON.stringify(row)).length;if(n>7500000)throw Error('대형 자료 별도 이전 필요');if(batch.length&&(batch.length>=1000||bytes+n>6000000))await send();batch.push(row);bytes+=n;}await send();}
 const result=await rpc('tms_import_validate',{p_id:run.id});if(result.state!=='validated'||result.productionActive!==false)throw Error('서버 검증 상태 확인 필요');
 $('core-status').textContent=`기본 원장 ${core.count.toLocaleString()}건 최신 비공개 이전·서버 대조 완료. 운영 전환 전 단계입니다.`;
});
async function descriptors(){const trucks=await source('truck.list'),grants=await source('customer.grants.list'),favorites=await source('customer.favorites.list');const byId=(a,b)=>String(a.id).localeCompare(String(b.id));trucks.rows.sort(byId);trucks.grants.sort(byId);grants.grants.sort(byId);favorites.favorites.sort(byId);return {trucks,grants,favorites};}
$('check').onclick=()=>work(async()=>{
 plan=null;$('status').textContent='최신 상용트럭과 링크 상태 대조 중…';const start=checkManifest(await source('cloud.snapshot')),before=await descriptors(),rows=[];
 for(const row of before.trucks.rows)rows.push({kind:'truck',key:row.id,value:row});
 for(const grant of before.trucks.grants){const active=!grant.revokedAt&&Date.parse(grant.expiresAt)>Date.now(),full=active?await source('truck.link.get',{id:grant.id}):grant;rows.push({kind:'secret',key:'TRUCK_GRANT_'+grant.id,value:JSON.stringify(full)});}
 for(const grant of before.grants.grants){if(grant.revokedAt||(grant.expiryMode!=='manual'&&!(Date.parse(grant.expiresAt)>Date.now())))continue;const found=await source('customer.grants.link',{id:grant.id});if(found.token)rows.push({kind:'secret',key:'CUSTOMER_LINK_'+grant.id,value:found.token});}
 const after=await descriptors(),end=checkManifest(await source('cloud.status'));
 const changed=[];if(start.revision!==end.revision)changed.push(`기본 원장 ${start.revision} → ${end.revision}차`);if(canonical(start.ends)!==canonical(end.ends))changed.push('원장 변경 행');for(const key of ['trucks','grants','favorites'])if(canonical(before[key])!==canonical(after[key]))changed.push(({trucks:'상용트럭·트럭 링크',grants:'고객 링크',favorites:'즐겨찾기'})[key]);if(changed.length)throw Error('조회 중 원본 변경: '+changed.join(', ')+'. 다시 대조하세요.');
 const prepared=[];for(const row of rows){const text=canonical(row.value);prepared.push({kind:row.kind,key:row.key,text,hash:await sha(text)});}
 const expected=prepared.map(({kind,key,hash})=>({kind,key,hash}));
 plan={revision:start.revision,rows:prepared,expected,fingerprint:await sha(canonical({revision:start.revision,expected,aux:before})),sourceFingerprint:await sha(canonical(before))};
 $('status').textContent=`대조 완료 · 원본 ${plan.revision}차 · 상용트럭 ${before.trucks.rows.length}대 · 트럭 링크 ${before.trucks.grants.length}개 · 고객 링크 ${before.grants.grants.length}개. 아직 이전하지 않았습니다.`;
});
$('upload').onclick=()=>work(async()=>{
 if(!plan)throw Error('최신 자료 대조가 필요합니다.');
 const current=checkManifest(await source('cloud.status'));if(current.revision!==plan.revision||await sha(canonical(await descriptors()))!==plan.sourceFingerprint)throw Error('원본이 변경됐습니다. 다시 대조하세요.');
 const run=await rpc('tms_aux_import_begin',{p_revision:plan.revision,p_fingerprint:plan.fingerprint,p_expected:plan.expected});
 if(run.state!=='validated'){let batch=[],size=0,sent=0;const send=async()=>{if(!batch.length)return;const d=await rpc('tms_aux_import_chunk',{p_id:run.id,p_rows:batch});sent=d.received;$('status').textContent=`비공개 이전 ${sent} / ${plan.rows.length}건`;batch=[];size=0;};for(const row of plan.rows){const n=new TextEncoder().encode(JSON.stringify(row)).length;if(n>3000000)throw Error('단일 자료 크기 확인이 필요합니다.');if(batch.length&&(batch.length>=250||size+n>3000000))await send();batch.push(row);size+=n;}await send();}
 const result=await rpc('tms_aux_import_validate',{p_id:run.id});if(result.state!=='validated'||result.records!==plan.rows.length)throw Error('서버 대조 결과를 확인하세요.');
 $('status').textContent=`상용트럭·고객 링크 ${result.records}건 비공개 이전 및 서버 대조 완료. 운영 연결 전환 검증을 진행할 수 있습니다.`;
});
window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
window.addEventListener('pagehide',()=>{sourceSession=null;session=null;plan=null;});
try{config=await(await fetch('./config.json',{cache:'no-store'})).json();const sourceConfig=await(await fetch('../shared-access.json',{cache:'no-store'})).json();if(config.url!=='https://wlrtwatqcspdroraeuni.supabase.co'||!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(sourceConfig.endpoint||''))throw Error('서버 연결 설정 확인 필요');endpoint=sourceConfig.endpoint;}catch(e){$('error').textContent=e.message;document.querySelectorAll('button').forEach(b=>b.disabled=true);}
