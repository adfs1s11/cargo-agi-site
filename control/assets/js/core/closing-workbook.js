// Review-only interchange. Never persists or submits financial records.
export const CLOSING_FIELDS = [
 ['id','자료번호'],['month','마감귀속월'],['date','운송일'],['customer','거래처'],['internal','내부거래처'],['model','상품차종'],['vin','차대번호'],['origin','출발지'],['destination','도착지'],['count','대수'],['sale','매출공급가'],['purchase','매입공급가'],['driver','기사'],['equipment','장비원문'],['driverType','기사구분'],['saleClosed','기존매출마감'],['purchaseClass','매입분류'],['kind','항목유형'],['note','특이사항'],['reason','수정사유']
];
const str=v=>String(v??'').trim();
export const isSds=r=>/삼성에스디에스|삼성sds/i.test(str(r.customer).replace(/\s/g,''));
function date(v){if(typeof v==='number')return new Date(Date.UTC(1899,11,30)+Math.floor(v)*86400000).toISOString().slice(0,10);return str(v).replace(/^(\d{4})[./](\d{2})[./](\d{2})$/, '$1-$2-$3');}
export function readClosing(grid,{month='',sheet=''}={}){
 const hi=grid.findIndex(row=>row.includes('자료번호')&&row.includes('매출공급가')||row.includes('하차일자')&&row.includes('매출')&&row.includes('매입'));
 if(hi<0)throw Error('표준 정산내역 또는 기존 경기지사 마감 양식을 선택하세요.');
 const headers=grid[hi],legacy=headers.includes('하차일자');
 if(legacy&&!(headers[9]==='매출'&&headers[11]==='매입'&&headers[15]==='마감'&&headers[16]==='마감'))throw Error('기존 양식의 I/J/L/P/Q열 위치가 다릅니다. 표준 양식을 사용하세요.');
 const index=Object.fromEntries(CLOSING_FIELDS.map(([k,label])=>[k,headers.indexOf(label)]));
 const used=legacy?[0,1,2,3,4,5,6,7,8,9,11,12,13,14,15,16,18]:Object.values(index).filter(i=>i>=0);
 if(!legacy&&CLOSING_FIELDS.some(([,label])=>headers.filter(h=>h===label).length!==1))throw Error('표준 양식의 필수 열이 없거나 중복되었습니다. 최신 양식을 다운로드하세요.');
 return grid.slice(hi+1).flatMap((cells,i)=>{
  if(!cells.some(v=>str(v)))return [];
  let r=Object.fromEntries(CLOSING_FIELDS.map(([k])=>[k,str(cells[index[k]])]));
  if(legacy){const keys=['id','date','customer','internal','model','vin','origin','destination','count','sale','unused','purchase','driver','equipment','driverType','saleClosed','purchaseClass','jump','note'];r=Object.fromEntries(keys.filter(k=>!['unused','jump'].includes(k)).map(k=>[k,str(cells[keys.indexOf(k)])]));r.month=month;r.kind='';r.reason='';}
  r.date=date(cells[legacy?1:index.date]);
  const inferred=r.count==='';r.count=inferred?'1':r.count;
  return [{...r,row:hi+i+2,sheet,inferred,excluded:false,ignoredExtra:cells.some((v,j)=>str(v)&&!used.includes(j)),original:{...r},edits:[]}];
 });
}
export function checkClosing(rows){
 const ids=new Map();for(const r of rows)if(!r.excluded&&r.id)ids.set(r.id,(ids.get(r.id)||0)+1);
 return rows.map(r=>{
  const issues=[];
  if(r.excluded)return {...r,issues:[]};
  if(!r.id)issues.push('资料번호 필요'.replace('资料','자료'));else if(ids.get(r.id)>1)issues.push('자료번호 중복');
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(r.date)||isNaN(Date.parse(r.date))||new Date(r.date).toISOString().slice(0,10)!==r.date)issues.push('운송일 확인');
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(r.month))issues.push('마감귀속월 확인');
  if(!r.customer)issues.push('거래처 필요');
  if(!/^\d+$/.test(r.count)||Number(r.count)<1||!Number.isSafeInteger(Number(r.count)))issues.push('대수는 1 이상의 정수');
  if(!['실제운송','정산전용'].includes(r.kind))issues.push('실제운송/정산전용 선택');
  if(r.kind==='실제운송'&&(!r.origin||!r.destination))issues.push('출발지·도착지 필요');
  if(r.kind==='실제운송'&&!r.vin&&!r.note)issues.push('VIN 없는 운송은 근거 메모 필요');
  for(const [k,label] of [['sale','매출'],['purchase','매입']]){
   if(k==='purchase'&&isSds(r))continue;
   if(str(r[k])==='')issues.push(label+' 금액 미입력');
   else if(!/^-?\d+$/.test(str(r[k]).replace(/,/g,''))||!Number.isSafeInteger(Number(str(r[k]).replace(/,/g,''))))issues.push(label+' 금액은 정수 원');
   else if(Number(str(r[k]).replace(/,/g,''))<0&&!r.note)issues.push(label+' 음수 조정 근거 필요');
  }
  if(!['Y','N',''].includes(r.saleClosed))issues.push('매출마감은 Y/N');
  if(!r.saleClosed)issues.push('매출마감 미확인');
  if(!isSds(r)&&!r.purchaseClass)issues.push('매입분류 미입력');
  if(r.edits.length&&!r.reason)issues.push('수정사유 필요');
  return {...r,issues};
 });
}
export function closingExport(rows){return [CLOSING_FIELDS.map(([,v])=>v),...rows.filter(r=>!r.excluded).map(r=>CLOSING_FIELDS.map(([k])=>k==='purchase'&&isSds(r)?'':r[k]??''))];}
export function editClosing(row,patch){const edits=Object.entries(patch).filter(([k,v])=>k!=='reason'&&str(row[k])!==str(v)).map(([field,to])=>({field,from:row[field],to,at:new Date().toISOString()}));return {...row,...patch,edits:[...row.edits,...edits]};}
