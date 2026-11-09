import {watermarkLines} from './domain.js';
export async function markPhoto(file,options){
 if(!file?.type.startsWith('image/')||file.size>25*1024*1024)throw Error('25MB 이하 사진을 선택해 주세요. HEIC가 열리지 않으면 JPEG로 촬영하세요.');
 const bitmap=await createImageBitmap(file);try{
 const ratio=Math.min(1,2048/Math.max(bitmap.width,bitmap.height)),width=Math.round(bitmap.width*ratio),height=Math.round(bitmap.height*ratio),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,width,height);
 const font=Math.max(13,Math.round(width/45)),lines=watermarkLines(options),band=font*6.4;ctx.fillStyle='rgba(0,0,0,.7)';ctx.fillRect(0,height-band,width,band);ctx.fillStyle='white';ctx.font=`600 ${font}px sans-serif`;lines.forEach((line,i)=>ctx.fillText(line,font,height-band+font*1.4*(i+1),width-font*2));
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));if(!blob)throw Error('사진 변환 실패');return new File([blob],`MM_${options.vin||'PHOTO'}_${Date.now()}.jpg`,{type:'image/jpeg'});
 }finally{bitmap.close();}
}
export async function sharePhoto(file){if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'M&M 운송 사진'});return 'share';}const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);return 'download';}
