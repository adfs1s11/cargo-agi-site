import {knownRole} from './workspace-access.js';
import {requestPasswordRecovery} from './password-recovery.js';
const PROJECT='https://wlrtwatqcspdroraeuni.supabase.co',KEY='mmtc.supabase.operating.v1';
let config=null,session=null,profile=null,refreshing=null;
export const supabaseMode=()=>config!==null;
export const resetWorkspacePassword=email=>requestPasswordRecovery(email,config);
export const workspaceProfile=()=>profile;
export const workspaceSession=()=>session;
export const supabaseAuthenticated=()=>!!(session?.access_token&&profile&&session.expiresAt>Date.now());
function persist(){sessionStorage.setItem(KEY,JSON.stringify(session));}
export function clearSupabaseSession(){session=null;profile=null;sessionStorage.removeItem(KEY);}
async function fetchJson(path,body,{auth=true,method='POST'}={}){
 if(!config)throw Error('Supabase 연결 설정이 없습니다.');
 if(auth)await ensureToken();
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
 try{
  const r=await fetch(PROJECT+path,{method,credentials:'omit',cache:'no-store',headers:{apikey:config.publishableKey,'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+session.access_token}:{})},...(method==='GET'?{}:{body:JSON.stringify(body||{})}),signal:controller.signal});
  const result=await r.json();
  if(!r.ok){const e=Error(r.status===401?'로그인 시간이 만료됐습니다. 다시 로그인하세요.':r.status===403?'이 계정에 허용된 업무가 아닙니다.':result.error||result.message||result.msg||'서버 요청에 실패했습니다.');e.code=result.code;e.status=r.status;if(r.status===401&&auth)clearSupabaseSession();throw e;}
  return result;
 }finally{clearTimeout(timer);}
}
async function ensureToken(){
 if(!session)throw Error('개인 이메일로 로그인하세요.');
 if(session.expiresAt>Date.now()+60000)return;
 if(!refreshing)refreshing=(async()=>{try{const next=await fetchJson('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token},{auth:false});session={...next,expiresAt:Date.now()+next.expires_in*1000,nonce:session.nonce};persist();}catch(e){clearSupabaseSession();throw e;}finally{refreshing=null;}})();
 await refreshing;
}
export const workspaceRpc=(name,args={})=>fetchJson('/rest/v1/rpc/'+name,args);
async function loadProfile(){const p=await workspaceRpc('tms_workspace_profile');if(!p?.id||!knownRole(p.role)||!p.accessRevision)throw Error('직원 권한을 확인할 수 없습니다.');profile=p;return p;}
export async function initSupabaseSession(settings){
 if(settings.provider!=='supabase'){config=null;return false;}
 if(settings.supabase?.url!==PROJECT||typeof settings.supabase.publishableKey!=='string')throw Error('운영 DB 연결 설정 오류');
 config=settings.supabase;
 try{session=JSON.parse(sessionStorage.getItem(KEY)||'null');}catch{session=null;}
 if(session){try{await loadProfile();}catch(e){clearSupabaseSession();if(e.status!==401&&e.code!=='42501')throw e;}}
 return true;
}
export async function supabaseLogin(email,password){
 clearSupabaseSession();
 const next=await fetchJson('/auth/v1/token?grant_type=password',{email:email.trim(),password},{auth:false});
 session={...next,expiresAt:Date.now()+next.expires_in*1000,nonce:crypto.randomUUID()};
 try{await loadProfile();persist();return true;}catch(e){clearSupabaseSession();throw e;}
}
export async function supabaseLogout(){try{if(session)await fetchJson('/auth/v1/logout?scope=local');}finally{clearSupabaseSession();}}
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
