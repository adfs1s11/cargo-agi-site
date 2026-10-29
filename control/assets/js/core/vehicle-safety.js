import * as db from './db.js';
import {uid,todayStr,addDays} from './utils.js';
import {state,reloadAll} from './data.js';
import {compressImage} from './photos.js';
import {inspectionResult,nextQuarterEnd} from './vehicle-safety-policy.js';
export const TEMPLATE_KEY='vehicleSafetyTemplates:v1', SOURCE_KEY='vehicleSafetySources:v1';
export const isVehicleSafety=r=>r?.recordType==='vehicleSafety';
export async function safetyTemplate(){return (await db.get('meta',TEMPLATE_KEY))?.value;}
export async function safetyDocuments(){return (await db.getAll('safety')).filter(isVehicleSafety).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
export function latestDocuments(rows){const roots=new Map();for(const r of [...rows].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)))if(['daily','periodic','plan'].includes(r.kind))roots.set(r.rootId||r.id,r);return [...roots.values()];}
export async function prepareSafetyPhotos(files=[],roles=[]){
  if(files.length>6)throw Error('사진은 한 번에 6장까지 등록하세요.');
  const photos=[];for(let i=0;i<files.length;i++){const f=files[i];if(!f.type.startsWith('image/'))throw Error('이미지 파일을 선택하세요.');const image=await compressImage(f,{maxWidth:1280,quality:.65,maxBytes:180000});if(image.bytes>200000)throw Error('사진 용량이 큽니다. 더 작은 사진을 선택하세요.');photos.push({id:uid('vsp'),ownerType:'vehicleSafety',dataUrl:image.dataUrl,bytes:image.bytes,originalName:f.name,role:roles[i]||'evidence',createdAt:new Date().toISOString()});}return photos;
}
async function writeDocument(row,photos=[],updateEquipment){
  const database=await db.openDb();
  await new Promise((resolve,reject)=>{const tx=database.transaction(['safety','photos','equipment'],'readwrite');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('안전기록 저장 취소'));
    tx.objectStore('safety').add(row);for(const photo of photos)tx.objectStore('photos').add({...photo,ownerId:row.id});
    if(updateEquipment){const s=tx.objectStore('equipment'),request=s.get(row.vehicleId);request.onsuccess=()=>{if(!request.result){tx.abort();return;}s.put(updateEquipment(request.result));};}
  });await reloadAll();return row;
}
export async function saveSafetyDocument(input,photos=[]){
  const template=await safetyTemplate(),eq=state.equipment.find(e=>e.id===input.vehicleId);
  if(!template)throw Error('안전 표준양식을 먼저 등록하세요.');if(!eq)throw Error('등록 차량을 선택하세요.');
  if(!String(input.inspector||'').trim())throw Error('실제 작성자 이름을 입력하세요.');
  nextQuarterEnd(input.date);if(input.date>todayStr())throw Error('미래 일자의 점검 결과는 등록할 수 없습니다.');
  if(!['daily','periodic','plan'].includes(input.kind))throw Error('기록 종류를 확인하세요.');
  const all=await safetyDocuments(),previous=input.previousId?all.find(r=>r.id===input.previousId):null;
  if(input.previousId&&(!previous||previous.vehicleId!==eq.id||previous.kind!==input.kind))throw Error('수정할 이전 기록을 확인하세요.');
  if(previous&&previous.status!=='draft')throw Error('제출된 기록은 수정할 수 없습니다. 재점검 또는 새 개정본으로 작성하세요.');
  if(previous&&latestDocuments(all).find(r=>(r.rootId||r.id)===(previous.rootId||previous.id))?.id!==previous.id)throw Error('다른 직원이 이미 새 초안을 저장했습니다. 목록을 갱신하세요.');
  const id=uid('vs'),row={...input,id,rootId:previous?.rootId||previous?.id||id,recordType:'vehicleSafety',createdAt:new Date().toISOString(),templateId:template.id,templateVersion:template.version,plateNo:eq.plateNo,vehicleSnapshot:{plateNo:eq.plateNo,structure:eq.structure||'',capacity:eq.capacity||0},photos:photos.map(p=>p.id)};
  row.status=input.status==='submitted'?'submitted':'draft';
  if(row.kind!=='plan'){
    row.items=structuredClone(template[row.kind]);row.result=inspectionResult(row.items,row.answers,{periodic:row.kind==='periodic',compliance:row.compliance});
    for(const item of row.items)if(['△','X'].includes(row.answers?.[item.id]?.value)&&!String(row.answers[item.id].note||'').trim())throw Error('주의·불량 항목의 이상 내용과 조치를 입력하세요.');
    if(row.status==='submitted'&&row.result.missing)throw Error('미입력 항목이 있습니다. 초안으로 저장하거나 모두 점검하세요.');
    if(row.kind==='periodic'&&row.status==='submitted'&&(!photos.some(p=>p.role==='front')||!photos.some(p=>p.role==='rear')))throw Error('정기점검은 차량 전면·후면 사진을 각각 첨부하세요.');
    row.validUntil=row.kind==='periodic'?nextQuarterEnd(row.date):'';row.conditionDue=row.result.outcome==='conditional'?addDays(row.date,14):'';
  }else{
    row.plan={...row.plan,templateSnapshot:{hazards:template.hazards,essentials:template.essentials,workSequence:template.workSequence,stopCriteria:template.stopCriteria}};
    const p=row.plan,units=Number(p.units),weight=Number(p.unitWeightKg),maxKg=Number(p.maxLoadKg),maxUnits=Number(p.maxUnits);
    if(row.status==='submitted'){
      for(const k of ['workplace','workName','method','period','supervisor','safetyLead','emergency','stopCriteria','workSequence'])if(!String(p[k]||'').trim())throw Error('작업계획서의 기본정보·책임자·비상연락·작업순서·중지기준을 입력하세요.');
      if(![units,weight,maxKg,maxUnits].every(n=>Number.isFinite(n)&&n>0)||!Number.isInteger(units)||!Number.isInteger(maxUnits))throw Error('상품차량 중량·대수와 장비 최대중량·적재대수를 확인하세요.');
      if(units>maxUnits||units*weight>maxKg||(eq.capacity&&units>Number(eq.capacity)))throw Error('계획 적재량이 장비 한도를 초과합니다.');
      for(const h of template.hazards){const a=p.risks?.[h.id];if(!a||![1,2,3].includes(Number(a.likelihood))||![1,2,3].includes(Number(a.severity))||!String(a.control||'').trim()||!String(a.responsible||'').trim())throw Error('위험성평가의 가능성·중대성·대책·담당자를 모두 입력하세요.');}
      for(const item of template.essentials)if(p.essentials?.[item.id]!=='O')throw Error('필수 안전조치를 모두 확인한 뒤 제출하세요. 미조치는 초안으로 보관하세요.');
    }
  }
  return writeDocument(row,photos,row.result?.critical.length?e=>({...e,vehicleSafetyHold:{...(e.vehicleSafetyHold||{}),active:true,cases:[...new Set([...(e.vehicleSafetyHold?.cases||[]),row.rootId])],updatedAt:row.createdAt}}):null);
}
export async function recordSafetyEvent(input,photos=[]){
  const docs=await safetyDocuments(),target=docs.find(d=>d.id===input.targetId);
  if(!target||!String(input.inspector||'').trim())throw Error('대상 기록과 확인자 이름이 필요합니다.');
  if(!['review','correction','release'].includes(input.kind))throw Error('확인 종류를 확인하세요.');
  const row={...input,id:uid('vse'),recordType:'vehicleSafety',vehicleId:target.vehicleId,plateNo:target.plateNo,date:todayStr(),createdAt:new Date().toISOString(),photos:photos.map(p=>p.id)};
  let update=null;
  if(input.kind==='review'){
    if(target.status!=='submitted')throw Error('제출된 문서만 검토할 수 있습니다.');
    const stages=target.kind==='plan'?['review','approve','external']:['review'];if(!stages.includes(input.stage))throw Error('검토 단계를 확인하세요.');
    const events=docs.filter(d=>d.kind==='review'&&d.targetId===target.id);
    const at=stages.indexOf(input.stage);if(at>0&&!events.some(d=>d.stage===stages[at-1]))throw Error('앞 단계의 검토·승인 기록이 필요합니다.');
    if(input.stage==='external'&&!String(input.note||'').trim())throw Error('SDS 확인 근거·일자를 기록하세요.');
    if(events.some(d=>d.stage===input.stage))throw Error('이미 기록된 확인 단계입니다.');
    if(target.kind==='periodic'&&input.stage==='review')update=e=>({...e,vehicleSafetyPeriodic:e.vehicleSafetyPeriodic?.date>target.date || (e.vehicleSafetyPeriodic?.date===target.date && e.vehicleSafetyPeriodic?.sourceCreatedAt>target.createdAt)?e.vehicleSafetyPeriodic:{documentId:target.id,date:target.date,sourceCreatedAt:target.createdAt,outcome:target.result.outcome,validUntil:target.validUntil,conditionDue:target.conditionDue}});
  }
  if(input.kind==='correction'&&(!String(input.note||'').trim()||!photos.length))throw Error('시정조치 내용과 증빙 사진을 입력하세요.');
  if(input.kind==='release'){
    const recheck=docs.find(d=>d.id===input.recheckId),review=docs.find(d=>d.kind==='review'&&d.targetId===recheck?.id&&d.stage==='review');
    if(!recheck||recheck.vehicleId!==target.vehicleId||recheck.kind!==target.kind||recheck.status!=='submitted'||recheck.recheckOf!==target.id||recheck.result?.outcome!=='pass'||recheck.date<target.date||!review)throw Error('같은 차량·종류의 양호한 재점검과 검토 확인이 필요합니다.');
    if(!docs.some(d=>d.kind==='correction'&&d.targetId===target.id))throw Error('시정조치와 증빙을 먼저 등록하세요.');
    if(!String(input.note||'').trim())throw Error('출입제한 해제에 대한 SDS 확인 근거를 입력하세요.');
    update=e=>{const cases=(e.vehicleSafetyHold?.cases||[]).filter(id=>id!==(target.rootId||target.id));return {...e,vehicleSafetyHold:{...e.vehicleSafetyHold,active:cases.length>0,cases,updatedAt:row.createdAt}};};
  }
  return writeDocument(row,photos,update);
}
// Source workbook contents remain in the authenticated shared workspace, never in public assets.
export async function installSafetyWorkbooks(files){
  if(files.length!==2)throw Error('안전점검·안전작업계획서 원본 두 파일을 함께 선택하세요.');
  if(!globalThis.XLSX)throw Error('엑셀 읽기 기능을 불러오지 못했습니다. 새로고침하세요.');
  const parsed=[],originals=[];for(const f of files){if(f.size>2000000)throw Error('원본 파일은 각 2MB 이하만 등록할 수 있습니다.');const bytes=new Uint8Array(await f.arrayBuffer()),book=XLSX.read(bytes,{type:'array'});parsed.push(book);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');originals.push({name:f.name,mime:f.type||'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',sha256:hash,base64:btoa(binary)});}
  const inspection=parsed.find(b=>b.Sheets['양식1_일일작업전점검']),plan=parsed.find(b=>b.Sheets['안전작업계획서']);if(!inspection?.Sheets['양식2_정기점검표']||!plan)throw Error('제공된 SDS 표준양식의 시트 이름을 확인하세요.');
  const cell=(s,a)=>String(s[a]?.v??'').trim(),d=inspection.Sheets['양식1_일일작업전점검'],p=inspection.Sheets['양식2_정기점검표'],w=plan.Sheets['안전작업계획서'];
  const template={id:'sds-'+originals.map(f=>f.sha256.slice(0,12)).sort().join('-'),version:1,label:'SDS 카캐리어 표준양식',sourceFiles:originals.map(f=>f.name),daily:Array.from({length:23},(_,i)=>({id:'d'+(i+1),group:cell(d,'C'+(i+9)),label:cell(d,'D'+(i+9)),criterion:cell(d,'E'+(i+9)),critical:cell(d,'F'+(i+9))==='★'})),periodic:Array.from({length:13},(_,i)=>({id:'p'+(i+1),group:'정기점검',label:cell(p,'C'+(i+18)),criterion:cell(p,'C'+(i+18)),critical:cell(p,'D'+(i+18))==='★'})),hazards:Array.from({length:17},(_,i)=>({id:'h'+(i+1),stage:cell(w,'B'+(i+45)),hazard:cell(w,'C'+(i+45)),control:cell(w,'H'+(i+45)),responsible:cell(w,'K'+(i+45))})),essentials:Array.from({length:8},(_,i)=>({id:'e'+(i+1),label:cell(w,'C'+(i+68))})),workSequence:cell(w,'B26'),stopCriteria:cell(w,'B78'),roles:['관리감독자','작업지휘자','신호수(유도자)','운전자','운전자(2인1조)','보조작업자']};
  if([...template.daily,...template.periodic,...template.essentials].some(i=>!i.label)||template.hazards.some(i=>!i.hazard)||!template.stopCriteria)throw Error('표준양식 항목 위치가 다릅니다. 양식을 검토한 후 등록하세요.');
  const previous=await db.get('meta',TEMPLATE_KEY),previousSource=await db.get('meta',SOURCE_KEY),database=await db.openDb();await new Promise((resolve,reject)=>{const tx=database.transaction('meta','readwrite'),s=tx.objectStore('meta');if(previous)s.add({key:'vehicleSafetyTemplateArchive:'+uid('archive'),value:previous.value});if(previousSource)s.add({key:'vehicleSafetySourceArchive:'+uid('archive'),value:previousSource.value});s.put({key:TEMPLATE_KEY,value:template});s.put({key:SOURCE_KEY,value:{files:originals}});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});return template;
}
