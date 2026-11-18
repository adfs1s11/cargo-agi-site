export const TASK_KINDS={safety:'안전 점검',vehicle:'차량 현황 입력',reply:'확인·의견 제출'};
export const TASK_STATUS={submitted:'담당자 확인 중',reviewed:'검토 완료',returned:'보완 요청'};
export const TASK_CHECKS=[['brakes','브레이크·주차브레이크'],['tires','타이어·휠'],['lights','등화·경고장치'],['hydraulics','인양장치·유압·누유'],['locks','안전핀·잠금장치'],['restraints','고박·라싱 장비'],['fallProtection','승강 발판·난간·추락방지']];
export const TASK_ANSWERS={pass:'정상',warn:'주의·조치 필요',fail:'사용 중지·이상',unknown:'확인 못함'};
export const taskNeedsInput=t=>!t.latest||t.latest.task_version!==t.version||t.latest.status==='returned';
export const taskUnread=r=>r.review&&r.seen_version<r.version;
export function validateTaskInput(task,payload,photos){
 if(!payload.confirmed)throw Error('직접 확인 표시를 선택하세요.');
 const note=String(payload.note||'').trim();if(note.length>3000)throw Error('내용은 3,000자 이내로 입력하세요.');
 if(task.kind==='safety')for(const [key,label] of TASK_CHECKS){const answer=payload.answers?.[key];if(!answer||!Object.hasOwn(TASK_ANSWERS,answer.status))throw Error(label+'의 결과를 선택하세요.');if(String(answer.note||'').length>500||answer.status!=='pass'&&!String(answer.note||'').trim())throw Error(label+'의 이상·미확인 사유를 입력하세요.');}
 if(task.kind==='vehicle'&&(!/^\d{1,7}$/.test(String(payload.mileage||''))||!note))throw Error('현재 주행거리와 차량 상태를 입력하세요.');
 if(task.kind==='reply'&&!note)throw Error('답변 내용을 입력하세요.');
 if(photos.length>2||task.photo_required&&!photos.length)throw Error(task.photo_required?'사진을 1~2장 첨부하세요.':'사진은 최대 2장입니다.');
 return {...payload,note};
}
