let library;

function loadWorkbookLibrary(){
  if(!library)library=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=new URL('../vendor/xlsx.full.min.js',import.meta.url).href;
    script.onload=()=>window.XLSX?resolve(window.XLSX):reject(Error('엑셀 기능을 불러오지 못했습니다.'));
    script.onerror=()=>reject(Error('엑셀 기능을 불러오지 못했습니다. 다시 시도하세요.'));
    document.head.append(script);
  }).catch(error=>{library=null;throw error;});
  return library;
}

const columns=['운송일','도착 예정일','브랜드','차종','차대번호','출발지','도착지','대수','배송 상태','기사명','연락처'];

export async function downloadDeliveries({endpoint,query,version,expected,current,onProgress}){
  const xlsx=await loadWorkbookLibrary();
  const sheet=xlsx.utils.aoa_to_sheet([columns]);
  const seen=new Set();
  const checkScreen=()=>{if(!current())throw Error('조회 조건이 변경됐습니다. 다시 조회한 뒤 다운로드하세요.');};
  let offset=0;
  do{
    checkScreen();
    const payload={...query,revision:version,offset,limit:500};
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
    let result;
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify({action:'customer.read',payload}),cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});
      result=await response.json();
      if(!response.ok||!result.ok)throw Error(result.error||'배송 목록을 확인하지 못했습니다. 잠시 후 다시 조회하세요.');
    }finally{clearTimeout(timer);}
    checkScreen();
    const page=result.data;
    if(page?.revision!==version||page.total!==expected||!Array.isArray(page.rows)||!page.rows.length||page.rows.length>payload.limit)
      throw Error('배송 목록이 변경됐습니다. 최신 자료로 다시 조회하세요.');
    const values=page.rows.map(row=>{
      if(!row.id||seen.has(row.id))throw Error('배송 목록의 중복 여부를 확인할 수 없습니다. 다시 조회하세요.');
      seen.add(row.id);
      const text=value=>String(value??'');
      return [text(row.date),text(row.arrivalDate),text(row.brand),text(row.model),text(row.vin),
        text(row.origin),text(row.destination),row.count??'확인 중',text(row.status),text(row.driverName),text(row.driverPhone)];
    });
    xlsx.utils.sheet_add_aoa(sheet,values,{origin:-1});
    offset+=values.length;
    if(offset>expected||page.nextOffset!==(offset===expected?null:offset))
      throw Error('배송 목록의 전체 건수를 확인하지 못했습니다. 최신 자료로 다시 조회하세요.');
    onProgress(offset);
  }while(offset<expected);
  sheet['!cols']=[13,13,14,22,22,24,30,8,16,16,20].map(wch=>({wch}));
  sheet['!autofilter']={ref:sheet['!ref']};
  const book=xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book,sheet,'배송 리스트');
  checkScreen();
  const period=query.day||[query.from,query.to].join('_');
  xlsx.writeFile(book,'배송리스트_'+period+'.xlsx',{compression:true});
}
