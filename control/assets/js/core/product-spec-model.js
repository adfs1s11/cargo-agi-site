import {productFamily,familyId,representativeRows} from './product-family.js';
export const SPEC_FIELDS=['weightKg','lengthMm','widthMm','heightMm','widthFoldedMm','widthWithMirrorsMm','wheelbaseMm'];
const positive=v=>Number.isFinite(Number(v))&&Number(v)>0?Number(v):0;
export function specEnvelope(profiles=[]){const fields={},ranges={};for(const k of SPEC_FIELDS){const values=profiles.flatMap(p=>[positive(p[k]),positive(p.ranges?.[k]?.min),positive(p.ranges?.[k]?.max)]).filter(Boolean);if(values.length){ranges[k]={min:Math.min(...values),max:Math.max(...values)};fields[k]=ranges[k].max;}}return {...fields,specRanges:ranges};}
export function rangeLabel(row,key,unit=''){const r=row.specRanges?.[key],v=positive(row[key]);return r?.min&&r.max?r.min===r.max?String(r.max)+unit:r.min+'–'+r.max+unit:v?String(v)+unit:'미확인';}
export function specComplete(p){return ['weightKg','lengthMm','widthMm','heightMm'].every(k=>positive(p[k]));}
export function planProductSpecs(products,official,checkedAt){
 const rows=[],held=[],groups=new Map(representativeRows(products).map(g=>[g.familyKey,g]));
 for(const item of official){const f=productFamily(item);if(f.held)throw Error('공식 제원 대표 모델 구분 오류: '+item.model);if(!groups.has(f.key))groups.set(f.key,{...f,familyKey:f.key,id:familyId(f.key),sourceMembers:[],registered:false});}
 for(const p of products.filter(p=>p.recordType!=='representative')){const f=productFamily(p);if(f.held){held.push({id:p.id,model:p.model,reason:f.reason});continue;}if(p.familyKey!==f.key||p.representativeModel!==f.model||p.representativeId!==(groups.get(f.key)?.id||familyId(f.key)))rows.push({...p,familyKey:f.key,representativeId:groups.get(f.key)?.id||familyId(f.key),representativeModel:f.model,representativeBrand:f.brand});}
 let created=0,updated=0,locked=0;
 for(const g of groups.values()){
  const before=products.find(p=>p.recordType==='representative'&&p.familyKey===g.familyKey),facts=official.find(p=>productFamily(p).key===g.familyKey),profiles=facts?.profiles||[];
  if(before?.specLock){locked++;continue;}
  const envelope=specEnvelope(profiles),sourceUrls=[...new Set(profiles.flatMap(p=>p.sources||[]).filter(u=>/^https:\/\//.test(u)))],base={...(before||{}),id:before?.id||familyId(g.familyKey),brand:g.brand,model:g.model,trim:'',familyKey:g.familyKey,representativeModel:g.model,representativeBrand:g.brand,recordType:'representative',cargoClass:facts?.cargoClass||before?.cargoClass||'',specBasis:'확인한 공식 자료의 대표 검토 범위. 출고 연식·트림·미러·차고를 실제 차량과 대조하세요.',specProfiles:profiles,specSources:sourceUrls,specVerifiedAt:profiles.length?checkedAt:before?.specVerifiedAt||'',specStatus:profiles.length?(specComplete(envelope)?'reference':'partial'):'unverified',...envelope};
  if(profiles.length){for(const k of SPEC_FIELDS)base[k]=envelope[k]||0;}
  const signature=JSON.stringify({profiles,fields:envelope,brand:g.brand,model:g.model});if(before?.specSignature===signature)continue;
  base.specSignature=signature;base.createdAt=before?.createdAt||checkedAt;base.updatedAt=before?.updatedAt||'';base.price=before?.price??null;
  if(before?.specSignature&&before.specSignature!==signature)base.specHistory=[...(before.specHistory||[]),{recordedAt:checkedAt,previousSignature:before.specSignature,previousFields:Object.fromEntries(SPEC_FIELDS.map(k=>[k,before[k]||0])),previousSources:before.specSources||[]}];
  rows.push(base);before?updated++:created++;
 }
 return {rows,held,created,updated,locked,linked:rows.filter(p=>p.recordType!=='representative').length,representatives:groups.size,researched:official.length};
}

