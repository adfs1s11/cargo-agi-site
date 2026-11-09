// Public connection metadata only. Passwords and session tokens never belong here.
import {initSupabaseSession,supabaseMode,supabaseAuthenticated,supabaseLogin,supabaseLogout,workspaceProfile,workspaceSession,workspaceAction,clearSupabaseSession} from './supabase-session.js';
let config={enabled:false,endpoint:''};
const KEY='mmtc.shared.session.v1';
export function sharedOnlineMode(){return config.enabled===true&&config.cloud===true;}
export function sharedMode(){return config.enabled===true;}
export function sharedSession(){if(supabaseMode()){const p=workspaceProfile();return p?{username:p.name,role:p.role,expires:workspaceSession()?.expiresAt}:null;}try{return JSON.parse(sessionStorage.getItem(KEY)||'null');}catch{return null;}}
export function sharedAuthenticated(){if(supabaseMode())return supabaseAuthenticated();const s=sharedSession();return !!(sharedMode()&&s?.token&&s.endpoint===config.endpoint&&s.expires>Date.now());}
export function clearSharedSession(){if(supabaseMode())clearSupabaseSession();sessionStorage.removeItem(KEY);}
export async function sharedCall(action,payload={}){
 if(supabaseMode())return workspaceAction(action,payload);
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(config.endpoint))throw Error('회사 공용 로그인 연결 설정을 확인하세요.');
 const timeout=action.indexOf('cloud.initialize')===0?120000:60000;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{const response=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,payload,token:sharedSession()?.token||''}),signal:controller.signal,redirect:'follow',cache:'no-store'});if(!response.ok)throw Error('회사 로그인 서버에 연결할 수 없습니다.');const result=await response.json();if(!result.ok){const e=Error(result.error||'회사 서버 요청에 실패했습니다.');e.code=result.code;e.details=result.details;throw e;}return result.data;}catch(e){if(e.name==='AbortError')throw Error('회사 로그인 서버 응답이 지연됩니다. 잠시 후 다시 시도하세요.');throw e;}finally{clearTimeout(timer);}
}
export async function initSharedAccess(){
 const response=await fetch(new URL('../../../shared-access.json',import.meta.url),{cache:'no-store'});if(!response.ok)throw Error('로그인 연결 설정을 읽지 못했습니다.');config=await response.json();
 if(await initSupabaseSession(config)){if(!config.enabled||!config.cloud)throw Error('Supabase 운영 연결이 비활성화되어 있습니다.');return true;}
 if(sharedMode()&&sharedAuthenticated()){try{await sharedCall('auth.check');}catch{clearSharedSession();}}
 return sharedMode();
}
export async function sharedLogin(username,password){if(supabaseMode())return supabaseLogin(username,password);const session=await sharedCall('auth.login',{username:username.trim(),password});sessionStorage.setItem(KEY,JSON.stringify({...session,endpoint:config.endpoint}));return true;}
export async function sharedChange(payload){await sharedCall('auth.change',payload);clearSharedSession();}
