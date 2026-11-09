// UI visibility is convenience only. Database/Edge permissions are authoritative.
const pages={
 executive:['dashboard'],
 dispatch:['dashboard','board','schedule','formation','assign','engine','drivers','equipment','products','evaluation','customer-share','commercial-trucks','commercial-volvo','mobile','m/dispatch'],
 safety:['equipment','vehicle-safety','driver-safety','drivers','safety','incidents','mobile','m/safety'],
 settlement:['dashboard','board','settlement','sale-rates','purchase-rates','drivers','products'],
};
export const knownRole=role=>role==='admin'||Object.hasOwn(pages,role);
export function canOpenPage(role,page){return role==='admin'||!!pages[role]?.includes(page);}
export const firstPage=role=>pages[role]?.[0]||'dashboard';
export function cacheScope(profile,nonce){
 if(!profile?.id||!knownRole(profile.role)||!profile.accessRevision||!nonce)throw Error('계정별 저장소 식별 정보가 없습니다.');
 return 'mmtc-supabase-'+encodeURIComponent([profile.id,profile.role,profile.accessRevision,nonce].join('|'));
}
