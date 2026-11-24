/* Read the monthly dispatch board on the device. Only mapped dispatch columns leave this worker. */
importScripts('../../../../vendor/xlsx.full.min.js');
const columns=new Set('거래처 출발시간 출발지 도착지 차대번호 색상 위치 차종 운전자 댓수 회전 코드 비고 청구 하불 하차담당자 연락처 고객 차량번호 기사연락처 도착일자'.split(' '));
const required=['거래처','출발지','도착지','차대번호'];
const aliases={'배차일자':'출발시간','운송일':'출발시간','수량':'댓수','대수':'댓수','기사명':'운전자','모델':'차종','VIN':'차대번호','상차지':'출발지','하차지':'도착지','도착일':'도착일자'};
function header(value){const label=String(value??'').trim().replace(/\s/g,'');return aliases[label]||label;}
function readBatches(bytes,month){
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw Error('배차 기준월을 선택하세요.');
 const wb=XLSX.read(bytes,{type:'array',cellDates:true}),batches=[],issues=[];
 for(const name of wb.SheetNames){
   const title=name.trim(),md=title.match(/^(\d{2})(\d{2})$/),ymd=title.match(/^(20\d{2})[-.]?(\d{2})[-.]?(\d{2})$/);
   const day=md?month.slice(0,4)+'-'+md[1]+'-'+md[2]:ymd?ymd.slice(1).join('-'):'';
   if(!day||day.slice(0,7)!==month||Number(day.slice(-2))<1||Number(day.slice(-2))>new Date(Date.UTC(+month.slice(0,4),+month.slice(5),0)).getUTCDate()){
     issues.push({sheet:name,reason:'선택한 월의 날짜 시트가 아닙니다.'});continue;
   }
   const ws=wb.Sheets[name];if(!ws['!ref'])continue;
   const range=XLSX.utils.decode_range(ws['!ref']);
   if(range.e.r>100000||range.e.c>511)throw Error(name+' 시트가 너무 큽니다. 사용하지 않는 행·열을 정리하세요.');
   const grid=XLSX.utils.sheet_to_json(ws,{header:1,range:0,raw:true,blankrows:true});
   const definitions=grid.map((cells,index)=>({index,headers:cells.map(header)})).filter(x=>required.every(k=>x.headers.includes(k)));
   if(!definitions.length){issues.push({sheet:name,reason:'거래처·출발지·도착지·차대번호 열 제목을 찾지 못했습니다.'});continue;}
   const headers=definitions[0].headers.map(k=>columns.has(k)?k:'');
   if(required.some(k=>headers.filter(x=>x===k).length!==1)||definitions.some(d=>d.headers.map(k=>columns.has(k)?k:'').join('|')!==headers.join('|'))){
     issues.push({sheet:name,reason:'열 제목이 중복되거나 한 시트 안에서 열 순서가 달라 확인이 필요합니다.'});continue;
   }
   const headingRows=new Set(definitions.map(d=>d.index)),rows=[];
   grid.forEach((cells,index)=>{
     if(headingRows.has(index))return;
     const values=headers.map((key,col)=>{
       if(!key)return '';
       const value=cells[col];
       if(value instanceof Date){
         const pad=n=>String(n).padStart(2,'0');
         return value.getFullYear()<1900?pad(value.getHours())+':'+pad(value.getMinutes()):value.getFullYear()+'-'+pad(value.getMonth()+1)+'-'+pad(value.getDate());
       }
       if((key==='출발시간'||key==='도착일자')&&typeof value==='number'){
         const d=XLSX.SSF.parse_date_code(value,{date1904:!!wb.Workbook?.WBProps?.date1904});
         if(d&&value>=20000&&value<=80000)return [String(d.y),String(d.m).padStart(2,'0'),String(d.d).padStart(2,'0')].join('-');
       }
       if(key==='차대번호'&&typeof value==='number'){
         const cell=ws[XLSX.utils.encode_cell({r:index,c:col})];
         if(!Number.isSafeInteger(value)||String(value).length>15)return '식별불가E+0';
         if(/^0\d+$/.test(cell?.w||''))return cell.w;
       }
       return String(value??'').trim();
     });
     if(values.some(Boolean))rows.push({rowNumber:index+1,values});
   });
   batches.push({sheetId:name,title:md?title:day.replace(/-/g,''),originalTitle:name,headers,rows});
 }
 if(!batches.length)throw Error('선택한 월에 읽을 수 있는 날짜 시트가 없습니다. 기준월과 배차판 양식을 확인하세요.');
 return {batches,issues};
}
self.onmessage=({data})=>{try{self.postMessage({ok:true,...readBatches(data.bytes,data.month)});}catch(e){self.postMessage({ok:false,error:e.message});}};
