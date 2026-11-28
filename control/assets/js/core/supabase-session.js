import {knownRole} from './workspace-access.js';
import {requestPasswordRecovery} from './password-recovery.js';
import {loginIdentity} from './test-account-identity.js';
const PROJECT='https://wlrtwatqcspdroraeuni.supabase.co',KEY='mmtc.supabase.operating.v1';
let config=null,session=null,profile=null,refreshing=null,generation=0;
export const supabaseMode=()=>config!==null;
export const resetWorkspacePassword=email=>requestPasswordRecovery(email,config);
export const workspaceProfile=()=>profile;
export const workspaceSession=()=>session;
export const supabaseAuthenticated=()=>!!(session?.access_token&&profile&&session.expiresAt>Date.now());
function persist(){sessionStorage.setItem(KEY,JSON.stringify(session));}
export function clearSupabaseSession(){generation++;session=null;profile=null;refreshing=null;sessionStorage.removeItem(KEY);}
function expireSession(){
 const notify=!!profile;
 clearSupabaseSession();
 if(notify)window.dispatchEvent(new Event('workspace-auth-expired'));
}
function rejectedCredential(error){
 return error.status===401||['refresh_token_not_found','refresh_token_already_used','invalid_grant','session_not_found','user_banned'].includes(error.code);
}
async function fetchJson(path,body,{auth=true,method='POST',timeoutMs=60000}={}){
 if(!config)throw Error('Supabase 연결 설정이 없습니다.');
 const epoch=generation;
 if(auth)await ensureToken();
 if(epoch!==generation)throw Error('로그인 계정이 변경되었습니다.');
 const credential=auth?session.access_token:null;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const r=await fetch(PROJECT+path,{method,credentials:'omit',cache:'no-store',headers:{apikey:config.publishableKey,'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+credential}:{})},...(method==='GET'?{}:{body:JSON.stringify(body||{})}),signal:controller.signal});
  const result=r.status===204?{}:r.ok?await r.json():await r.json().catch(()=>({}));
  if(epoch!==generation)throw Error('로그인 계정이 변경되었습니다.');
  if(!r.ok){const e=Error(r.status===401?'로그인 시간이 만료됐습니다. 다시 로그인하세요.':r.status===403?'이 계정에 허용된 업무가 아닙니다.':result.error||result.message||result.msg||'서버 요청에 실패했습니다.');e.code=result.code||result.error_code||result.error;e.status=r.status;if(r.status===401&&auth&&session?.access_token===credential)expireSession();throw e;}
  return result;
 }catch(e){
  if(e.name==='AbortError'||e instanceof TypeError)throw Error('로그인 또는 자료 서버에 연결하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도하세요.');
  throw e;
 }finally{clearTimeout(timer);}
}
async function ensureToken(){
 if(!session)throw Error('개인 이메일로 로그인하세요.');
 if(session.expiresAt>Date.now()+60000)return;
 if(!refreshing){
   const current=session,epoch=generation;
   refreshing=(async()=>{
     try{
       const next=await fetchJson('/auth/v1/token?grant_type=refresh_token',{refresh_token:current.refresh_token},{auth:false,timeoutMs:15000});
       if(epoch!==generation)throw Error('로그인 계정이 변경되었습니다.');
       if(!next.access_token||!next.refresh_token||!(next.expires_in>0)||next.user?.id!==current.user?.id)throw Error('로그인 갱신 응답을 확인할 수 없습니다.');
       session={...next,expiresAt:Date.now()+next.expires_in*1000,nonce:current.nonce};persist();
     }catch(e){if(epoch===generation&&rejectedCredential(e))expireSession();throw e;}
     finally{if(epoch===generation)refreshing=null;}
   })();
 }
 await refreshing;
}
export const workspaceRpc=(name,args={}, {timeoutMs=60000}={})=>fetchJson('/rest/v1/rpc/'+name,args,{timeoutMs});
async function loadProfile(){const p=await workspaceRpc('tms_workspace_profile',{}, {timeoutMs:15000});if(!p?.id||!knownRole(p.role)||!p.accessRevision)throw Object.assign(Error('활성 직원 권한을 확인할 수 없습니다. 관리자에게 문의하세요.'),{code:'42501'});profile=p;return p;}
export async function initSupabaseSession(settings){
 if(settings.provider!=='supabase'){config=null;return false;}
 if(settings.supabase?.url!==PROJECT||typeof settings.supabase.publishableKey!=='string')throw Error('운영 DB 연결 설정 오류');
 config=settings.supabase;
 try{session=JSON.parse(sessionStorage.getItem(KEY)||'null');}catch{session=null;}
 if(session){
   if(!session.refresh_token||!session.access_token||!session.nonce){clearSupabaseSession();return true;}
   try{await loadProfile();}catch(e){
     profile=null;
     if(rejectedCredential(e)||e.status===403||e.code==='42501'){clearSupabaseSession();sessionStorage.setItem('mmtc.login.notice',e.status===403||e.code==='42501'?'denied':'expired');}
     else throw e;
   }
 }
 return true;
}
export async function supabaseLogin(email,password){
 clearSupabaseSession();
 const epoch=generation;let next;
 try{next=await fetchJson('/auth/v1/token?grant_type=password',{email:loginIdentity(email),password},{auth:false,timeoutMs:15000});}
 catch(e){
  if(e.status===429)throw Error('로그인 요청이 많습니다. 잠시 후 다시 시도하세요.');
  if(e.code==='invalid_credentials')throw Error('이메일·직원 아이디 또는 비밀번호가 일치하지 않습니다. 아이디 계정은 발급한 관리자에게 문의하세요.');
  if(e.code==='email_not_confirmed')throw Error('초대 메일에서 계정 확인과 비밀번호 설정을 먼저 완료해 주세요.');
  throw e;
 }
 if(generation!==epoch)throw Error('다른 로그인 요청이 진행되었습니다.');
 session={...next,expiresAt:Date.now()+next.expires_in*1000,nonce:crypto.randomUUID()};
 try{await loadProfile();persist();return true;}catch(e){if(epoch===generation)clearSupabaseSession();throw e;}
}
export async function supabaseLogout(){try{if(session)await fetchJson('/auth/v1/logout?scope=local',{},{timeoutMs:15000});}finally{clearSupabaseSession();}}
export async function workspaceAction(action,payload={}){
 if(action==='auth.check')return loadProfile();
 if(action==='auth.logout')return supabaseLogout();
 if(action==='auth.change')throw Error('개인 비밀번호는 이메일 재설정 메뉴에서 변경하세요.');
 const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
 const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(sort({actor:profile?.id,action,payload}))))),v=>v.toString(16).padStart(2,'0')).join('');
 const pendingKey='mmtc.supabase.action.'+fingerprint;
 const mutationId=sessionStorage.getItem(pendingKey)||crypto.randomUUID();sessionStorage.setItem(pendingKey,mutationId);
 const result=await fetchJson('/functions/v1/workspace-actions',{action,payload,mutationId});
 if(!result.ok)throw Error(result.error||'업무 처리 실패');sessionStorage.removeItem(pendingKey);return result.data;
}
export async function workspaceWrite(command){const result=await fetchJson('/functions/v1/workspace-write',command);if(!result.ok)throw Error(result.error||'운영 원장 저장 실패');return result.data;}
export async function issueDriverAccount(input){const result=await fetchJson('/functions/v1/staff-driver-account',input);if(!result.ok)throw Error(result.error||'기사 계정 발급 실패');return result;}
export async function registrationOcr(input){const result=await fetchJson('/functions/v1/vehicle-registration-ocr',input,{timeoutMs:45000});if(!result.ok)throw Error(result.error||'등록증 인식 실패');return result;}
export async function workspaceEquipmentPhoto(path){
 if(!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[12]\.jpg$/.test(path))throw Error('첨부 사진 경로 오류');
 const result=await fetchJson('/storage/v1/object/sign/equipment-reports/'+path,{expiresIn:120});
 if(typeof result.signedURL!=='string'||!result.signedURL.startsWith('/object/sign/equipment-reports/'))throw Error('첨부 사진 응답 오류');
 return PROJECT+'/storage/v1'+result.signedURL;
}

