import {STAGES,stageOf} from '../../../truck-customer/view.js';
export {STAGES};
const RAW_STAGES=['입항','하역','검수','운송','도착'];
export function displayStages(row){return Object.fromEntries(STAGES.map(s=>[s,stageOf(row,s)]).filter(([,v])=>v.status!=='대기').map(([s,v])=>[s,{date:v.date,skipped:v.status==='생략',reason:s==='입항·하역'?row.stages?.하역?.reason||row.stages?.입항?.reason||'':row.stages?.[s]?.reason||''}]));}
function expanded(old,wanted){const out={...wanted},v=out['입항·하역'];delete out['입항·하역'];if(v){if(out.입항||out.하역)throw Error('통합 단계와 기존 입항·하역 열을 함께 입력할 수 없습니다.');const a=old?.stages?.입항,b=old?.stages?.하역;if(a&&b){const merged=stageOf(old,'입항·하역');if(merged.date!==v.date||(merged.status==='생략')!==!!v.skipped)throw Error('기존 입항·하역 처리 내용과 다릅니다.');}else {if(!a)out.입항=v;if(!b)out.하역=v;}}return out;}
export const stageHeaders=STAGES.flatMap(s=>[s+'처리',s+'일',s+'사유']);
const dateOK=v=>/^20\d{2}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export const truckKey=r=>JSON.stringify([r.brand,String(r.vin||'').toUpperCase().replace(/\s/g,''),r.bl,r.contract]);
export function parseStages(headers,row){const result={};for(const s of [...STAGES,'입항','하역']){const get=k=>String(row[headers.indexOf(s+k)]??'').trim(),state=get('처리'),date=get('일'),reason=get('사유');if(!state||state==='대기'){if(date||reason)throw Error(s+': 처리 상태를 입력하세요.');continue;}if(!['완료','생략',s].includes(state))throw Error(s+': 완료 / 생략 / 대기 중 입력하세요.');result[s]={date,skipped:state==='생략',reason};}return result;}
export function pendingStages(old,wanted){const current=structuredClone(old?.stages||{}),pending={};wanted=expanded(old,wanted);for(const s of RAW_STAGES){const v=wanted[s];if(!v)continue;if(!dateOK(v.date))throw Error(s+': 처리일은 YYYY-MM-DD 형식입니다.');if(v.skipped&&!v.reason?.trim())throw Error(s+': 생략 사유가 필요합니다.');if(current[s]){if(current[s].date!==v.date||!!current[s].skipped!==!!v.skipped)throw Error(s+': 기존 처리 내용과 다릅니다. 기존 단계는 덮어쓰지 않습니다.');continue;}for(const prior of RAW_STAGES.slice(0,RAW_STAGES.indexOf(s))){if(!current[prior])throw Error(s+': 이전 단계를 먼저 선택하거나 생략 사유를 입력하세요.');if(current[prior].date>v.date)throw Error(s+': 이전 단계보다 빠른 날짜입니다.');}current[s]=v;pending[s]=v;}return pending;}
// Existing server saves each stage atomically. Refresh revisions between stages.
// A retry skips matching completed steps; ambiguous responses are never retried blindly.
export async function applyTruckPlan(call,plans,progress=()=>{}){let current=(await call('truck.list')).rows;const index=new Map(current.map(r=>[truckKey(r),r])),seen=new Set();for(const p of plans){const key=truckKey(p.row);if(seen.has(key))throw Error('파일 내 중복 차량입니다.');seen.add(key);const old=index.get(key);if(old&&old.customer!==p.row.customer)throw Error('기존 차량의 거래처와 다릅니다.');pendingStages(old,p.stages);}
const fresh=plans.filter(p=>!index.has(truckKey(p.row)));if(fresh.length){progress('신규 차량 '+fresh.length+'대 등록 중');await call('truck.save',{rows:fresh.map(p=>p.row)});current=(await call('truck.list')).rows;}
for(const s of RAW_STAGES){const byKey=new Map(current.map(r=>[truckKey(r),r])),groups=new Map();for(const p of plans){const r=byKey.get(truckKey(p.row));if(!r)throw Error('차량을 찾을 수 없습니다. 새로고침 후 확인하세요.');const v=pendingStages(r,p.stages)[s];if(!v)continue;const k=JSON.stringify(v);if(!groups.has(k))groups.set(k,{v,rows:[]});groups.get(k).rows.push({id:r.id,revision:r.revision});}for(const {v,rows} of groups.values()){progress(s+' '+rows.length+'대 저장 중');await call('truck.stage',{rows,stage:s,date:v.date,skip:v.skipped,reason:v.reason});}if(groups.size)current=(await call('truck.list')).rows;}progress('선택한 단계 저장 완료');return current;}
// Read date columns from Excel values rather than locale-dependent display text.
export function truckImportTable(XLSX,wb){
 const sheet=wb.Sheets[wb.SheetNames[0]],data=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false}),headers=(data[0]||[]).map(v=>String(v).trim()),range=XLSX.utils.decode_range(sheet['!ref']||'A1');
 const dates=new Set(['입항예정일',...[...STAGES,'입항','하역'].map(s=>s+'일')]);
 for(let i=1;i<data.length;i++)for(let j=0;j<headers.length;j++){if(!dates.has(headers[j]))continue;const cell=sheet[XLSX.utils.encode_cell({r:range.s.r+i,c:range.s.c+j})];if(!cell||cell.v==null||cell.v==='')continue;
 let value=String(cell.v).trim();if(cell.t==='n'){const d=XLSX.SSF.parse_date_code(cell.v,{date1904:!!wb.Workbook?.WBProps?.date1904});value=d?`${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`:value;}else {const m=value.match(/^(20\d{2})\s*[-/.년]\s*(\d{1,2})\s*[-/.월]\s*(\d{1,2})\s*[.일]?$/);if(m)value=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;}
 data[i][j]=value;
 }return data;
}
