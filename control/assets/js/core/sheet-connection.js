import {state} from './data.js';
import {workspaceProfile} from './supabase-session.js';
const prefix='mmtc.sheet.connection.v1:';
const key=()=>prefix+(workspaceProfile()?.id||'legacy');
export function loadSheetConnection(){
 let saved={};try{saved=JSON.parse(localStorage.getItem(key())||'{}');}catch{}
 const old=state.settings.google?.mainBoard||{};
 if(!saved.url&&old.url&&old.token){saved={...old};rememberSheetConnection(saved);}
 return saved;
}
export function rememberSheetConnection(value){localStorage.setItem(key(),JSON.stringify(value));}
export function forgetSheetConnection(){localStorage.removeItem(key());if(state.settings.google)delete state.settings.google.mainBoard;}
export async function recoverSheetConnection(){
 const saved=loadSheetConnection();if(saved.url&&saved.token)return saved;
 const profile=workspaceProfile();if(!profile?.id||profile.role!=='admin'||!indexedDB.databases)return saved;
 const prefix='mmtc-supabase-'+encodeURIComponent(profile.id+'|admin|');
 const candidates=[];
 for(const item of await indexedDB.databases()){
 if(!item.name?.startsWith(prefix))continue;
 const value=await new Promise(resolve=>{const request=indexedDB.open(item.name);request.onerror=()=>resolve(null);request.onsuccess=()=>{const db=request.result;if(!db.objectStoreNames.contains('settings')){db.close();resolve(null);return;}const tx=db.transaction('settings','readonly');const get=tx.objectStore('settings').get('settings');get.onsuccess=()=>resolve(get.result?.value?.google?.mainBoard);get.onerror=()=>resolve(null);tx.oncomplete=()=>db.close();};});
 if(value?.url&&value?.token)candidates.push(value);
 }
 const unique=[...new Map(candidates.map(c=>[JSON.stringify([c.url,c.token,c.sourceUrl]),c])).values()];
 if(unique.length===1){rememberSheetConnection(unique[0]);return unique[0];}
 return saved;
}
