export const RECOVERY_REDIRECT='https://cargo-agi.com/control/supabase-pilot/reset.html';
export async function requestPasswordRecovery(email,config,request=fetch){
 const address=String(email||'').trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))throw Error('회사 이메일을 입력해 주세요. ADMIN 공용 아이디는 사용할 수 없습니다.');
 if(config?.url!=='https://wlrtwatqcspdroraeuni.supabase.co'||!config.publishableKey)throw Error('로그인 연결 설정을 확인할 수 없습니다.');
 const response=await request(config.url+'/auth/v1/recover?redirect_to='+encodeURIComponent(RECOVERY_REDIRECT),{
  method:'POST',credentials:'omit',cache:'no-store',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},
  body:JSON.stringify({email:address}),signal:AbortSignal.timeout(30000)
 });
 if(!response.ok)throw Error(response.status===429?'요청이 많습니다. 잠시 후 다시 시도해 주세요.':'재설정 메일을 보내지 못했습니다. 관리자에게 메일 발송 설정 확인을 요청해 주세요.');
 return '등록된 이메일이면 재설정 메일이 발송됩니다. 받은편지함과 스팸함을 확인해 주세요.';
}
