import {STORES,canonical,sha} from './migration-core.js';
export async function readImport(file,progress=()=>{},{allowResume=false}={}){
 const reader=file.stream().pipeThrough(new DecompressionStream('gzip')).pipeThrough(new TextDecoderStream()).getReader();
 let buffer='',size=0,header,ended=false,count=0;const stores=Object.fromEntries(STORES.map(s=>[s,new Map()]));
 async function line(text){const x=JSON.parse(text);if(ended)throw Error('종료 후 추가 자료가 있습니다.');
  if(!header){if(x.kind!=='header'||x.format!=='mmt-private-import-1'||!/^[a-f0-9]{64}$/.test(x.archiveSha256)||!Number.isSafeInteger(x.revision)||x.revision<1||!Array.isArray(x.expected)||x.expected.length!==17)throw Error('이전 파일 형식 오류');header=x;return;}
  if(x.kind==='end'){ended=true;return;}
  if(x.kind!=='row'||!STORES.includes(x.store)||typeof x.key!=='string'||!x.key||typeof x.text!=='string'||stores[x.store].has(x.key))throw Error('원장 행 형식 또는 중복 오류');
  if(await sha(x.text)!==x.hash)throw Error('원본 내용 검증 실패');const v=JSON.parse(x.text);
  if(canonical(v)!==x.text||String(v[x.store==='meta'||x.store==='settings'?'key':'id'])!==x.key)throw Error('원본 식별자 오류');
  stores[x.store].set(x.key,{key:x.key,hash:x.hash,text:x.text});if(++count%2000===0)progress(count);
 }
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>400*1048576)throw Error('분할 이전이 필요한 파일 크기입니다.');buffer+=value;let i;while((i=buffer.indexOf('\n'))>=0){await line(buffer.slice(0,i));buffer=buffer.slice(i+1);}}if(buffer)await line(buffer);}finally{await reader.cancel().catch(()=>{});}
 if(!header||!ended)throw Error('이전 파일이 미완성입니다.');if(header.resumeOnly&&!allowResume)throw Error('변경분 대조가 필요한 파일입니다. 원본 재대조 화면을 사용하세요.');const names=new Set();
 for(const e of header.expected){if(!STORES.includes(e.store)||names.has(e.store)||!Number.isSafeInteger(e.records)||e.records<0)throw Error('원장 목록 오류');names.add(e.store);const map=stores[e.store];if(map.size!==e.records)throw Error(e.store+' 원본 건수 불일치');const pairs=[...map].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,v.hash]);if(await sha(canonical(pairs))!==e.fingerprint)throw Error(e.store+' 내용 대조 불일치');}
 return {header,stores,count};
}
