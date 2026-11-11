// Exact destination mapping. Never changes destination text, transport identity or money.
export const REGIONS=['수도권','경상','충청','호남','강원','제주','기타/미확인'];
export const REGION_STATES=['자동','확정','확인필요','사용안함'];
export const normalizePlace=v=>String(v??'').replace(/\s/g,'').toLowerCase();
export const mappingKey=r=>JSON.stringify([normalizePlace(r.customer),normalizePlace(r.destination)]);
let registry=new Map(),version=0;
export function installRegionMappings(rows=[],revision=0){registry=new Map(rows.map(r=>[mappingKey(r),{...r}]));version=revision;}
export function consolidatedRegion(value){
 const s=normalizePlace(value);
 for(const [region,names] of [['수도권',['수도권','서울','경기','경기도','인천']],['경상',['경상','경남','경북','경상남도','경상북도','부산','대구','울산']],['충청',['충청','충남','충북','충청남도','충청북도','대전','세종']],['호남',['호남','전라','전남','전북','전라남도','전라북도','광주']],['강원',['강원','강원도']],['제주',['제주','제주도']]])if(names.includes(s))return region;
 return REGIONS.includes(s)?s:'';
}
export function inferDestination(value){
 const s=normalizePlace(value);if(!s)return {region:'기타/미확인',reason:'도착지 미입력'};
 const provinces=[['수도권',/수도권|서울|경기|인천/],['경상',/경상|경북|경남|부산|대구|울산/],['충청',/충청|충북|충남|대전|세종/],['호남',/호남|전북|전남|전라|광주광역시/],['강원',/강원/],['제주',/제주/]].filter(([,rx])=>rx.test(s));
 if(provinces.length)return provinces.length===1?{region:provinces[0][0],reason:'시·도 명칭'}:{region:'기타/미확인',reason:'여러 권역 명칭 혼재'};
 // Same city/county names occur in more than one province. Do not reuse old guesses.
 if(/광주|고성|중구|서구|남구|북구|동구|강서구|진안/.test(s))return {region:'기타/미확인',reason:'동명 지역 · 시·도 확인 필요'};
 const cities=[['수도권',/수원|성남|용인|고양|부천|안산|안양|남양주|화성|평택|의정부|시흥|파주|김포|광명|군포|오산|이천|양주|구리|안성|포천|의왕|하남|여주|양평|동두천|과천|가평|연천/],['경상',/창원|마산|김해|진주|양산|거제|통영|사천|밀양|함안|의령|창녕|남해|하동|산청|함양|거창|합천|포항|경주|구미|김천|안동|영주|영천|상주|문경|경산|칠곡|성주|울진|봉화|예천|의성|청송|영덕|영양|청도|고령|울릉/],['충청',/천안|청주|충주|아산|서산|당진|공주|논산|계룡|보령|제천|음성|진천|증평|괴산|단양|보은|옥천|영동|홍성|예산|태안|부여|서천|청양|금산/],['호남',/전주|익산|군산|정읍|남원|김제|완주|무주|장수|임실|순창|고창|부안|목포|여수|순천|나주|광양|담양|곡성|구례|고흥|보성|화순|장흥|강진|해남|영암|무안|함평|영광|장성|완도|진도|신안/],['강원',/춘천|원주|강릉|동해|태백|속초|삼척|홍천|횡성|영월|평창|정선|철원|화천|양구|인제|양양/],['제주',/서귀포/]].filter(([,rx])=>rx.test(s));
 return cities.length===1?{region:cities[0][0],reason:'시·군 명칭'}:{region:'기타/미확인',reason:cities.length?'여러 권역 명칭 혼재':'주소·별칭 확인 필요'};
}
export function destinationClassification(row){
 const match=registry.get(mappingKey(row))||registry.get(mappingKey({...row,customer:''}));
 if(match)return {region:['자동','확정'].includes(match.status)?match.region:'기타/미확인',reason:'전환표 · '+match.status,mapping:match,revision:version};
 return {...inferDestination(row.destination),revision:version};
}
export const destinationRegion=row=>destinationClassification(row).region;
export const applyDestinationRegion=row=>({...row,region:destinationRegion(row)});

// Historic region is evidence to review, not an authoritative default (older parsers guessed DC = 경기).
export function buildRegionCandidates(records,existing=[]){
 const keys=new Set(existing.map(mappingKey)),groups=new Map();
 for(const row of records){if(!normalizePlace(row.destination))continue;const key=mappingKey(row);if(keys.has(key))continue;
  if(!groups.has(key))groups.set(key,{customer:String(row.customer||'').trim(),destination:String(row.destination).trim(),count:0,historic:new Set()});
  const g=groups.get(key);g.count++;const old=consolidatedRegion(row.region);if(old&&old!=='기타/미확인')g.historic.add(old);
 }
 return [...groups.values()].map(g=>{const found=inferDestination(g.destination),conflict=g.historic.size>1||(found.region!=='기타/미확인'&&[...g.historic].some(r=>r!==found.region));return {customer:g.customer,destination:g.destination,region:found.region,status:conflict||found.region==='기타/미확인'?'확인필요':'자동',note:(conflict?'기존 권역 충돌 · ':'')+found.reason+(g.historic.size?' · 기존 '+[...g.historic].sort().join('/'):'')+' · 참고 '+g.count+'행'};}).sort((a,b)=>a.destination.localeCompare(b.destination,'ko'));
}
export function validateMappings(rows){
 if(!Array.isArray(rows)||rows.length>10000)throw Error('전환표는 최대 10,000행입니다.');const keys=new Set();
 return rows.map((r,i)=>{const v=Object.fromEntries(['customer','destination','region','status','note'].map(k=>[k,String(r[k]??'').trim()]));
  if(!v.destination||v.destination.length>500||v.customer.length>200||v.note.length>600)throw Error(`${i+2}행: 도착지 필수 · 거래처 200자/도착지 500자/메모 600자 이내`);
  if(!REGIONS.includes(v.region)||!REGION_STATES.includes(v.status))throw Error(`${i+2}행: 권역 또는 적용상태를 확인하세요.`);
  const key=mappingKey(v);if(keys.has(key))throw Error(`${i+2}행: 같은 거래처·도착지가 중복되었습니다.`);keys.add(key);return v;
 });
}
export const MAPPING_HEADERS=['거래처(빈칸=공통)','원본 도착지','권역','적용상태','검토 메모'];
export function mappingSheet(rows){return [MAPPING_HEADERS,...rows.map(r=>[r.customer,r.destination,r.region,r.status,r.note])];}
export function parseMappingSheet(matrix){
 if(!matrix.length||MAPPING_HEADERS.some((h,i)=>String(matrix[0]?.[i]||'').trim()!==h))throw Error('전환표 양식을 사용하세요. 첫 5개 열 제목을 변경하지 마세요.');
 const rows=matrix.slice(1).filter(r=>r.some(v=>String(v??'').trim())).map(r=>({customer:r[0],destination:r[1],region:r[2],status:r[3],note:r[4]}));
 if(!rows.length)throw Error('업로드할 전환표가 없습니다.');return validateMappings(rows);
}
export function mergeMappings(existing,incoming){const map=new Map(existing.map(r=>[mappingKey(r),r]));for(const r of validateMappings(incoming))map.set(mappingKey(r),r);return validateMappings([...map.values()]);}
