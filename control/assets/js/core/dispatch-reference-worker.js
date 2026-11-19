importScripts('../../../vendor/xlsx.full.min.js');
self.onmessage=async({data})=>{try{const {parseReferenceBook}=await import('./dispatch-reference-model.js');const {gzipSync,strToU8}=await import('../../../vendor/fflate.js');
 const bytes=new Uint8Array(data.bytes);if(bytes.length>8000000)throw Error('8MB 이하 엑셀을 선택하세요.');
 const book=await parseReferenceBook(XLSX.read(bytes,{type:'array',cellFormula:true,cellHTML:false,cellStyles:false}));
 if(book.sheets.length>60)throw Error('시트는 60개 이하로 나누어 주세요.');
 const sheets=book.sheets.map(s=>{const bytes=gzipSync(strToU8(JSON.stringify(s)));let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return {name:s.name,kind:s.kind,hidden:s.hidden,rows:s.rows.length,people:s.people.length,contacts:s.contacts.length,warnings:s.warnings,data:btoa(binary)};});
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
 self.postMessage({ok:true,upload:{name:data.name,sha256:hash,kind:book.kind,bytes:bytes.length,sheets}});
 }catch(e){self.postMessage({ok:false,error:e.message||String(e)});}};
