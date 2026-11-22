import * as db from './db.js';
import {workspaceProfile,supabaseMode} from './supabase-session.js';
import {TRAINING_PREFIX} from './training-model.js';
import {PLAN_COMMON_KEY} from './safety-plan-common.js';
export const TRAINING_DEFAULT_KEY='vehicleSafetyEducationDefaults:v1';
export const trainingDefault=async()=>(await db.get('meta',TRAINING_DEFAULT_KEY))?.value||{};
const normal=v=>String(v||'').replace(/\s/g,'');
export function signatureBytes(signature){
 if(!signature||!signature.name||signature.mime!=='image/png'||typeof signature.base64!=='string'||signature.base64.length>280000||!/^[A-Za-z0-9+/]+={0,2}$/.test(signature.base64))throw Error('등록한 PNG 서명 정보를 확인하세요.');
 const bytes=Uint8Array.from(atob(signature.base64),c=>c.charCodeAt(0));if(bytes.length<32||![137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))throw Error('PNG 서명 파일을 확인하세요.');
 const view=new DataView(bytes.buffer),width=view.getUint32(16),height=view.getUint32(20);if(!width||!height||width*height>4000000||width!==signature.width||height!==signature.height)throw Error('서명 이미지 크기를 확인하세요.');return bytes;
}
export async function preparePlanSignature(file){
 if(!file||file.size>200000||!/\.png$/i.test(file.name))throw Error('200KB 이하 PNG 서명을 선택하세요.');const common=(await db.get('meta',PLAN_COMMON_KEY))?.value,name=String(common?.cells?.D85||'').trim();if(!name)throw Error('공통 담당자에서 안전보건관리책임자를 먼저 등록하세요.');
 const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(const b of bytes)binary+=String.fromCharCode(b);const view=new DataView(bytes.buffer),signature={name,role:'safetyLead',mime:'image/png',base64:btoa(binary),width:bytes.length>=24?view.getUint32(16):0,height:bytes.length>=24?view.getUint32(20):0,originalName:file.name,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('')};signatureBytes(signature);return signature;
}
export async function saveTrainingDefault(patch){
 if(supabaseMode()&&workspaceProfile()?.role!=='admin')throw Error('관리자만 공통 교육·서명을 설정할 수 있습니다.');const value={...await trainingDefault()};
 if(Object.hasOwn(patch,'trainingId')){if(patch.trainingId){const record=(await db.get('meta',TRAINING_PREFIX+patch.trainingId))?.value;if(!record||record.state==='cancelled')throw Error('기본 교육을 다시 조회하세요.');}value.trainingId=patch.trainingId;}
 if(Object.hasOwn(patch,'signature')){if(patch.signature){signatureBytes(patch.signature);const common=(await db.get('meta',PLAN_COMMON_KEY))?.value;if(normal(common?.cells?.D85)!==normal(patch.signature.name))throw Error('서명자와 공통 안전보건관리책임자가 다릅니다.');}value.signature=patch.signature;}
 value.updatedAt=new Date().toISOString();value.updatedBy=workspaceProfile()?.name||'관리자';await db.put('meta',{key:TRAINING_DEFAULT_KEY,value});return value;
}
export async function currentPlanSignature(cells){const s=(await trainingDefault()).signature;if(!s)return null;if(normal(s.name)!==normal(cells.D85))throw Error('안전보건관리책임자가 변경됐습니다. 공통 서명을 다시 등록하세요.');return s;}
