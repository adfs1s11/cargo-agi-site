const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function evaluationMonthRange(month){
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw Error('평가 월을 선택하세요.');
 const y=Number(month.slice(0,4)),m=Number(month.slice(5,7));
 return {from:month+'-01',to:new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)};
}
export function shiftEvaluationMonth(month,step){evaluationMonthRange(month);return new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7))-1+step,1)).toISOString().slice(0,7);}
export function validateEvaluationRange(range){if(!date(range?.from)||!date(range?.to))throw Error('평가 시작일과 종료일을 정확히 입력하세요.');if(range.from>range.to)throw Error('평가 종료일은 시작일 이후여야 합니다.');return{from:range.from,to:range.to};}
