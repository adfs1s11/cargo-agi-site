// Decisions apply to recorded inspections only; missing documents never imply a pass.
export function nextQuarterEnd(date) {
  const d = new Date(date + 'T00:00:00Z');
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date || '') || Number.isNaN(+d) || d.toISOString().slice(0,10)!==date) throw Error('점검일을 확인하세요.');
  return new Date(Date.UTC(d.getUTCFullYear(), (Math.floor(d.getUTCMonth()/3)+2)*3, 0)).toISOString().slice(0,10);
}
export function inspectionResult(items, answers={}, {periodic=false, compliance='unknown'}={}) {
  if (!items?.length) return {outcome:'incomplete',missing:0,abnormal:[],critical:[]};
  const missing=items.filter(i=>!['O','△','X'].includes(answers[i.id]?.value)).length;
  const abnormal=items.filter(i=>['△','X'].includes(answers[i.id]?.value));
  const critical=items.filter(i=>i.critical && answers[i.id]?.value==='X');
  const outcome=critical.length?'stop':missing?'incomplete':abnormal.length || (periodic&&compliance!=='complete')?'conditional':'pass';
  return {outcome,missing,abnormal:abnormal.map(i=>i.id),critical:critical.map(i=>i.id)};
}
export function vehicleSafetyBlock(eq,date) {
  if(eq?.vehicleSafetyHold?.active)return '안전 핵심항목 불량 · 조치 및 재점검 확인 필요';
  const p=eq?.vehicleSafetyPeriodic;
  if(p && date && p.validUntil && date>p.validUntil)return '정기 안전점검 유효기간 만료';
  if(p?.outcome==='conditional' && p.conditionDue && date>p.conditionDue)return '정기 안전점검 시정조치 기한 경과';
  return '';
}
export const SAFETY_OUTCOMES={pass:'양호',conditional:'조건부 · 조치 필요',stop:'작업 중지 · 핵심항목 불량',incomplete:'미완료'};
