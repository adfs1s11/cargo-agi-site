export const refText=v=>v==null?'':String(v).trim();
export const nameKey=v=>refText(v).replace(/\s/g,'').toLocaleLowerCase();
export function refFlags(text){const s=refText(text);return [/배차불가|배차금지/.test(s)?'배차 제한':'',/휴무|휴차/.test(s)?'휴무·휴차':'',/정비|장비변경/.test(s)?'장비 확인':'',/확인|조정|교육/.test(s)?'확인 필요':'',/우선|고정/.test(s)?'우선·고정':'',/테슬라|벤츠|KG|GM/.test(s)?'브랜드 조건':''].filter(Boolean);}
const col=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const numeric=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
export function parseReferenceBook(wb){
 const sheets=[];
 for(const name of wb.SheetNames){const ws=wb.Sheets[name],cells=Object.keys(ws).filter(k=>/^[A-Z]+\d+$/.test(k)&&ws[k].v!=null&&refText(ws[k].v)!=='');
  const raw=cells.map(k=>[k,refText(ws[k].w??ws[k].v),ws[k].f||'']);
  const get=(c,r)=>ws[c+r]?.v??'',text=(c,r)=>refText(get(c,r));
  let kind='other',rows=[],people=[],contacts=[],warnings=[];
  if(text('A',4)==='이름'&&text('A',3)==='지역'){
   kind='metro';const cols=cells.filter(k=>/^[A-Z]+4$/.test(k)&&k!=='A4'&&text(k.slice(0,-1),4)!=='댓수').map(k=>k.slice(0,-1));
   const maxRow=Math.max(8,...cells.map(k=>Number(k.match(/\d+$/)[0])));let date='';
   for(const c of cols){const ci=[...c].reduce((n,v)=>n*26+v.charCodeAt(0)-64,0);people.push({name:text(c,4),region:text(c,3),depot:text(c,5),capacity:numeric(get(col(ci),5)),source:c+'4'});}
   for(let r=8;r<=maxRow;r++){if(text('A',r))date=text('A',r);for(let i=0;i<cols.length;i++){const c=cols[i],ci=[...c].reduce((n,v)=>n*26+v.charCodeAt(0)-64,0),value=get(c,r),count=get(col(ci),r);if(!refText(value)&&!refText(count))continue;
    const mismatch=/^\d{4}$/.test(name)&&/^\d{1,2}\/\d{1,2}$/.test(date)&&Number(name.slice(2))!==Number(date.split('/')[0]);
    rows.push({name:people[i].name,region:people[i].region,depot:people[i].depot,capacity:people[i].capacity,date,note:refText(value),units:numeric(count),countNote:typeof count==='string'?refText(count):'',order:numeric(value),source:c+r,flags:[...refFlags(value),...(mismatch?['월 확인']:[])]});
   }}
   const mismatch=rows.filter(r=>r.flags.includes('월 확인')).length;if(mismatch)warnings.push(`시트명과 원문 날짜의 월이 다른 기록 ${mismatch.toLocaleString()}건. 날짜는 원문 그대로 표시합니다.`);
  }else if(text('B',2)==='하행'&&text('J',2)==='상행'){
   kind='regional';
   for(const [direction,nc,dc,qc,oc] of [['하행','B','C','D','A'],['상행','J','K','L','I']]){
    for(let r=3;r<=130;r++){const person=text(nc,r);if(!person)continue;const note=text(dc,r),value=get(qc,r),countNote=numeric(value)===null?refText(value):'';rows.push({direction,name:person,note,units:numeric(value),countNote,order:numeric(get(oc,r)),source:nc+r,flags:refFlags(note+' '+countNote)});}
   }
   for(let r=3;r<=22;r++)if(text('O',r))contacts.push({group:'GM창원지사',name:text('O',r),vehicle:text('P',r),phone:text('Q',r),note:[text('R',r),text('S',r)].filter(Boolean).join(' / '),source:'O'+r});
   for(let r=135;r<=143;r++)if(text('B',r))contacts.push({group:'협력업체',name:text('B',r),vehicle:'',phone:'',note:text('C',r),source:'B'+r});
   const date=numeric(get('C',1));if(date!==null)warnings.push('원본 기준일: '+new Date((date-25569)*86400000).toISOString().slice(0,10)+'. 현재 가용 상태는 기사 스케줄에서 확인하세요.');
   const allUp=rows.filter(r=>r.direction==='상행').reduce((n,r)=>n+(r.units??0),0),cached=numeric(get('L',2));
   if(cached!==null&&cached!==allUp)warnings.push(`상행 원본 합계 ${cached}대와 전체 기재 숫자 합계 ${allUp}대가 다릅니다. 원본 합계 범위 밖의 입력도 목록에 보존했습니다.`);
  }else warnings.push('이 시트는 원문 조회로 보존했습니다.');
  const hidden=!!wb.Workbook?.Sheets?.find(s=>s.name===name)?.Hidden;
  sheets.push({name,kind,hidden,rows,people,contacts,raw,warnings});
 }
 if(!sheets.some(s=>s.kind!=='other'))throw Error('지원하는 수도권 순번표 또는 지방 예상배차 형식이 없습니다.');
 return {version:1,kind:sheets.some(s=>s.kind==='metro')?'metro':'regional',sheets};
}
export function matchReferenceDriver(name,drivers){const matches=drivers.filter(d=>nameKey(d.name)===nameKey(name));return matches.length===1?{state:'일치',driver:matches[0]}:{state:matches.length?'동명이인 확인':'명부 확인',driver:null};}
export function filterReferenceRows(rows,{query='',flag='',direction='',date='',sort='source'}={}){const q=nameKey(query);let out=rows.filter(r=>(!q||nameKey([r.name,r.note,r.countNote,r.region,r.depot,r.vehicle,r.phone,r.group].join(' ')).includes(q))&&(!flag||(r.flags||[]).includes(flag))&&(!direction||r.direction===direction)&&(!date||r.date===date));if(sort==='name')out=out.slice().sort((a,b)=>a.name.localeCompare(b.name,'ko'));if(sort==='order')out=out.slice().sort((a,b)=>(a.order??Infinity)-(b.order??Infinity));return out;}
