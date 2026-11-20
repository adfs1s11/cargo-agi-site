const text=v=>String(v||'').normalize('NFKC').trim();
export function productFamily(product={}){
 const original=text(product.model),s=original.toUpperCase().replace(/^[12]\d{3}\s*\/\s*/,'').replace(/[ÉÈ]/g,'E'),compact=s.replace(/[\s._-]/g,'');
 const make=(brand,model)=>({brand,model,key:brand+':'+model.toUpperCase(),sourceModel:original});
 if(!original||/^[A-HJ-NPR-Z0-9]{17}$/.test(compact)||/^[가-힣]{0,4}\d{2,3}[가-힣]\d{4}$/.test(compact))return {held:true,reason:'모델명 대신 차량 식별정보가 입력됨'};
 if(/MODELYL|모델YL/.test(compact))return make('TESLA','Model Y L');
 const tesla=compact.match(/(?:MODEL|모델)([3SYX])/);if(tesla)return make('TESLA','Model '+tesla[1]);
 if(/CYBERTR[U]?C?UK|CYBERTRUCK|CYBERTRCUK|사이버트럭/.test(compact))return make('TESLA','Cybertruck');
 const pole=compact.match(/(?:POLESTAR|POLSTAR|폴스타)([2345])/);if(pole)return make('POLSTAR','Polestar '+pole[1]+(/SUV/.test(s)&&pole[1]==='4'?' SUV':''));
 const volvo=compact.match(/^(EX30CC|EX30CROSSCOUNTRY|V60CC|V60CROSSCOUNTRY|EX90|ES90|EX40|EC40|EX30|XC90|XC60|XC40|S90|S60|V90|V60)/);if(volvo)return make('VOLVO',volvo[1].replace('CROSSCOUNTRY','CC'));
 const mb=s.match(/(?:^|\s)(GLS|GLE|GLC|GLB|GLA|EQS|EQE|EQB|EQA|CLE|CLA|SL|GT|A|B|C|E|G|S|V)\s*(\d{2,3})(?!\d)\s*([DE])?(?=$|[^A-Z])/);
 if(mb&&(/^\d{3}$/.test(mb[2])||['35','43','45','53','55','63','65'].includes(mb[2]))){const prefix=/MAYBACH|마이바흐|^MM\s/.test(s)?'Maybach ':/\bAMG\b/.test(s)&&/^(35|43|45|53|55|63|65)$/.test(mb[2])?'AMG ':'';let name=prefix+mb[1]+' '+mb[2]+(mb[3]?mb[3].toLowerCase():'');
  if(/ELECTRIC|EQ\s*TECHNOLOGY|EQ\s*TECH/.test(s)&&/^GL[BC]$/.test(mb[1]))name+=' electric';
  if(/CABRIO|카브리/.test(s))name+=' Cabriolet';else if(/COUP|쿠페/.test(s)&&!['CLA','GT'].includes(mb[1])||mb[1]==='CLE')name+=' Coupe';
  if(/SUV/.test(s)&&['EQE','EQS'].includes(mb[1]))name+=' SUV';
  if(mb[1]==='S'&&!prefix.startsWith('Maybach')&&/LONG|SEDAN\s*LONG|\bL\b|V223/.test(s))name+=' Long';
  if(/HYBRID|\bHY\b/.test(s)&&prefix==='AMG ')name+=' Hybrid';
  return make('MBK',name);
 }
 const rules=[['BYD','SEALION 6',/SEALION\s*6|씨라이언\s*6/],['BYD','SEALION 7',/SEALION\s*7|씨라이언\s*7/],['BYD','ATTO 3',/ATTO\s*3|아토\s*3/],['BYD','SEAL',/\bSEAL\b|^씰/],['BYD','DOLPHIN',/DOLPHIN|돌핀/],
 ['KGM','Torres EVX',/TORRES\s*EVX|토레스\s*EVX/],['KGM','Musso EV',/MUSSO\s*EV|무쏘\s*EV/],['KGM','Rexton Sports Khan',/렉스턴\s*스포츠\s*칸|REXTON\s*SPORTS\s*KHAN/],['KGM','Rexton Sports',/렉스턴\s*스포츠|REXTON\s*SPORTS/],['KGM','Torres',/TORRES|토레스/],['KGM','Actyon',/ACTYON|액티언/],['KGM','Rexton',/REXTON|렉스턴/],['KGM','Tivoli',/TIVOLI|티볼리/],['KGM','Korando',/KORANDO|코란도/],
 ['HONDA','CR-V',/CR[- ]?V/],['HONDA','Accord',/ACCORD|어코드/],['HONDA','Pilot',/PILOT|파일럿/],
 ['CHEVROLET','Trax Crossover',/TRAX|트랙스/],['CHEVROLET','Trailblazer',/TRAILBLAZER|트레일블레이저/],['CHEVROLET','Traverse',/TRAVERSE|트래버스/],['CHEVROLET','Colorado',/COLORADO|콜로라도/],['CHEVROLET','Equinox',/EQUINOX|이쿼녹스/],['GMC','Sierra',/SIERRA|시에라/],['GMC','Yukon',/YUKON|유콘/],['GMC','Canyon',/CANYON|캐니언/],['CADILLAC','Escalade IQL',/ESCALADE\s*IQL|에스컬레이드\s*IQL/],['CADILLAC','Escalade IQ',/ESCALADE\s*IQ|에스컬레이드\s*IQ/],['CADILLAC','Escalade ESV',/ESCALADE\s*ESV|에스컬레이드\s*ESV/],['CADILLAC','Escalade',/ESCALADE|에스컬레이드/],['CADILLAC','Lyriq',/LYRIQ|리릭/],['CADILLAC','Vistiq',/VISTIQ|비스틱/],['CADILLAC','CT5',/\bCT5\b/],
 ['FORD','Explorer',/EXPLORER|익스플로러|EXPL\[/],['FORD','Expedition',/EXPEDITION|익스페디션|EXT\[/],['FORD','Mustang Mach-E',/MUSTANG.*MACH|머스탱.*마하/],['FORD','Mustang',/MUSTANG|머스탱/],['LINCOLN','Nautilus',/NAUTILUS|노틸러스/],['LINCOLN','Navigator',/NAVIGATOR|네비게이터|내비게이터|NVI\[/],
 ['HYUNDAI','Palisade',/PALISADE|PALIS[A]?DE|팰리세이드/],['HYUNDAI','Santa Fe',/SANTAFE|SANTA\s*FE|싼타페|산타페/],['HYUNDAI','Grandeur',/GRANDEUR|그랜저/],['HYUNDAI','Sonata',/SONATA|쏘나타|소나타/],['HYUNDAI','Avante',/AVANTE|아반떼/],['HYUNDAI','Kona',/KONA|코나/],['HYUNDAI','Staria',/STARIA|스타리아/],['HYUNDAI','Ioniq 5',/IONIQ\s*5|아이오닉\s*5/],['HYUNDAI','Ioniq 6',/IONIQ\s*6|아이오닉\s*6/],['HYUNDAI','Ioniq 9',/IONIQ\s*9|아이오닉\s*9/],
 ['KIA','Sorento',/SORENTO|쏘렌토/],['KIA','Sportage',/SPORTAGE|스포티지/],['KIA','Carnival',/CARNIVAL|카니발/],['KIA','Ray',/\bRAY\b|레이/],['GENESIS','GV80 Coupe',/GV80.*COUP|GV80.*쿠페/],['GENESIS','GV80',/GV80/],['GENESIS','GV70',/GV70/],['GENESIS','GV60',/GV60/],['GENESIS','G90',/\bG90\b/],['GENESIS','G80',/\bG80\b/],['GENESIS','G70',/\bG70\b/],['ZEEKR','7X',/ZEEKR\s*7X|지커\s*7X/],['ZEEKR','X',/^ZEEKR\s*X\b|^지커\s*X\b/],['ZEEKR','001',/^(?:ZEEKR\s*)?001\b/]];
 for(const [b,m,re]of rules)if(re.test(s))return make(b,m);
 const kia=s.match(/^(K[3589]|EV[34569])\b/);if(kia)return make('KIA',kia[1]);
 return {held:true,reason:'제조사·대표 모델 확인 필요',sourceModel:original};
}
export function familyId(key){let n=2166136261;for(const c of key)n=Math.imul(n^c.charCodeAt(0),16777619);return 'prd_rep_'+(n>>>0).toString(16);}
export function representativeRows(products=[]){
 const groups=new Map();for(const p of products){if(p.active===false||p.status==='inactive')continue;const f=p.recordType==='representative'?{key:p.familyKey,brand:p.brand,model:p.model}:productFamily(p);if(f.held||!f.key)continue;if(!groups.has(f.key))groups.set(f.key,{...f,members:[],record:null});const g=groups.get(f.key);if(p.recordType==='representative')g.record=p;else g.members.push(p);}
 return [...groups.values()].map(g=>({...g.record,id:g.record?.id||familyId(g.key),brand:g.brand,model:g.model,familyKey:g.key,recordType:'representative',sourceMembers:g.members,trim:'대표 모델 · 세부 출고명 '+g.members.length+'개',registered:!!g.record}));
}

