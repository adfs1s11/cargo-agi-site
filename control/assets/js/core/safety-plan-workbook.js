import {addPlanSignature}from './signature-workbook.js';
import {TRAINING_FIELDS,TRAINING_LABELS} from './training-model.js';
import {normalizedCheck} from './essential-checks.js';
import {fillEducationSheet} from './education-workbook.js';
import {safetyLoadCheck,SAFETY_LOAD_EXCEL,SAFETY_LOAD_NOTICE,SAFETY_LOAD_SOURCE} from './safety-load.js';
import {completePlanReport,planTransportWeight,planDriverName,PRODUCT_PLAN_CELLS,PRODUCT_PLAN_LABELS} from './safety-plan-catalog.js';
import {EQUIPMENT_SAFETY_FIELDS} from './equipment-safety.js';
import {VARIANT_CELLS,SOP_CELLS,SOP_DEFAULTS,VARIANT_LABELS,VARIANT_SAMPLES,sopHeader,inferPlanVariant} from './safety-plan-variants.js';
import {REGISTRATION_FIELDS} from './vehicle-registration.js';
import {unzipSync,zipSync,strFromU8,strToU8} from '../../../vendor/fflate.js';

export const PLAN_SHEET='안전작업계획서';
export const normalizePlanPlate=v=>String(v??'').replace(/\s/g,'');
export const PLAN_GROUPS=[
 ['기본정보',[['C5','문서번호'],['F5','작성일'],['I5','개정'],['C9','작업명'],['H9','운송사'],['C10','작업장소'],['H10','작업기간'],['C11','작업내용'],['H11','작업방법'],['C12','신호방법'],['H12','담당 부서'],['C13','제한속도·적용 기준']]],
 ['참여 인원·교육',[...['관리감독자','작업지휘자','신호수','운전자','두 번째 운전자','보조작업자'].flatMap((role,i)=>[['C','이름'],['E','연락처'],['G','소속·직위'],['I','교육'],['J','보호구'],['K','자격']].map(([c,l])=>[c+(17+i),role+' '+l])),['C23','교육 확인'],['B26','작업 순서']]],
 ['상품차량·장비 제원',[['C31','상품차량 모델'],['H31','화물 형태'],['C32','치수·제원'],['H32','특이사항'],['C33','상품차량 1대 중량 (kg)','number'],['F33','적재 대수 (장비 최대 적재 대수 자동 반영)','integer'],['C36','장비 구조'],['C37','장비 모델·연식'],['H37','피견인차량 번호'],['C38','최대 적재중량 (kg)','number'],['H38','최대 적재 대수','integer'],['C39','인양·낙하·추락방지 장치'],['H39','면허·자격'],['C40','보험'],['H40','자동차검사'],['C41','장비 점검 결과'],['H41','장비 점검일']]],
 ['작업 중지·비상연락',[['B78','작업 중지 기준'],...['삼성SDS','M&M 관리감독자','안전책임자','소방·구급','테슬라','병원'].flatMap((role,i)=>[['D','담당자'],['G','전화'],['I','비고']].map(([c,l])=>[c+(83+i),role+' '+l])),['B89','비상 대응 순서'],['B92','배치도·작업동선 설명'],['B103','제출처·비고']]],
];
const baseCells=PLAN_GROUPS.flatMap(([,fields])=>fields.map(([a])=>a));
export const PLAN_CELLS=[...TRAINING_FIELDS,...PRODUCT_PLAN_CELLS,...VARIANT_CELLS,...baseCells,'H36',...Array.from({length:20},(_,i)=>['B','C','E','F','H','K'].map(c=>c+(45+i))).flat(),...Array.from({length:8},(_,i)=>'J'+(68+i))];
const allowed=new Set(PLAN_CELLS);
export function cleanPlanCells(cells){
 const numeric=new Set(['C33','F33','C38','H38',...Array.from({length:20},(_,i)=>['E'+(45+i),'F'+(45+i)]).flat()]);
 const out={};for(const a of PLAN_CELLS){const v=cells?.[a]??'';if(!['string','number','boolean'].includes(typeof v))throw Error('셀 값 형식을 확인하세요: '+a);if(String(v).length>12000)throw Error('입력 내용이 너무 깁니다: '+a);out[a]=typeof v==='number'?v:String(v).trim();if(numeric.has(a)&&out[a]!==''&&Number.isFinite(Number(out[a])))out[a]=Number(out[a]);}out.C20=planDriverName(out.C20);out.C21=planDriverName(out.C21);for(let r=68;r<=75;r++)out['J'+r]=normalizedCheck(out['J'+r]);return completePlanReport(out);
}
export function planIssues(cells){
 const issues=[];const inferred=inferPlanVariant({},cells);if(cells.PLAN_VARIANT&&inferred&&cells.PLAN_VARIANT!==inferred)issues.push('장비 구조와 계획서 유형이 다릅니다. 차량 유형을 확인하세요.');if(!['','loader','other'].includes(String(cells.PLAN_VARIANT||'')))issues.push('계획서 차량 유형을 확인하세요.');if(!['','sample','field'].includes(String(cells.RISK_BASIS||'')))issues.push('위험성평가 구분을 확인하세요.');for(let r=7;r<=19;r++)if(!['','O','○','△','X'].includes(String(cells['SOP_G'+r]||'')))issues.push('작업절차 확인은 O/△/X 또는 빈칸입니다.');for(const [,fields] of PLAN_GROUPS)for(const [a,label,type] of fields)if(type&&cells[a]!==''&&cells[a]!=null){const n=Number(cells[a]);if(!Number.isFinite(n)||n<=0||(type==='integer'&&!Number.isInteger(n)))issues.push(label+'은 양수'+(type==='integer'?' 정수':'')+'로 입력하세요.');}
 for(let i=45;i<=64;i++)for(const c of ['E','F'])if(cells[c+i]!==''&&cells[c+i]!=null&&![1,2,3].includes(Number(cells[c+i])))issues.push(i+'행 위험도는 1~3점입니다.');
 for(let i=68;i<=75;i++)if(!['','O','○','△','X'].includes(String(cells['J'+i]??'')))issues.push(i+'행 안전조치는 O/△/X 또는 빈칸입니다.');
 return issues;
}
export function loadCheck(c){return safetyLoadCheck({unitWeightKg:c.C33,units:c.F33,maxLoadKg:c.C38,maxUnits:c.H38});}

