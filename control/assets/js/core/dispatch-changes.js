// Classification only: never infer cancellation or replace a trip from a repeated VIN.
const changeFields={date:'운송일',arrivalDate:'도착일자',customer:'거래처',model:'차종',vin:'차대번호',origin:'출발지',destination:'도착지'};
export const CHANGE_FILTERS=[['','전체'],['dateChanged','날짜 변경'],['modified','수정'],['cancelled','운송 취소'],['assignmentCleared','배정 해제']];
export function dispatchChanges(row){
 const deltas=(Array.isArray(row.coreChanges)?row.coreChanges:[]).filter(c=>c&&changeFields[c.field]&&String(c.before??'')!==String(c.after??''));
 const text=[row.note,row.code,row.position,row.driver].filter(Boolean).join(' ').replace(/(?:날짜|일자|운송일|도착일|배차일|일정)\s*(?:변경|수정)\s*(?:없음|없습니다|아님|아닙니다)/g,'');
 const dateHint=/(?:날짜|일자|운송일|도착일|배차일|일정)\s*(?:변경|수정|연기|연장)|(?:익일|다음\s*날|내일)\s*(?:운송|배차|변경|이월)|(?:\d{1,2}[./-]\d{1,2}\s*(?:로|으로)\s*변경)/.test(text);
 const dateDeltas=deltas.filter(c=>['date','arrivalDate'].includes(c.field));
 const dateChanged=!!dateDeltas.length||dateHint;
 const cancelled=row.status==='cancelled'||String(row.driver||'').trim()==='취소';
 const assignmentCleared=!!row.manualAssignmentClearedAt;
 const edited=!!row.updatedAt&&row.updatedAt!==row.sourceAssignmentRefreshedAt&&row.updatedAt!==row.importedAt&&row.updatedAt!==row.createdAt&&!assignmentCleared;
 const modified=!!deltas.length||row.importDisposition==='coreChanged'||row.status==='changed'||edited||dateChanged;
 const labels=[];
 if(dateChanged)labels.push(dateDeltas.length?'날짜 변경':'날짜 변경 표기 · 확인 필요');
 if(modified&&!dateChanged)labels.push(deltas.length?'핵심 내용 수정':row.status==='changed'?'변경 표기 · 확인 필요':'수정 이력');
 if(cancelled)labels.push('운송 취소');
 if(assignmentCleared)labels.push('배정 해제');
 const details=deltas.map(c=>`${changeFields[c.field]}: ${String(c.before??'')||'미입력'} → ${String(c.after??'')||'미입력'}`);
 if(dateHint&&!dateDeltas.length)details.push('원본에 날짜 변경 표기가 있습니다. 변경 전·후 날짜는 원본에서 확인하세요.');
 if(edited&&!deltas.length)details.push('수정 기록 있음 · 변경 전 값은 저장된 이력이 없습니다.');
 return {dateChanged,modified,cancelled,assignmentCleared,labels,details};
}
export function summarizeDispatchChanges(rows,pending=[]){
 const counts=Object.fromEntries(CHANGE_FILTERS.slice(1).map(([k])=>[k,rows.filter(r=>dispatchChanges(r)[k]).length]));
 const units=kind=>pending.filter(r=>dispatchChanges(r)[kind]).reduce((n,r)=>n+Number(r.count||0),0);
 return {...counts,pendingDateChangedUnits:units('dateChanged'),pendingModifiedUnits:units('modified'),pendingAssignmentClearedUnits:units('assignmentCleared')};
}
