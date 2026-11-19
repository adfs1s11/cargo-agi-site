export const JOB_STATUS={draft:'접수',booked:'예약 완료',in_progress:'운송 중',delivered:'배송 완료',completed:'업무 종료',cancelled:'취소'};
export const CONTAINER_STATUS={requested:'주선 요청',assigned:'운송사 배정',picked_up:'반출 완료',delivered:'배송 완료',returned:'공컨 반납',cancelled:'취소'};
export const REVIEW={draft:'작성 중',submitted:'검토 요청',approved:'승인',rejected:'반려'};
export const MODE={admin:'관리자',operations:'포워딩 업무',settlement:'정산 관리',read:'조회·내보내기'};
export const money=v=>Number(v||0).toLocaleString('ko-KR',{maximumFractionDigits:2});
export const paid=(job,id,kind)=>Math.round((job.payments||[]).filter(p=>p.sourceId===id&&p.kind===kind).reduce((a,p)=>a+Number(p.amount),0)*100)/100;
export const balance=(job,item,kind)=>Math.round(((kind==='advance-recover'?paid(job,item.id,'advance-pay'):Number(item.amount)+Number(kind==='charge'?item.tax:0))-paid(job,item.id,kind))*100)/100;
export function csv(rows){return '\uFEFF'+rows.map(row=>row.map(v=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');}
