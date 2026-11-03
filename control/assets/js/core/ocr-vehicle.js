// Confirmed text only: originals and unrestricted OCR text never enter the ledger.
export const OCR_PREFIX='ocrVehicle:v1:';
export const OCR_FIELDS={
 '출고 봉투':['VIN','임판번호','차종','색상','출고일','임시운행 시작일','임시운행 종료일','대리점명','대리점 전화번호','탁송지명','탁송코드','인수자명','인수자 연락처','탁송지 주소','탁송업체','탁송업체 연락처','용품 기재 내용','별도 관리코드'],
 '자동차 등록증':['차량번호','VIN','차명','등록 차종','제작연월','최초등록일','총중량(kg)','최대적재량(kg)','길이(mm)','너비(mm)','높이(mm)','검사 유효기간 종료일']
};
export function normalizeOcr(payload){
 if(!payload||!OCR_FIELDS[payload.documentType]||!payload.fields||Array.isArray(payload.fields))throw Error('출고 봉투 또는 자동차 등록증 OCR 확정 파일을 선택하세요.');
 if(typeof payload.confirmedAt!=='string'||!Number.isFinite(Date.parse(payload.confirmedAt)))throw Error('OCR 화면에서 원본 확인 후 내려받은 파일이 필요합니다.');
 const fields={};
 for(const key of OCR_FIELDS[payload.documentType]){const value=payload.fields[key]??'';if(typeof value!=='string'||value.length>1000)throw Error('항목 형식 또는 길이를 확인하세요: '+key);fields[key]=value.trim();}
 fields.VIN=fields.VIN.replace(/\s/g,'').toUpperCase();
 if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(fields.VIN))throw Error('정확한 17자리 VIN을 확인하세요. 동일 VIN으로 중복 등록을 방지합니다.');
 return {documentType:payload.documentType,confirmedAt:payload.confirmedAt,fields};
}
export function ocrKey(doc){return OCR_PREFIX+(doc.documentType==='출고 봉투'?'product:':'equipment:')+doc.fields.VIN;}
export function mergeOcr(previous,doc,actor,now=new Date().toISOString()){
 const key=ocrKey(doc);if(previous&&previous.key!==key)throw Error('기존 차량의 VIN과 문서 종류는 변경할 수 없습니다.');
 const fields={...(previous?.fields||{})};for(const [k,v] of Object.entries(doc.fields))if(v)fields[k]=v;
 if(previous&&JSON.stringify(fields)===JSON.stringify(previous.fields))return previous;
 const changed=Object.keys(fields).filter(k=>fields[k]!==previous?.fields?.[k]);
 return {key,documentType:doc.documentType,fields,confirmedAt:doc.confirmedAt,createdAt:previous?.createdAt||now,updatedAt:now,updatedBy:String(actor||''),revision:(previous?.revision||0)+1,history:[...(previous?.history||[]),{at:now,by:String(actor||''),changed}].slice(-20)};
}
