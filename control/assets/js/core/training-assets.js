import {uploadTrainingFile,trainingFileUrl,supabaseMode} from './supabase-session.js';
import {compressImage} from './photos.js';
import * as db from './db.js';
export async function prepareTrainingFiles(files,kind,sessionId){
 if(files.length>10)throw Error('한 번에 파일 10개까지 선택하세요.');const out=[];
 for(const file of files){let blob=file,ext;
  if(file.size>16*1024*1024)throw Error(file.name+'은 16MB 이하로 선택하세요.');
  if(kind==='material'){if(!/\.pdf$/i.test(file.name)||new TextDecoder().decode(await file.slice(0,5).arrayBuffer())!=='%PDF-')throw Error('교육자료는 PDF 파일을 선택하세요.');blob=new Blob([await file.arrayBuffer()],{type:'application/pdf'});ext='pdf';}
  else{if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('교육사진은 JPG·PNG·WebP 파일을 선택하세요.');const image=await compressImage(file,{maxWidth:1400,quality:.8,maxBytes:220000});blob=await(await fetch(image.dataUrl)).blob();ext='jpg';}
  const id=crypto.randomUUID(),bytes=new Uint8Array(await blob.arrayBuffer()),sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join(''),name=kind==='photo'?file.name.replace(/\.[^.]*$/,'').slice(0,190)+'.jpg':file.name.slice(0,200);out.push({id,sessionId,name,kind,ext,mime:blob.type,bytes:blob.size,sha256,blob,path:''});
 }return out;
}
export async function storeTrainingFiles(prepared,progress=()=>{}){
 const out=[];for(let i=0;i<prepared.length;i++){const file=prepared[i];progress(i+1,prepared.length);if(!file.path){if(supabaseMode())file.path=await uploadTrainingFile(file.sessionId,file.id,file.blob,file.ext);else{const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file.blob);});file.path='local/'+file.id;await db.put('photos',{id:file.id,ownerType:'safetyTraining',dataUrl});}}const {blob,ext,sessionId,...metadata}=file;out.push(metadata);}return out;
}
export async function downloadTrainingFile(file){let blob;if(file.path.startsWith('local/')){const row=await db.get('photos',file.id);if(!row?.dataUrl)throw Error('이 PC의 교육 첨부자료가 없습니다.');blob=await(await fetch(row.dataUrl)).blob();}else{const url=await trainingFileUrl(file.path);const r=await fetch(url,{credentials:'omit'});if(!r.ok)throw Error('자료를 불러오지 못했습니다.');blob=await r.blob();}
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');if(digest!==file.sha256)throw Error('첨부자료 내용 검증에 실패했습니다.');const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