export async function workspaceTaskPhoto(path){
 if(!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[12]\.jpg$/.test(path))throw Error('첨부 사진 경로 오류');
 const result=await fetchJson('/storage/v1/object/sign/driver-task-photos/'+path,{expiresIn:120});
 if(typeof result.signedURL!=='string'||!result.signedURL.startsWith('/object/sign/driver-task-photos/'))throw Error('첨부 사진 응답 오류');
 return PROJECT+'/storage/v1'+result.signedURL;
}

const trainingPath=p=>/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/.test(p);
export async function uploadTrainingFile(courseId,fileId,blob,ext){
 if(profile?.role!=='admin'||![courseId,fileId].every(v=>/^[0-9a-f-]{36}$/.test(v))||!['pdf','jpg','png','webp'].includes(ext)||blob.size>16777216)throw Error('교육 첨부자료와 관리자 권한을 확인하세요.');await ensureToken();const path=session.user.id+'/'+courseId+'/'+fileId+'.'+ext;
 const r=await fetch(PROJECT+'/storage/v1/object/safety-training/'+path,{method:'POST',credentials:'omit',headers:{apikey:config.publishableKey,Authorization:'Bearer '+session.access_token,'Content-Type':blob.type,'x-upsert':'false'},body:blob,signal:AbortSignal.timeout(90000)});if(!r.ok&&r.status!==409){const e=await r.json().catch(()=>({}));throw Error(e.message||'교육 첨부 전송 실패 · 다시 저장하면 이어서 진행합니다.');}return path;
}
export async function trainingFileUrl(path){if(profile?.role!=='admin'||!trainingPath(path))throw Error('교육 파일 권한·경로를 확인하세요.');const result=await fetchJson('/storage/v1/object/sign/safety-training/'+path,{expiresIn:120});if(typeof result.signedURL!=='string'||!result.signedURL.startsWith('/object/sign/safety-training/'))throw Error('교육 파일 응답 오류');return PROJECT+'/storage/v1'+result.signedURL;}
