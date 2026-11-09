export function customerEndpoint(config){
 if(config.provider==='supabase'){
  if(config.supabase?.url!=='https://wlrtwatqcspdroraeuni.supabase.co'||!config.cloud||!config.enabled)throw Error('고객 조회 연결을 준비 중입니다.');
  return config.supabase.url+'/functions/v1/customer-read';
 }
 if(!config.cloud||!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(config.endpoint||''))throw Error('고객 조회 연결을 준비 중입니다.');
 return config.endpoint;
}
