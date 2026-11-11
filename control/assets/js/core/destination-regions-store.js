import {supabaseMode,workspaceRpc} from './supabase-session.js';
import {installRegionMappings,validateMappings} from './destination-regions.js';
let snapshot={revision:0,rows:[]},loading=null,loadedAt=0;
export let regionLoadError='';
export const regionSnapshot=()=>structuredClone(snapshot);
export async function loadRegionMappings({force=false}={}){
 if(!supabaseMode())return regionSnapshot();
 if(!force&&loadedAt&&Date.now()-loadedAt<30000)return regionSnapshot();
 if(!loading)loading=(async()=>{try{
  const data=await workspaceRpc('tms_destination_regions_read',{}, {timeoutMs:10000});
  if(!Number.isSafeInteger(data?.revision)||data.revision<0)throw Error('전환표 응답을 확인할 수 없습니다.');
  const rows=validateMappings(data.rows);snapshot={revision:data.revision,rows};installRegionMappings(rows,data.revision);loadedAt=Date.now();regionLoadError='';return regionSnapshot();
 }catch(e){regionLoadError='권역 전환표 연결 실패: '+e.message;throw Error(regionLoadError);}finally{loading=null;}})();
 return loading;
}
export async function saveRegionMappings(rows,revision){
 if(!supabaseMode())throw Error('직원 개인 계정으로 Supabase에 로그인하세요.');
 const checked=validateMappings(rows);
 const result=await workspaceRpc('tms_destination_regions_save',{p_rows:checked,p_revision:revision});
 if(!Number.isSafeInteger(result?.revision))throw Error('저장 결과 확인 실패 · 조회 후 다시 확인하세요.');
 snapshot={revision:result.revision,rows:checked};installRegionMappings(checked,result.revision);loadedAt=Date.now();regionLoadError='';return regionSnapshot();
}