// Reject large/ZIP64 members before fflate allocates decompression buffers.
export function unpack(bytes,{maxBytes=24000000,maxEntries=500}={}){
 if(bytes.length>maxBytes)throw Error('파일 용량이 너무 큽니다.');let total=0,count=0;
 return unzipSync(bytes,{filter:f=>{if(++count>maxEntries||f.originalSize>maxBytes||f.size>maxBytes||(total+=f.originalSize)>maxBytes||/^(\/|[A-Za-z]:)|(^|\/)\.\.(\/|$)/.test(f.name))throw Error('압축파일의 크기 또는 경로를 확인하세요.');return true;}});
}
export function readPlan(bytes,name){
 unpack(bytes);if(!globalThis.XLSX)throw Error('엑셀 읽기 기능을 불러오지 못했습니다.');
 const book=globalThis.XLSX.read(bytes,{type:'array',cellFormula:true}),sheet=book.Sheets[PLAN_SHEET];if(!sheet)throw Error('SDS 안전작업계획서 시트가 없습니다.');
 const cells={};for(const a of PLAN_CELLS){const source=a.startsWith('SOP_')?book.Sheets['작업절차(SOP)']:sheet,key=a.replace(/^SOP_/,'');if(source?.[key]?.f&&!(a==='F33'&&['H38','IF(H38="","",H38)'].includes(source[key].f)))throw Error('입력 칸의 수식은 지원하지 않습니다: '+a);cells[a]=source?.[key]?.v??'';}
 cells.SOP_READY=book.Sheets['작업절차(SOP)']?'1':'';
 const noteSheet=book.Sheets['웹 저장 확인사항'];const meta={};for(let r=1;r<=120;r++){const key=noteSheet?.['A'+r]?.v;if(key)meta[key]=noteSheet?.['B'+r]?.v;}cells.PLAN_VARIANT=Object.keys(VARIANT_LABELS).find(k=>VARIANT_LABELS[k]===meta['계획서 유형'])||inferPlanVariant({},cells);cells.RISK_BASIS=String(sheet.B43?.v||'').includes('샘플')?'sample':meta['위험성평가 상태']==='현장 재평가 입력 · 승인 별도'?'field':'';
 const extra=book.Sheets['차량별확인사항'],webNotes=book.Sheets['웹 저장 확인사항'];const notes=extra?Array.from({length:80},(_,i)=>[extra['A'+(i+1)]?.v,extra['B'+(i+1)]?.v].filter(v=>v!=null).join(': ')).filter(Boolean).join('\n'):String(webNotes?.B5?.v||'');
 for(const key of TRAINING_FIELDS)cells[key]=meta[TRAINING_LABELS[key]]??'';
 for(const key of PRODUCT_PLAN_CELLS)cells[key]=meta[PRODUCT_PLAN_LABELS[key]]??'';
 const standard=cells.RISK_BASIS!=='sample'&&/표준안|재평가/.test(String(sheet.B43?.v||''));if(standard)for(let r=45;r<=64;r++){cells['E'+r]='';cells['F'+r]='';}
 return {name,cells:cleanPlanCells(cells),sourceNotes:notes.slice(0,20000),warnings:standard?['원본 예시 위험도 점수는 제외했습니다. 현장에서 다시 평가하세요.']:[]};
}
export async function readPlanFiles(files){
 if(!files.length||files.length>200)throw Error('엑셀 또는 ZIP 파일을 1~200개 선택하세요.');let total=0;const rows=[];
 for(const file of files){total+=file.size;if(total>24000000)throw Error('한 번에 24MB까지 선택하세요.');const bytes=new Uint8Array(await file.arrayBuffer());
  if(/\.zip$/i.test(file.name)){const entries=unpack(bytes,{maxBytes:24000000,maxEntries:250});for(const [name,data] of Object.entries(entries)){if(!/\.xlsx$/i.test(name))continue;if(rows.length>=200)throw Error('한 번에 200개 계획서까지 등록하세요.');try{rows.push(readPlan(data,name));}catch(e){rows.push({name,error:e.message});}await new Promise(resolve=>setTimeout(resolve,0));}}
  else{try{rows.push(readPlan(bytes,file.name));}catch(e){rows.push({name:file.name,error:e.message});}}
 }
 if(!rows.length)throw Error('등록할 엑셀 계획서가 없습니다.');return rows;
}
export function matchPlanImports(rows,equipment,documents){
 const counts=new Map();for(const r of rows){const p=normalizePlanPlate(r.cells?.H36);if(p)counts.set(p,(counts.get(p)||0)+1);}
 return rows.map(r=>{if(r.error)return r;const plate=normalizePlanPlate(r.cells.H36),matches=equipment.filter(e=>normalizePlanPlate(e.plateNo)===plate),errors=planIssues(r.cells);if(!plate)errors.push('차량번호 H36이 비어 있습니다.');if(matches.length!==1)errors.push(matches.length?'등록 명부에 같은 차량번호가 여러 개입니다.':'등록되지 않은 차량번호입니다.');if(counts.get(plate)>1)errors.push('선택 파일에 같은 차량번호가 중복됩니다.');const e=matches[0],latest=e?documents.filter(d=>d.kind==='plan'&&d.vehicleId===e.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]:null;return {...r,vehicleId:e?.id,plate:e?.plateNo||plate,expectedId:latest?.id||'',error:errors.join(' '),warnings:[...(r.warnings||[]),...(loadCheck(r.cells)==='초과-작업불가'?['적재한도 초과 · 작업불가']:[])]};});
}
const XMLNS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
function parse(bytes){const doc=new DOMParser().parseFromString(strFromU8(bytes),'application/xml');if(doc.getElementsByTagName('parsererror').length)throw Error('엑셀 XML 형식 오류');return doc;}
function xml(doc){return strToU8(new XMLSerializer().serializeToString(doc));}
const elements=(node,name)=>Array.from(node.getElementsByTagNameNS(XMLNS,name));
function writeCell(doc,address,value,formula){
 const sheetData=elements(doc,'sheetData')[0];if(!sheetData)throw Error('양식 데이터 영역이 없습니다.');
 let cell=elements(sheetData,'c').find(c=>c.getAttribute('r')===address);
 if(!cell){const rowNo=address.match(/\d+$/)[0];let row=elements(sheetData,'row').find(r=>r.getAttribute('r')===rowNo);if(!row){row=doc.createElementNS(XMLNS,'row');row.setAttribute('r',rowNo);sheetData.insertBefore(row,elements(sheetData,'row').find(r=>Number(r.getAttribute('r'))>Number(rowNo))||null);}cell=doc.createElementNS(XMLNS,'c');cell.setAttribute('r',address);const col=s=>s.match(/^[A-Z]+/)[0].split('').reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);row.insertBefore(cell,elements(row,'c').find(c=>col(c.getAttribute('r'))>col(address))||null);}
 for(const child of Array.from(cell.childNodes))cell.removeChild(child);cell.removeAttribute('t');
 if(formula){const f=doc.createElementNS(XMLNS,'f');f.textContent=formula;cell.appendChild(f);if(typeof value!=='number')cell.setAttribute('t','str');const v=doc.createElementNS(XMLNS,'v');v.textContent=String(value??'');cell.appendChild(v);}
 else if(typeof value==='number'&&Number.isFinite(value)){const v=doc.createElementNS(XMLNS,'v');v.textContent=String(value);cell.appendChild(v);}
 else{cell.setAttribute('t','inlineStr');const is=doc.createElementNS(XMLNS,'is'),t=doc.createElementNS(XMLNS,'t');t.setAttribute('xml:space','preserve');t.textContent=String(value??'');is.appendChild(t);cell.appendChild(is);}
}
export function exportPlanWorkbook(sourceBytes,record){
 const entries=unpack(sourceBytes),book=parse(entries['xl/workbook.xml']),rels=parse(entries['xl/_rels/workbook.xml.rels']);
 const sheet=elements(book,'sheet').find(s=>s.getAttribute('name')===PLAN_SHEET);if(!sheet)throw Error('보관된 원본에 안전작업계획서 시트가 없습니다.');
 const rel=Array.from(rels.documentElement.childNodes).filter(n=>n.nodeType===1).find(r=>r.getAttribute('Id')===sheet.getAttribute('r:id'));if(!rel)throw Error('원본 시트 연결 오류');const target=rel.getAttribute('Target'),sheetPath=target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');
 if(!entries[sheetPath]||target.includes('..'))throw Error('원본 시트 경로 오류');const doc=parse(entries[sheetPath]),cells=cleanPlanCells(record.plan.workbookFields);cells.H36=record.plateNo;
 for(const a of allowed){if(!/^[A-Z]+\d+$/.test(a))continue;if(/^C(6[89]|7[0-5])$/.test(a)&&!cells[a])continue;writeCell(doc,a,/^J(6[89]|7[0-5])$/.test(a)&&cells[a]==='O'?'○':cells[a]);}
 for(const a of ['H3','I3','J3','K3'])writeCell(doc,a,'');
 writeCell(doc,'B2','안전작업계획서 · '+(record.status==='draft'?'검토용 초안':'제출 기록 · 승인 별도 확인'));
 writeCell(doc,'B43',cells.RISK_BASIS==='sample'?'4. 위험성평가·예방대책 (유형별 샘플 점수 · 현장 재평가 전)':'4. 위험성평가·예방대책 (빈 점수는 미평가 · 승인 별도)');
 writeCell(doc,'F33',cells.F33,'IF(H38="","",H38)');
 writeCell(doc,'H33',planTransportWeight(cells), 'IF(OR(C33="",F33=""),"",C33*F33)');
 writeCell(doc,'K33',loadCheck(cells),SAFETY_LOAD_EXCEL);const loadRow=elements(doc,'row').find(r=>Number(r.getAttribute('r'))===33);if(loadRow){loadRow.setAttribute('ht',String(Math.max(60,Number(loadRow.getAttribute('ht'))||0)));loadRow.setAttribute('customHeight','1');}
 for(let r=45;r<=64;r++){const n=Number(cells['E'+r])*Number(cells['F'+r]);writeCell(doc,'G'+r,n?`${n} (${n>=6?'상':n>=3?'중':'하'})`:'',`IF(OR(E${r}="",F${r}=""),"",E${r}*F${r}&" ("&IF(E${r}*F${r}>=6,"상",IF(E${r}*F${r}>=3,"중","하"))&")")`);}
 if(record.vehicleSnapshot?.equipmentSafety){const r=elements(doc,'row').find(r=>r.getAttribute('r')==='39');if(r){const lines=String(cells.C39||'').split('\n').reduce((n,s)=>n+Math.max(1,Math.ceil(s.length/30)),0);r.setAttribute('ht',String(Math.max(Number(r.getAttribute('ht'))||0,lines*15+8)));r.setAttribute('customHeight','1');}}
 writeCell(doc,'B39','인양·낙하·\n추락방지 장치');writeCell(doc,'B41','장비점검\n최근판정');writeCell(doc,'G41','장비 점검일');
 for(const rowNo of [10,31,32,37,39,41]){const row=elements(doc,'row').find(r=>Number(r.getAttribute('r'))===rowNo);if(!row)continue;const lines=Math.max(...['C','H'].map(c=>String(cells[c+rowNo]||'').split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/30)),0)));row.setAttribute('ht',String(Math.min(409,Math.max(Number(row.getAttribute('ht'))||0,lines*15+8))));row.setAttribute('customHeight','1');}
 writeCell(doc,'B103',String(cells.B103||'')+' / 웹 저장본 · 현장 확인 및 기타 결재 별도');if(record.plan.signatureSnapshot){if(String(record.plan.signatureSnapshot.name).replace(/\s/g,'')!==String(cells.D85).replace(/\s/g,''))throw Error('계획서 책임자와 서명자가 다릅니다.');writeCell(doc,'I2','안전보건관리\n책임자(검토)');addPlanSignature(entries,sheetPath,doc,record.plan.signatureSnapshot);}if(record.plan.supervisorSignatureSnapshot){const sig=record.plan.supervisorSignatureSnapshot;if(String(sig.name).replace(/\s/g,'')!==String(cells.C17).replace(/\s/g,''))throw Error('안전관리자와 서명자가 다릅니다.');writeCell(doc,'H2','작성\n(안전관리자·관리감독자)');addPlanSignature(entries,sheetPath,doc,sig);}entries[sheetPath]=xml(doc);
 // Populate the original SOP without replacing its styles, merges or print layout.
 const resolveSheet=name=>{const node=elements(book,'sheet').find(x=>x.getAttribute('name')===name);if(!node)return null;const link=Array.from(rels.documentElement.childNodes).find(x=>x.nodeType===1&&x.getAttribute('Id')===node.getAttribute('r:id'));const target=link?.getAttribute('Target');if(!target||target.includes('..'))throw Error('시트 연결 오류: '+name);return target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');};
 const sopPath=resolveSheet('작업절차(SOP)');if(!sopPath)throw Error('원본에 작업절차(SOP) 시트가 없습니다. 표준양식을 확인하세요.');
 const sopDoc=parse(entries[sopPath]);
 for(const address of SOP_CELLS){const value=cells.SOP_READY==='1'||cells.PLAN_VARIANT?cells[address]:(cells[address]||(!address.startsWith('SOP_G')?SOP_DEFAULTS[address]||'':''));writeCell(sopDoc,address.slice(4),value);}
 for(const [address,value] of Object.entries(sopHeader(cells)))writeCell(sopDoc,address,value);
 const sopLines=String(sopHeader(cells).B21).split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil([...line].reduce((w,c)=>w+(/[^\x00-\x7f]/.test(c)?2:1),0)/105)),0);
 for(const [rowNo,height] of [[3,32],[4,42],[21,Math.min(409,Math.max(124,sopLines*15+10))]]){const row=elements(sopDoc,'row').find(r=>Number(r.getAttribute('r'))===rowNo);if(row){row.setAttribute('ht',height);row.setAttribute('customHeight','1');}}
 entries[sopPath]=xml(sopDoc);
 const educationPath=resolveSheet('교육확인서');if(!educationPath)throw Error('원본 양식에 교육확인서 시트가 없습니다. 최신 표준양식을 등록하세요.');const educationDoc=parse(entries[educationPath]),educationLast=fillEducationSheet(educationDoc,cells,{writeCell,elements,namespace:XMLNS});entries[educationPath]=xml(educationDoc);
 let names=elements(book,'definedNames')[0];if(!names){names=book.createElementNS(XMLNS,'definedNames');book.documentElement.insertBefore(names,elements(book,'calcPr')[0]||null);}const educationIndex=elements(book,'sheet').findIndex(x=>x.getAttribute('name')==='교육확인서');let area=elements(book,'definedName').find(x=>x.getAttribute('name')==='_xlnm.Print_Area'&&Number(x.getAttribute('localSheetId'))===educationIndex);if(!area){area=book.createElementNS(XMLNS,'definedName');area.setAttribute('name','_xlnm.Print_Area');area.setAttribute('localSheetId',String(educationIndex));names.appendChild(area);}area.textContent="'교육확인서'!$B$2:$H$"+educationLast;

 // Reuse the provenance sheet on repeated exports; Excel sheet names must be unique.
 const content=parse(entries['[Content_Types].xml']);
 let notesPath=resolveSheet('웹 저장 확인사항');
 if(!notesPath){let n=1;while(entries['xl/worksheets/mm-plan-notes-'+n+'.xml']||Array.from(rels.documentElement.childNodes).some(x=>x.nodeType===1&&x.getAttribute('Id')==='mmPlanNotes'+n))n++;notesPath='xl/worksheets/mm-plan-notes-'+n+'.xml';const rid='mmPlanNotes'+n;
 const noteSheet=book.createElementNS(XMLNS,'sheet');noteSheet.setAttribute('name','웹 저장 확인사항');noteSheet.setAttribute('sheetId',String(Math.max(...elements(book,'sheet').map(x=>Number(x.getAttribute('sheetId'))))+1));noteSheet.setAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','r:id',rid);elements(book,'sheets')[0].appendChild(noteSheet);
 const relation=rels.createElementNS(rels.documentElement.namespaceURI,'Relationship');relation.setAttribute('Id',rid);relation.setAttribute('Type','http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet');relation.setAttribute('Target',notesPath.slice(3));rels.documentElement.appendChild(relation);
 const override=content.createElementNS(content.documentElement.namespaceURI,'Override');override.setAttribute('PartName','/'+notesPath);override.setAttribute('ContentType','application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml');content.documentElement.appendChild(override);}
 const notesDoc=parse(strToU8('<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="'+XMLNS+'"><cols><col min="1" max="1" width="26" customWidth="1"/><col min="2" max="2" width="110" customWidth="1"/></cols><sheetData/></worksheet>'));
 const lines=[['차량',record.plateNo],['저장 상태',record.status==='draft'?'초안 · 승인 전':'제출 · 확인 이력 별도'],['등록·수정자',record.inspector],['저장 시각',record.createdAt],['출처·확인 사항',record.plan.sourceNotes||'별도 등록 없음'],['안내','실제 담당자의 서명·현장 확인 후 제출하세요. 작성예시 시트는 참고자료입니다.'],['계획서 유형',VARIANT_LABELS[cells.PLAN_VARIANT]||'차량 유형 확인 필요'],['위험성평가 상태',cells.RISK_BASIS==='sample'?'제공 샘플 점수 · 현장 재평가 전':cells.RISK_BASIS==='field'?'현장 재평가 입력 · 승인 별도':'미구분 · 현장 확인 필요']];
 if(record.plan.essentialSubmission){lines.push(['5번 체크 작성 기준','제출 작성 기본 ○ · 기존 X/△ 및 차량 원장 예외 보존']);for(const e of record.plan.essentialSubmission.exceptions||[])lines.push(['5번 '+e.no+'번 '+e.value,e.reason]);for(const message of record.plan.essentialSubmission.general||[])lines.push(['5번 제출 전 확인',message]);}
 for(const key of TRAINING_FIELDS)lines.push([TRAINING_LABELS[key],cells[key]||'']);
 for(const key of PRODUCT_PLAN_CELLS)lines.push([PRODUCT_PLAN_LABELS[key],cells[key]||'']);
 lines.push(['적재중량 판정 기준','도로교통법 시행령 제22조제3호 · 110% 이내 / 적재 대수 한도 유지'],['적재중량 판정',loadCheck(cells)],['기준 출처',SAFETY_LOAD_SOURCE],['별도 안전 확인',SAFETY_LOAD_NOTICE],['상품차량',cells.C31],['상품차량 치수',cells.C32],['상품차량 1대 중량(kg)',cells.C33||'미입력'],['운전자',cells.C20],['작업장소',cells.C10],['작업기간',cells.H10],['운전자 면허·자격',cells.H39],['운전자 자격 확인',cells.K20],['인양·낙하·추락방지 입력 내용',cells.C39],['계획서 점검 결과',cells.C41],['계획서 점검일',cells.H41]);
 if(record.vehicleSnapshot?.equipmentSafety)for(const [k,label]of EQUIPMENT_SAFETY_FIELDS)lines.push([label,record.vehicleSnapshot.equipmentSafety[k]||'미입력']);
 if(record.vehicleSnapshot){lines.push(['운송장비 제원','아래 값은 계획서 저장 당시 차량 원장입니다. 상품차량 제원과 구분하세요.']);for(const [key,label] of REGISTRATION_FIELDS)lines.push([label,String(record.vehicleSnapshot[key]??'')||'미확인']);lines.push(['장비 구조',record.vehicleSnapshot.structure||'미확인'],['적재 가능 대수',record.vehicleSnapshot.capacity||'미확인']);}
 const sample=VARIANT_SAMPLES[cells.PLAN_VARIANT];if(sample){lines.push(['위험성평가 참고자료','사용자 제공 '+VARIANT_LABELS[cells.PLAN_VARIANT]+' 샘플(2026-11-18). 현장 평가·승인 결과가 아닙니다.']);for(let r=45;r<=61;r++)lines.push([sample.risk['B'+r],sample.risk['C'+r]+' / 가능성 '+sample.risk['E'+r]+' × 중대성 '+sample.risk['F'+r]+' / '+sample.risk['H'+r]]);lines.push(['5번 안전기준 참고','두 유형의 제공 샘플 기준은 동일합니다. 원본의 ○는 참고 표시이며 실제 확인 결과로 복사하지 않습니다.']);sample.essentials.forEach((label,i)=>lines.push(['안전기준 '+(i+1),label+' / 제공 샘플: '+sample.sampleChecks[i]+' / 이 계획서 확인: '+(cells['J'+(68+i)]||'미확인')]));}
 const wrapStyle=elements(sopDoc,'c').find(c=>c.getAttribute('r')==='F7')?.getAttribute('s');
 lines.forEach((r,i)=>r.forEach((v,j)=>writeCell(notesDoc,String.fromCharCode(65+j)+(i+1),v)));
 if(wrapStyle)for(const c of elements(notesDoc,'c'))c.setAttribute('s',wrapStyle);for(const row of elements(notesDoc,'row')){row.setAttribute('ht','64');row.setAttribute('customHeight','1');}
 const calc=elements(book,'calcPr')[0];if(calc){calc.setAttribute('fullCalcOnLoad','1');calc.setAttribute('forceFullCalc','1');}
 entries[notesPath]=xml(notesDoc);entries['xl/workbook.xml']=xml(book);entries['xl/_rels/workbook.xml.rels']=xml(rels);entries['[Content_Types].xml']=xml(content);return zipSync(entries,{level:6});
}
export const packPlanDownloads=entries=>zipSync(entries,{level:0});
