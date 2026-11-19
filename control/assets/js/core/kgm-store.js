import {workspaceRpc,supabaseMode} from './supabase-session.js';
export const readKgm=day=>workspaceRpc('tms_kgm_read',{p_day:day});
export const writeKgm=(action,data,request)=>workspaceRpc('tms_kgm_write',{p_action:action,p_data:data,p_request:request});
export function requireKgmServer(){if(!supabaseMode())throw Error('KGM 배차는 운영 계정으로 로그인한 뒤 사용할 수 있습니다.');}
