import {workspaceRpc,supabaseMode} from './supabase-session.js';
import {setForwardingMode} from './workspace-access.js';
export async function loadForwardingAccess(){setForwardingMode(null);if(!supabaseMode())return null;try{const r=await workspaceRpc('tms_forwarding_access',{}, {timeoutMs:15000});setForwardingMode(r.mode);return r.mode;}catch(e){console.warn('포워딩 권한 확인:',e.message);return null;}}
export const readForwarding=args=>workspaceRpc('tms_forwarding_read',args);
export const saveForwarding=args=>workspaceRpc('tms_forwarding_save',args);
