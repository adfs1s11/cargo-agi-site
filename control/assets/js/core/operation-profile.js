// A preference describes the usual assignment, not an exclusive department reservation.
export const OPERATIONS={import:'수입차',commercial:'상용트럭',kgm:'KGM',gm:'GM',forwarding:'포워딩·컨테이너'};
export function operationProfile(value={}){
 const primary=String(value.primary||'').trim(),team=String(value.team||'').trim();
 if(primary&&!Object.hasOwn(OPERATIONS,primary))throw Error('주력 운영 부서를 선택하세요.');
 if(team.length>60)throw Error('운영 팀은 60자 이내로 입력하세요.');
 const preferred=[...new Set(value.preferred||[])];if(preferred.some(x=>!Object.hasOwn(OPERATIONS,x)))throw Error('지원 가능한 운영 부서를 확인하세요.');
 return {primary,team,preferred:preferred.filter(x=>x!==primary)};
}
export function operationLabel(equipment){const p=equipment?.operationProfile||{};return [OPERATIONS[p.primary]||'주력 부서 미지정',p.team||''].filter(Boolean).join(' · ');}
export function departmentMatch(equipment,department){const p=equipment?.operationProfile||{};return !department||p.primary===department||(p.preferred||[]).includes(department);}
