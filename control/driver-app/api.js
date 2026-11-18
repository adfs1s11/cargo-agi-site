import {phoneE164} from './domain.js';
const KEY='mmtc.driver.session.v1';let config,session,refreshing,generation=0,remember=true;
export const LOGIN_DAYS=35;
const KEEP_MS=LOGIN_DAYS*86400000;
const rememberedUntil=()=>Number(session?.remember_until||0);
export const sessionExpiry=()=>remember?rememberedUntil():0;
export async function init(){config=await(await fetch('./config.json',{cache:'no-store'})).json();if(config.url!=='https://wlrtwatqcspdroraeuni.supabase.co')throw Error('연결 설정 오류');try{remember=!sessionStorage.getItem(KEY);session=JSON.parse(sessionStorage.getItem(KEY)||localStorage.getItem(KEY)||'null');}catch{session=null;}if(remember&&session){if(!session.remember_until){session.remember_until=Date.now()+KEEP_MS;localStorage.setItem(KEY,JSON.stringify(session));}if(rememberedUntil()<=Date.now())clear();}return config;}
export const hasSession=()=>!!session?.refresh_token;
export function sessionOwner(){try{return JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).sub||'';}catch{return '';}}
export async function uploadEquipmentPhoto(path,blob){
 if(!config.enabled||!sessionOwner())throw Error('기사 로그인이 필요합니다.');
 if(!path.startsWith(sessionOwner()+'/')||blob.type!=='image/jpeg'||blob.size>262144)throw Error('첨부 사진을 확인하세요.');
 const response=await fetch(config.url+'/storage/v1/object/equipment-reports/'+path,{method:'POST',credentials:'omit',headers:{apikey:config.publishableKey,Authorization:'Bearer '+await token(),'Content-Type':'image/jpeg','x-upsert':'false'},body:blob,signal:AbortSignal.timeout(45000)});
 const result=await response.json();if(!response.ok&&response.status!==409&&result.statusCode!=='409')throw Error('사진 전송에 실패했습니다. 연결 후 다시 제출하세요.');
}
async function request(path,body,token){const response=await fetch(config.url+path,{method:'POST',credentials:'omit',cache:'no-store',headers:{apikey:config.publishableKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});const result=await response.json();if(!response.ok){const error=Error(response.status===429?'요청이 많습니다. 잠시 후 다시 시도하세요.':result.message||result.msg||'요청을 처리하지 못했습니다.');error.status=response.status;throw error;}return result;}
function clear(){session=null;localStorage.removeItem(KEY);sessionStorage.removeItem(KEY);}
function save(next){session={access_token:next.access_token,refresh_token:next.refresh_token,expires_at:Date.now()+next.expires_in*1000,remember_until:remember?(session?.remember_until||Date.now()+KEEP_MS):0};(remember?localStorage:sessionStorage).setItem(KEY,JSON.stringify(session));}
export async function loginPassword(username,password,persist=true){
 if(!config.enabled)throw Error('기사 서비스 연결 준비 중입니다.');
 let id=String(username||'').trim().toLowerCase();if(!id.startsWith('driver_'))id='driver_'+phoneE164(id).replace('+82','0');if(!/^driver_[a-z0-9][a-z0-9_]{2,26}$/.test(id)||!password)throw Error('휴대폰 번호와 관리자에게 받은 비밀번호를 입력하세요.');
 const started=++generation;clear();remember=persist;
 let next;try{next=await request('/auth/v1/token?grant_type=password',{email:id+'@mm-driver.invalid',password});}catch(error){if(error.status===400)throw Error('휴대폰 번호 또는 비밀번호가 일치하지 않습니다. 관리자에게 등록 번호를 확인하세요.');throw error;}
 if(started!==generation)throw Error('로그인이 취소됐습니다.');
 // Verify the server-side driver binding before persisting a login.
 try{const home=await request('/rest/v1/rpc/tms_driver_home',{},next.access_token);if(started!==generation)throw Error('로그인이 취소됐습니다.');save(next);return home;}catch(error){try{await request('/auth/v1/logout?scope=local',{},next.access_token);}catch{}throw error;}
}
export async function sendCode(phone){if(!config.enabled)throw Error('휴대폰 인증 연결 준비 중입니다.');await request('/auth/v1/otp',{phone:phoneE164(phone),create_user:true});}
export async function verifyCode(phone,code){if(!config.enabled)throw Error('인증 연결 준비 중입니다.');if(!/^\d{6}$/.test(code))throw Error('문자 인증번호 6자리를 입력하세요.');const started=++generation;const next=await request('/auth/v1/verify',{phone:phoneE164(phone),token:code,type:'sms'});if(started===generation)save(next);else throw Error('로그인이 취소됐습니다.');}
async function token(){
 if(!session)throw Error('기사 로그인이 필요합니다.');if(remember&&rememberedUntil()<=Date.now()){clear();throw Error('로그인 유지 기간이 끝났습니다. 다시 로그인하세요.');}if(session.expires_at>Date.now()+60000)return session.access_token;
 if(!refreshing){const started=generation;const renew=async()=>{if(started!==generation||!session)throw Error('로그아웃되었습니다.');if(remember){const current=JSON.parse(localStorage.getItem(KEY)||'null');if(!current){clear();throw Error('로그아웃되었습니다.');}session=current;if(session.expires_at>Date.now()+60000)return;}
 try{const next=await request('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token});if(started===generation)save(next);}catch(e){if(started===generation&&(e.status===400||e.status===401))clear();throw e;}};
 const locks=typeof navigator!=='undefined'?navigator.locks:null;refreshing=(locks?locks.request('mmtc-driver-session-refresh',renew):renew()).finally(()=>{refreshing=null;});}
 await refreshing;if(!session)throw Error('로그아웃되었습니다.');return session.access_token;
}
export async function rpc(name,args={}){if(!config.enabled)throw Error('기사 서비스 연결 준비 중입니다.');const started=generation;try{const accessToken=await token();if(started!==generation)throw Error('로그인이 변경됐습니다. 다시 조회하세요.');return await request('/rest/v1/rpc/'+name,args,accessToken);}catch(e){if(started===generation&&(e.status===401||e.status===403)){clear();}throw e;}}
export async function logout(){generation++;const old=session;clear();if(old)try{await request('/auth/v1/logout?scope=local',{},old.access_token);}catch{} }

if(typeof window!=='undefined')window.addEventListener('storage',event=>{if(event.key!==KEY||!remember)return;generation++;try{session=event.newValue?JSON.parse(event.newValue):null;}catch{session=null;}});
export async function uploadTaskPhoto(path,blob){if(!sessionOwner()||!path.startsWith(sessionOwner()+'/')||blob.type!=='image/jpeg'||blob.size>262144)throw Error('사진을 확인하세요.');const response=await fetch(config.url+'/storage/v1/object/driver-task-photos/'+path,{method:'POST',credentials:'omit',headers:{apikey:config.publishableKey,Authorization:'Bearer '+await token(),'Content-Type':'image/jpeg','x-upsert':'false'},body:blob,signal:AbortSignal.timeout(45000)});const result=await response.json();if(!response.ok&&response.status!==409&&result.statusCode!=='409')throw Error('사진 전송 실패 · 다시 제출하면 이어서 전송합니다.');}
