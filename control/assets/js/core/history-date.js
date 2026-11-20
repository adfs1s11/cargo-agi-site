import {ymd} from './utils.js';
import {validDate} from './schedule.js';
export function strictHistoryDate(value,{month='',sheet=''}={}){
 const selected=/^20\d{2}-(0[1-9]|1[0-2])$/.test(month),raw=String(value??'').trim();
 const result=(date,basis)=>validDate(date)?{date,basis}:{date:'',basis:'invalidSourceDate'};
 if(Object.prototype.toString.call(value)==='[object Date]'&&typeof value.getTime==='function'&&!Number.isNaN(value.getTime()))return result(ymd(value),'sourceCell');
 const text=raw.replace(/[년월]/g,'-').replace(/일$/,'').replace(/\s*([./-])\s*/g,'$1');let match=text.match(/^(20\d{2})[-./년](\d{1,2})[-./월](\d{1,2})(?:일|\b|T)/)||text.match(/^(20\d{2})(\d{2})(\d{2})$/);
 if(match)return result(`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`,'sourceCell');
 if(typeof value==='number'&&Number.isFinite(value)&&value>=20000&&value<=80000){const d=new Date((Math.floor(value)-25569)*86400000);return result(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`,'sourceCell');}
 if(selected){match=text.match(/^(\d{1,2})[-./](\d{1,2})$/);if(match)return result(`${month.slice(0,4)}-${match[1].padStart(2,'0')}-${match[2].padStart(2,'0')}`,'selectedMonthCell');match=text.match(/^(\d{2})[-./](\d{1,2})[-./](\d{1,2})$/);if(match){if(match[1]!==month.slice(2,4))return {date:'',basis:'yearMismatch'};return result(`${month.slice(0,4)}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`,'selectedMonthCell');}}
 // A malformed explicit date cannot be replaced by the tab date.
 if(/^20\d{2}/.test(text)||/^\d{1,2}[-./]\d/.test(text))return {date:'',basis:'invalidSourceDate'};
 if(selected){const compact=String(sheet).trim().replace(/\s/g,''),tab=compact.match(/^(\d{2})(\d{2})$/)||compact.match(/^(\d{1,2})[./-](\d{1,2})$/)||compact.match(/^(\d{1,2})월(\d{1,2})일$/);if(tab&&Number(tab[1])===Number(month.slice(5)))return result(`${month.slice(0,4)}-${tab[1].padStart(2,'0')}-${tab[2].padStart(2,'0')}`,'selectedMonthSheet');}
 return {date:'',basis:'missingDate'};
}
