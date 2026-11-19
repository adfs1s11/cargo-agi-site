import {workspaceRpc} from './supabase-session.js';
import {gunzipSync,strFromU8} from '../../../vendor/fflate.js';
export const referenceList=()=>workspaceRpc('tms_dispatch_reference_list');
export const referenceSave=upload=>workspaceRpc('tms_dispatch_reference_save',{p_upload:upload});
export async function referenceSheet(id,name){const r=await workspaceRpc('tms_dispatch_reference_sheet',{p_id:id,p_name:name});const bytes=Uint8Array.from(atob(r.data),c=>c.charCodeAt(0));return JSON.parse(strFromU8(gunzipSync(bytes)));}
export function referenceParse(file){return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./dispatch-reference-worker.js',import.meta.url));const timer=setTimeout(()=>{worker.terminate();reject(Error('엑셀 분석 시간이 초과되었습니다. 파일 크기와 형식을 확인하세요.'));},90000);const finish=(fn,value)=>{clearTimeout(timer);worker.terminate();fn(value);};worker.onmessage=e=>e.data.ok?finish(resolve,e.data.upload):finish(reject,Error(e.data.error));worker.onerror=()=>finish(reject,Error('엑셀 분석기를 불러오지 못했습니다. 새로고침 후 다시 선택하세요.'));file.arrayBuffer().then(bytes=>worker.postMessage({name:file.name,bytes},[bytes])).catch(e=>finish(reject,e));});}
