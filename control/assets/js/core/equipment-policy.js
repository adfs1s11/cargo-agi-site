export const EQUIPMENT_STRUCTURES=['풀트레일러','세미트레일러','대형트럭','중형트럭','세이프티로더'];
export const CAPACITY_CATEGORIES=[['7plus','7대 이상'],['6','6대'],['5','5대'],['4','4대'],['2','2대'],['1','1대']];
export function equipmentStructure(e={}){
 if(EQUIPMENT_STRUCTURES.includes(e.structure))return e.structure;
 if(EQUIPMENT_STRUCTURES.includes(e.type))return e.type;
 const source=String(e.sourceRoster?.vehicleType||'').replace(/\s/g,'');
 if(/^(풀트레일러|풀카)$/.test(source))return '풀트레일러';
 if(/^(세미트레일러|추레라)$/.test(source))return '세미트레일러';
 return EQUIPMENT_STRUCTURES.find(s=>s===source)||'';
}
export function capacityCategory(value){const n=Number(value);return Number.isInteger(n)&&n>=7?'7plus':[1,2,4,5,6].includes(n)?String(n):n>0?'review':'unset';}
export function capacityLabel(value){const key=capacityCategory(value);return CAPACITY_CATEGORIES.find(c=>c[0]===key)?.[1]||(key==='review'?`기존 ${Number(value)}대 · 분류 확인 필요`:'미설정');}
export function capacityFromSelection(category,actual,previous=0){if(category==='unset')return 0;if(category==='review'&&capacityCategory(previous)==='review')return Number(previous);if(!CAPACITY_CATEGORIES.some(c=>c[0]===category))throw Error('적재량 구분을 선택하세요.');const n=category==='7plus'?Number(actual):Number(category);if(!Number.isInteger(n)||n<1||n>50||category==='7plus'&&n<7)throw Error('7대 이상 차량의 실제 적재 가능 대수를 7~50대 정수로 입력하세요.');return n;}
export function equipmentMatches(e,required){const clean=String(required||'').replace(/\s/g,'');if(EQUIPMENT_STRUCTURES.includes(clean))return equipmentStructure(e)===clean;return String(e?.type||'').replace(/\s/g,'').toLowerCase()===clean.toLowerCase();}
