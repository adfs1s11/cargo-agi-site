export const TRAINING_PREFIX='safetyTraining:';
export const TRAINING_TOPICS=[['plan','안전작업계획서·작업순서·위험요인'],['stop','작업중지 기준·보고체계'],['lift','상판 인양·하강·하부 진입금지·안전핀'],['fall','추락방지·안전대·3점 지지'],['ppe','보호구 착용·상호확인'],['pdi','PDI 속도·대기장소·현장 수칙'],['emergency','비상조치·연락체계'],['daily','당일 기상·물량·장비 상태']];
export const TRAINING_FIELDS=['TRAINING_ID','TRAINING_TITLE','TRAINING_DATE','TRAINING_TIME','TRAINING_LOCATION','TRAINING_INSTRUCTOR','TRAINING_CONTENT','TRAINING_STATE','TRAINING_ATTENDANCE','TRAINING_TOPICS','TRAINING_MATERIALS','TRAINING_PHOTOS','TRAINING_VERIFIED_BY','TRAINING_PPE','TRAINING_LINKED_DRIVER'];
export const TRAINING_LABELS=Object.fromEntries(TRAINING_FIELDS.map((k,i)=>[k,['교육 기록번호','교육명','교육일','교육시간','교육장소','교육자','교육내용','교육 상태','운전자 참석','교육 항목','교육자료','교육사진','교육 확인자','교육 보호구 확인','교육 연결 기사번호'][i]]));
export const TRAINING_STATES={material:'자료 보관',scheduled:'교육 예정',completed:'실시 확인',cancelled:'취소'};
const str=v=>String(v??'').trim();
export const validTrainingDate=v=>/^20\d{2}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function normalizeTraining(input,{today,driverIds=[]}={}){
 const r={title:str(input.title),date:str(input.date),start:str(input.start),end:str(input.end),location:str(input.location),instructor:str(input.instructor),content:str(input.content),state:str(input.state)||'scheduled',topics:[...new Set(input.topics||[])],attendees:(input.attendees||[]).map(a=>({driverId:str(a.driverId),status:str(a.status)||'invited',ppe:a.ppe===true})),verifiedBy:str(input.verifiedBy),acknowledged:input.acknowledged===true,files:input.files||[]};
 if(!r.title||r.title.length>150||r.content.length>5000||r.location.length>200||r.instructor.length>100)throw Error('교육명·장소·교육자·내용의 입력 길이를 확인하세요.');
 if(!Object.hasOwn(TRAINING_STATES,r.state))throw Error('교육 상태를 확인하세요.');
 if(r.state!=='material'&&!validTrainingDate(r.date)||r.date&&!validTrainingDate(r.date))throw Error('교육일을 입력하세요.');
 for(const time of [r.start,r.end])if(time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('교육 시간을 확인하세요.');
 if(r.start&&r.end&&r.start>=r.end)throw Error('종료 시간은 시작 시간 이후로 입력하세요.');
 if(r.topics.some(k=>!TRAINING_TOPICS.some(([id])=>id===k)))throw Error('교육 항목을 확인하세요.');
 const seen=new Set();for(const a of r.attendees){if(!driverIds.includes(a.driverId)||seen.has(a.driverId)||!['invited','attended','absent'].includes(a.status))throw Error('참석 기사와 중복 여부를 확인하세요.');seen.add(a.driverId);if(r.state!=='completed'&&a.status==='attended')throw Error('자료·예정 상태에서 실제 참석을 확정할 수 없습니다.');}
 if(r.state==='completed'&&(!today||r.date>today||!r.instructor||!r.content||!r.verifiedBy||!r.acknowledged||!r.attendees.some(a=>a.status==='attended')))throw Error('실시 확인에는 실제 교육일·교육자·내용·참석자·확인자 및 실시 확인이 필요합니다.');
 if(r.files.length>15||r.files.some(f=>!f.id||!f.name||!['material','photo'].includes(f.kind)||!f.path||!/^[a-f\d]{64}$/.test(f.sha256)))throw Error('교육 첨부자료를 확인하세요.');
 return r;
}
export function latestTrainings(rows){const groups=new Map();for(const r of rows)if(r?.id&&(!groups.has(r.rootId||r.id)||(groups.get(r.rootId||r.id).version||0)<r.version))groups.set(r.rootId||r.id,r);return [...groups.values()].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||b.createdAt.localeCompare(a.createdAt));}
export function applyTrainingToPlan(input,training,driverId){
 const cells={...input};for(const k of TRAINING_FIELDS)cells[k]='';
 if(!training){if(input.TRAINING_ID){cells.C23='교육기록 미연결 · 확인 필요';cells.I20='확인 필요';}return cells;}
 const person=training.attendees.find(a=>a.driverId===driverId),attended=training.state==='completed'&&person?.status==='attended';
 Object.assign(cells,{TRAINING_ID:training.id,TRAINING_TITLE:training.title,TRAINING_DATE:training.date,TRAINING_TIME:[training.start,training.end].filter(Boolean).join('~'),TRAINING_LOCATION:training.location,TRAINING_INSTRUCTOR:training.instructor,TRAINING_CONTENT:training.content,TRAINING_STATE:training.state,TRAINING_ATTENDANCE:person?.status||'unknown',TRAINING_TOPICS:JSON.stringify(training.topics),TRAINING_MATERIALS:training.files.filter(f=>f.kind==='material').map(f=>f.name).join('\n'),TRAINING_PHOTOS:training.files.filter(f=>f.kind==='photo').map(f=>f.name).join('\n'),TRAINING_VERIFIED_BY:training.verifiedBy,TRAINING_PPE:person?.ppe?'1':'',TRAINING_LINKED_DRIVER:driverId||''});
 cells.C23=[TRAINING_STATES[training.state],training.title,training.date,[training.start,training.end].filter(Boolean).join('~'),attended?'운전자 참석 확인':'운전자 참석 '+(person?.status==='absent'?'미참석':'확인 필요')].filter(Boolean).join(' / ');
 cells.I20=attended?'이수':training.state==='scheduled'?'예정':'확인 필요';return cells;
}
export function trainingConfirmed(cells){return !!cells.TRAINING_ID&&cells.TRAINING_STATE==='completed'&&cells.TRAINING_ATTENDANCE==='attended'&&validTrainingDate(cells.TRAINING_DATE)&&!!cells.TRAINING_INSTRUCTOR&&!!cells.TRAINING_VERIFIED_BY&&!!cells.TRAINING_LINKED_DRIVER;}
export function essentialSummary(cells){return Array.from({length:8},(_,i)=>String(cells['J'+(68+i)]||'').replace('○','O')).reduce((a,v)=>({...a,[v==='O'?'done':v==='X'?'open':v==='△'?'warning':'unknown']:a[v==='O'?'done':v==='X'?'open':v==='△'?'warning':'unknown']+1}),{done:0,open:0,warning:0,unknown:0});}
export function confirmBlankEssentials(cells,ack){if(!ack)throw Error('실제 현장에서 확인한 항목인지 확인란을 선택하세요.');const next={...cells};for(let i=68;i<=75;i++)if(!String(next['J'+i]||'').trim())next['J'+i]='O';return next;}
