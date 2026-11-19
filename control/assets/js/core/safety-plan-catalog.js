// Plan display only: never rewrite driver or product master records.
export function planDriverName(value){
 let name=String(value??'').normalize('NFC').trim();
 const tag='(?:개별(?:화물)?|GCC|H1)';
 name=name.replace(new RegExp('[\\(\\[（【]\\s*'+tag+'(?:\\s*소속)?\\s*[\\)\\]）】]','gi'),' ');
 name=name.replace(new RegExp('(^|[\\s/_,·|:-])'+tag+'(?=$|[\\s/_,·|:-])','gi'),'$1');
 name=name.replace(new RegExp('^'+tag+'(?=[가-힣])','i'),'').replace(new RegExp('([가-힣])'+tag+'$','i'),'$1');
 return name.replace(/^[\s/_,·|:-]+|[\s/_,·|:-]+$/g,'').replace(/\s+/g,' ').trim();
}
export const PRODUCT_PLAN_CELLS=['PRODUCT_ID','PRODUCT_BRAND','PRODUCT_MODEL','PRODUCT_TRIM','PRODUCT_SOURCE','PRODUCT_UPDATED_AT'];
export const PRODUCT_PLAN_LABELS={PRODUCT_ID:'상품차량 연결번호',PRODUCT_BRAND:'상품차량 브랜드',PRODUCT_MODEL:'등록 상품차량 모델',PRODUCT_TRIM:'등록 상품차량 트림',PRODUCT_SOURCE:'상품차량 자료 출처',PRODUCT_UPDATED_AT:'상품차량 자료 갱신일'};
const key=v=>String(v??'').normalize('NFKC').toUpperCase().replace(/[\s._-]/g,'');
export function planBrand(v){const k=key(v);return ['TESLA','테슬라'].includes(k)?'TESLA':['MBK','MERCEDESBENZ','메르세데스벤츠','벤츠'].includes(k)?'MBK':String(v??'').trim().toUpperCase();}
export const planBrandLabel=v=>v==='TESLA'?'테슬라 (TESLA)':v;
const modelKey=v=>key(String(v).replace(/^\d{4}\s*\/\s*/,''));
const family=(brand,model)=>brand==='TESLA'&&/^(MODELY(?!L)|모델Y)/.test(modelKey(model))?'Model Y':brand==='MBK'&&/^E200(?!\d)/.test(modelKey(model))?'E200':'';
const positive=v=>Number.isFinite(Number(v))&&Number(v)>0?Number(v):'';
export function planProductCatalog(products=[]){
 const order=new Intl.Collator('ko',{numeric:true,sensitivity:'base'}),groups=new Map();
 for(const p of products){const brand=planBrand(p.brand);if(!p.id||!brand||!String(p.model||'').trim()||p.active===false||p.status==='inactive')continue;if(!groups.has(brand))groups.set(brand,[]);groups.get(brand).push({...p,id:String(p.id),brand,model:String(p.model).trim()});}
 return [...groups].sort(([a],[b])=>order.compare(a,b)).map(([brand,rows])=>{
  rows.sort((a,b)=>order.compare(a.model,b.model)||order.compare(a.trim||'',b.trim||'')||order.compare(a.id,b.id));
  const representative=brand==='TESLA'?'Model Y':brand==='MBK'?'E200':'',members=representative?rows.filter(p=>family(brand,p.model)===representative):[];
  let selected=members.find(p=>modelKey(p.model)===modelKey(representative)&&!p.trim);
  if(!selected&&members.length){const common=k=>{const values=members.map(p=>positive(p[k]));return values.every(v=>v!==''&&v===values[0])?values[0]:'';};selected={id:'representative:'+brand+':'+representative,brand,model:representative,trim:'',representative:true,memberCount:members.length,source:'등록된 '+members.length+'개 세부모델의 대표 차종',weightKg:common('weightKg'),lengthMm:common('lengthMm'),widthMm:common('widthMm'),heightMm:common('heightMm')};rows.unshift(selected);}
  return {brand,rows,defaultId:selected?.id||rows[0].id};
 });
}
export function applyPlanProduct(cells,product){
 if(!product?.id)throw Error('등록된 상품차량을 선택하세요.');
 const dims=[['lengthMm','전장'],['widthMm','전폭'],['heightMm','전고']].filter(([k])=>positive(product[k])!=='').map(([k,label])=>label+' '+positive(product[k])+'mm').join(' / ');
 const brand=planBrand(product.brand),label=brand==='TESLA'?'테슬라':brand,model=String(product.model||'').trim(),trim=String(product.trim||'').trim();
 const previous=cells.PRODUCT_BRAND==='TESLA'?'테슬라':cells.PRODUCT_BRAND,workName=String(cells.C9||'');let nextWork=workName;for(const prefix of [...new Set([previous,'테슬라','TESLA','MBK'].filter(Boolean))])if(workName.startsWith(prefix+' ')&&/^(?:상품)?차량\s*상/.test(workName.slice(prefix.length).trim())){nextWork=label+workName.slice(prefix.length);break;}
 return {...cells,PRODUCT_ID:String(product.id),PRODUCT_BRAND:brand,PRODUCT_MODEL:model,PRODUCT_TRIM:trim,PRODUCT_SOURCE:product.representative?product.source:'등록 상품차량',PRODUCT_UPDATED_AT:product.updatedAt||'',C9:nextWork,C31:[label,model,trim].filter(Boolean).join(' / '),C32:dims||'상품차량 치수 미등록 · 확인 필요',C33:positive(product.weightKg),H31:product.cargoClass||'상품차량'};
}

// Requested report defaults. Keep explicit exceptions and leave unassigned staff blank.
export function completePlanReport(input){
 const cells={...input};
 for(let r=17;r<=22;r++)if(String(cells['C'+r]||'').trim())for(const [col,value]of [['I','이수'],['J','지급'],['K','적합']])if(!String(cells[col+r]??'').trim())cells[col+r]=value;
 const cap=Number(cells.H38);cells.F33=Number.isInteger(cap)&&cap>0?cap:'';
 return cells;
}
export function planTransportWeight(cells){const kg=Number(cells.C33),cap=Number(cells.H38);return Number.isFinite(kg)&&kg>0&&Number.isInteger(cap)&&cap>0?Math.round(kg*cap*1000000)/1000000:'';}
export function completePlanProduct(input,products=[]){
 if(input.PRODUCT_ID)return completePlanReport(input);
 const text=String(input.C31||input.C9||''),brand=input.PRODUCT_BRAND||(/테슬라|TESLA/i.test(text)?'TESLA':/MBK|벤츠|MERCEDES/i.test(text)?'MBK':'');
 const group=planProductCatalog(products).find(g=>g.brand===planBrand(brand));
 if(!group)return completePlanReport(input);
 const current=String(input.C31||'').trim();
 const generic=!current||/^(테슬라|TESLA|MBK|벤츠)(?:\s*(상품차량|차량))?(?:\s*\(출고 차종·제원 확인\))?$/i.test(current);
 if(!generic)return completePlanReport(input);
 const selected=group.rows.find(p=>p.id===group.defaultId);
 return completePlanReport(applyPlanProduct(input,selected));
}
