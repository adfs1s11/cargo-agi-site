import {workspaceRpc,workspaceProfile,workspaceSession,supabaseMode} from './supabase-session.js';
import {supabaseReviewBasis} from './supabase-cloud.js';
import {getAll} from './db.js';
const cache=new Map();
export function closingFlags(closings,from,to){const map=new Map();for(const c of closings){if(c.status!=='closed'||!['','sale','purchase'].includes(c.side||''))continue;for(const e of c.entries||[]){if(!e.orderId||e.date<from||e.date>to)continue;const flags=map.get(e.orderId)||{sale:false,purchase:false};if(!c.side||c.side==='sale')flags.sale=true;if(!c.side||c.side==='purchase')flags.purchase=true;map.set(e.orderId,flags);}}return map;}
export async function loadClosingStatus(from,to){
 if(!from||!to)return new Map();if(!supabaseMode())return closingFlags(await getAll('closings'),from,to);
 const profile=workspaceProfile(),nonce=workspaceSession()?.nonce;if(!['admin','dispatch','settlement'].includes(profile?.role)||!nonce)throw Error('마감 상태 조회 권한을 확인하세요.');
 const {revision}=supabaseReviewBasis(),key=JSON.stringify([profile.id,profile.accessRevision,nonce,revision,from,to]);
 if(!cache.has(key)){const pending=(async()=>{let after='',map=new Map();do{const result=await workspaceRpc('tms_dispatch_closing_status',{p_from:from,p_to:to,p_revision:revision,p_after:after,p_limit:2000});if(result.revision!==revision||!Array.isArray(result.rows))throw Error('마감 상태 대조 실패');for(const r of result.rows)map.set(r.orderId,{sale:r.sale===true,purchase:r.purchase===true});if(result.next&&result.next<=after)throw Error('마감 상태 조회 순서 오류');after=result.next;}while(after);return map;})();cache.set(key,pending);pending.catch(()=>cache.delete(key));if(cache.size>6)cache.delete(cache.keys().next().value);}
 const result=await cache.get(key);if(workspaceSession()?.nonce!==nonce||workspaceProfile()?.id!==profile.id||supabaseReviewBasis().revision!==revision)throw Error('자료가 변경됐습니다. 다시 조회하세요.');return result;
}
