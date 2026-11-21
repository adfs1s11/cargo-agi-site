export const SAFETY_LOAD_LIMIT_PERCENT=110;
export const SAFETY_LOAD_PASS='적합(적재중량 110% 기준)';
export const SAFETY_LOAD_SOURCE='https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1027502749';
export const SAFETY_LOAD_NOTICE='적재중량 기준 판정입니다. 축하중·총중량·도로 제한·장비 사용한도·고박·현장 안전조치는 별도로 확인하세요.';
export function safetyLoadCheck({unitWeightKg,units,maxLoadKg,maxUnits}){
 const [kg,n,max,cap]=[unitWeightKg,units,maxLoadKg,maxUnits].map(Number);
 if([kg,n,max,cap].some(v=>!Number.isFinite(v)||v<=0)||!Number.isInteger(n)||!Number.isInteger(cap))return '확인 필요';
 return kg*n*100>max*SAFETY_LOAD_LIMIT_PERCENT||n>cap?'초과-작업불가':SAFETY_LOAD_PASS;
}
export const SAFETY_LOAD_EXCEL='IFERROR(IF(OR(C33="",F33="",C38="",H38="",C33<=0,F33<=0,C38<=0,H38<=0,MOD(F33,1)<>0,MOD(H38,1)<>0),"확인 필요",IF(AND(H33*100<=C38*110,F33<=H38),"적합(적재중량 110% 기준)","초과-작업불가")),"확인 필요")';
