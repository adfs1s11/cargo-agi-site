import * as db from './db.js';
import {state,reloadAll} from './data.js';
import {uid,todayStr} from './utils.js';
import {workspaceProfile,supabaseMode} from './supabase-session.js';
import {safetyTemplate,SOURCE_KEY} from './vehicle-safety.js';
import {cleanPlanCells,normalizePlanPlate,planIssues,readPlan,exportPlanWorkbook} from './safety-plan-workbook.js';
export const canEditPlans=()=>!supabaseMode()||workspaceProfile()?.role==='admin';
export function latestVehiclePlan(documents,vehicleId){return documents.filter(d=>d.kind==='plan'&&d.vehicleId===vehicleId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id))[0]||null;}
export async function planSource(){const source=await db.get('meta',SOURCE_KEY);for(const f of source?.value?.files||[]){if(!/작업계획서/.test(f.name))continue;return Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0));}throw Error('표준양식·원본 관리에서 SDS 안전작업계획서 원본을 먼저 등록하세요.');}
export async function planDownload(record){if(!record?.plan?.workbookFields)throw Error('기존 작성 기록은 계획서 화면에서 내용을 확인하고 저장한 뒤 다운로드하세요.');return exportPlanWorkbook(await planSource(),record);}
export async function planEditorCells(record,equipment){
 if(record?.plan?.workbookFields)return cleanPlanCells(record.plan.workbookFields);
 const original=readPlan(await planSource(),'표준양식'),cells=original.cells,p=record?.plan||{};
 // Never treat examples or preset scores as actual checks.
 for(let r=45;r<=64;r++){cells['E'+r]='';cells['F'+r]='';}for(let r=68;r<=75;r++)cells['J'+r]='';
 Object.assign(cells,{H36:equipment.plateNo,F5:todayStr(),I5:'초안',C9:p.workName||'테슬라 차량 상·하차 및 운송',H9:record?.company||'M&M통운',C10:p.workplace||'',H10:p.period||'최초 양식 보고 · 별도 기간 없음',C11:p.method||'',C12:p.signal||'',C20:equipment.driverName||'',C31:p.cargoModel||'',C33:p.unitWeightKg||'',F33:p.units||'',C36:equipment.structure||'',C38:p.maxLoadKg||equipment.maxLoadKg||'',H38:p.maxUnits||equipment.capacity||'',B26:p.workSequence||cells.B26,B78:p.stopCriteria||cells.B78,B103:'제출처: 테슬라·삼성SDS / 최초 양식 보고 / 현장 확인 필요'});
 if(record){cells.C17=p.supervisor||'';cells.C23=p.training||'';cells.D85=p.safetyLead||'';cells.B89=p.emergency||cells.B89;const t=p.templateSnapshot||await safetyTemplate();for(const [i,h] of (t.hazards||[]).entries()){const a=p.risks?.[h.id]||{},r=45+i;Object.assign(cells,{['E'+r]:a.likelihood||'',['F'+r]:a.severity||'',['H'+r]:a.control||cells['H'+r],['K'+r]:a.responsible||cells['K'+r]});}for(const [i,e] of (t.essentials||[]).entries())cells['J'+(68+i)]=p.essentials?.[e.id]||'';}
 return cleanPlanCells(cells);
}
export async function savePlanDrafts(inputs,actorName){
 if(!canEditPlans())throw Error('계획서 수정·일괄 등록은 관리자 계정에서 가능합니다.');
 if(!String(actorName||'').trim())throw Error('등록·수정자 이름을 입력하세요.');
 if(!inputs.length||inputs.length>200)throw Error('저장할 계획서를 1~200개 선택하세요.');
 const template=await safetyTemplate();if(!template)throw Error('안전 표준양식을 먼저 등록하세요.');
 const seen=new Set(),stamp=new Date().toISOString(),rows=inputs.map(input=>{
  if(seen.has(input.vehicleId))throw Error('한 차량은 한 번에 한 계획서만 저장하세요.');seen.add(input.vehicleId);
  const eq=state.equipment.find(e=>e.id===input.vehicleId);if(!eq)throw Error('등록 차량을 확인하세요.');const cells=cleanPlanCells(input.cells);
  if(normalizePlanPlate(cells.H36)!==normalizePlanPlate(eq.plateNo))throw Error('계획서와 등록 차량번호가 다릅니다.');const issues=planIssues(cells);if(issues.length)throw Error(issues.join(' '));
  const id=uid('vsp'),snapshot={hazards:template.hazards,essentials:template.essentials,workSequence:template.workSequence,stopCriteria:template.stopCriteria};
  return {id,rootId:id,recordType:'vehicleSafety',kind:'plan',status:'draft',vehicleId:eq.id,plateNo:eq.plateNo,date:todayStr(),createdAt:stamp,inspector:String(actorName).trim(),company:String(cells.H9),templateId:template.id,templateVersion:template.version,vehicleSnapshot:{plateNo:eq.plateNo,structure:eq.structure||'',capacity:eq.capacity||0},photos:[],previousId:input.expectedId||'',note:'웹 계획서 초안 · 서명·현장 확인 전',plan:{workbookFields:cells,sourceNotes:String(input.sourceNotes||'').slice(0,20000),sourceFile:String(input.name||'웹 작성').slice(0,400),workName:cells.C9,workplace:cells.C10,period:cells.H10,method:[cells.C11,cells.H11].filter(Boolean).join('\n'),supervisor:cells.C17,safetyLead:cells.D85,emergency:cells.B89,workSequence:cells.B26,stopCriteria:cells.B78,cargoModel:cells.C31,unitWeightKg:cells.C33,units:cells.F33,maxLoadKg:cells.C38,maxUnits:cells.H38,signal:cells.C12,templateSnapshot:snapshot,risks:Object.fromEntries(template.hazards.map((h,i)=>[h.id,{likelihood:cells['E'+(45+i)],severity:cells['F'+(45+i)],control:cells['H'+(45+i)],responsible:cells['K'+(45+i)]}])),essentials:Object.fromEntries(template.essentials.map((e,i)=>[e.id,String(cells['J'+(68+i)]).replace('○','O')]))}};
 });
 const database=await db.openDb();await new Promise((resolve,reject)=>{
  const tx=database.transaction(['safety','equipment'],'readwrite'),s=tx.objectStore('safety'),request=s.getAll(),eqRequest=tx.objectStore('equipment').getAll();let all=null,equipment=null,error;
  tx.oncomplete=resolve;tx.onerror=()=>reject(error||tx.error);tx.onabort=()=>reject(error||tx.error||Error('저장 실패'));
  function apply(){if(!all||!equipment)return;try{for(let i=0;i<rows.length;i++){const row=rows[i],input=inputs[i],eq=equipment.find(e=>e.id===row.vehicleId),previous=latestVehiclePlan(all,row.vehicleId);if(!eq||normalizePlanPlate(eq.plateNo)!==normalizePlanPlate(row.plateNo))throw Error('차량 정보가 변경되었습니다. 다시 불러오세요.');if((previous?.id||'')!==(input.expectedId||''))throw Error(row.plateNo+' 계획서가 변경되었습니다. 미리보기를 다시 확인하세요.');if(previous){row.rootId=previous.rootId||previous.id;row.photos=[...(previous.photos||[])];row.supersedes=previous.id;}s.add(row);}}catch(e){error=e;tx.abort();}}
  request.onsuccess=()=>{all=request.result;apply();};eqRequest.onsuccess=()=>{equipment=eqRequest.result;apply();};
 });await reloadAll();return rows;
}
