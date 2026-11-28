// UI visibility is convenience only. Database/Edge permissions are authoritative.
const pages={
 forwarding:['forwarding','forwarding-orders','forwarding-containers','forwarding-settlement','forwarding-advances'],
 finance:['dashboard','settlement','sale-rates','purchase-rates'],
 executive:['dashboard','destination-regions'],
 dispatch:['dispatch-reference','monthly-history','load-efficiency','dashboard','destination-regions','driver-notices','driver-app-admin','board','schedule','formation','assign','engine','drivers','equipment','products','evaluation','customer-share','commercial-trucks','commercial-volvo','mobile','m/dispatch'],
 safety:['equipment','destination-regions','driver-notices','driver-app-admin','vehicle-safety','driver-safety','drivers','safety','incidents','mobile','m/safety'],
 settlement:['dashboard','destination-regions','board','settlement','sale-rates','purchase-rates','drivers','products'],
};
export const knownRole=role=>role==='admin'||Object.hasOwn(pages,role);
let forwardingMode=null;
export function setForwardingMode(mode){forwardingMode=['admin','operations','settlement','read'].includes(mode)?mode:null;}
export function canOpenPage(role,page){if(!knownRole(role))return false;if(page==='work-menu')return role!=='forwarding'||!!forwardingMode;if(page==='fleet')return ['admin','dispatch','safety','settlement'].includes(role)||role==='forwarding'&&!!forwardingMode;if(page==='kgm-notify')return ['admin','dispatch'].includes(role);if(['kgm','kgm-import','kgm-resources'].includes(page))return role==='admin'||role==='dispatch'||(role==='settlement'&&page!=='kgm-import');if(pages.forwarding.includes(page))return role==='admin'||(!!forwardingMode&&(forwardingMode!=='read'||!['forwarding-orders','forwarding-containers'].includes(page)));  return role==='admin'||!!pages[role]?.includes(page);}
export const firstPage=role=>pages[role]?.[0]||'dashboard';
export function cacheScope(profile,nonce){
 if(!profile?.id||!knownRole(profile.role)||!profile.accessRevision||!nonce)throw Error('계정별 저장소 식별 정보가 없습니다.');
 return 'mmtc-supabase-'+encodeURIComponent([profile.id,profile.role,profile.accessRevision,nonce].join('|'));
}
