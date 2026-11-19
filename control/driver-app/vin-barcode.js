import {validVin,normalizeVin} from './domain.js';
export function barcodeVins(results){return [...new Set(results.map(r=>normalizeVin(r.rawValue)).filter(validVin))];}
export async function readVinBarcode(file){
 if(!globalThis.BarcodeDetector)return {supported:false,values:[]};
 const supported=await BarcodeDetector.getSupportedFormats(),formats=['code_39','code_128','data_matrix','qr_code','pdf417'].filter(f=>supported.includes(f));
 if(!formats.length)return {supported:false,values:[]};
 let bitmap;try{bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>40000000)throw Error('사진 해상도가 너무 큽니다. 가까이서 다시 촬영하세요.');return {supported:true,values:barcodeVins(await new BarcodeDetector({formats}).detect(bitmap))};}finally{bitmap?.close();}
}
