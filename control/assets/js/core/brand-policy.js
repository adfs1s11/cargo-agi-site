export function transportBrand(row) {
  const customer=String(row.customer || '').replace(/\s/g,'').toUpperCase();
  if (/메르세데스벤츠코리아|MERCEDESBENZKOREA|^MBK$/.test(customer)) return 'MBK';
  if (/삼성SDS|SAMSUNGSDS/.test(customer)) return 'TESLA';
  if (/KG모빌리티|케이지모빌리티|쌍용|^KGM/.test(customer)) return 'KGM';
  if (/한국지엠|지엠코리아|GENERALMOTORS|^GMKOREA|^GM(?:[^A-Z]|$)/.test(customer)) return 'GM';
  if (!/지에스글로벌|GS글로벌|GSGLOBAL/.test(customer)) return '기타';
  const model=String(row.model || '').toUpperCase();
  const matches=[
    ['VOLVO', /VOLVO|볼보|\b(?:XC|EX|EC|S|V)\s?(?:30|40|60|90)\b/],
    ['POLSTAR', /POLE?STAR|폴스타/],
    ['BYD', /\bBYD\b|비와이디|ATTO|아토|DOLPHIN|돌핀|SEAL|씰|실라이언|SEALION/],
  ].filter(([,rx])=>rx.test(model));
  return matches.length===1 ? matches[0][0] : '기타';
}


export function canonicalProductBrand(value){const n=String(value||'').replace(/[\s_-]/g,'').toUpperCase();const aliases={MBK:'MBK','메르세데스벤츠':'MBK','메르세데스벤츠코리아':'MBK','벤츠':'MBK',TESLA:'TESLA','테슬라':'TESLA',VOLVO:'VOLVO','볼보':'VOLVO',POLSTAR:'POLSTAR',POLESTAR:'POLSTAR','폴스타':'POLSTAR',BYD:'BYD',KGM:'KGM','KG모빌리티':'KGM','쌍용':'KGM',GM:'GM','쉐보레':'GM','한국지엠':'GM',BMW:'BMW','아우디':'AUDI',AUDI:'AUDI','포르쉐':'PORSCHE',PORSCHE:'PORSCHE','혼다':'HONDA',HONDA:'HONDA','지커':'ZEEKR',ZEEKR:'ZEEKR','기타':'기타'};return aliases[n]||String(value||'').trim();}
export function productHistoryBrand(row){const byCustomer=transportBrand(row);return byCustomer!=='기타'?byCustomer:canonicalProductBrand(row.brand)||'기타';}
