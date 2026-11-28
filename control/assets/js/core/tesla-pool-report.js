import {unzipSync,zipSync,strFromU8,strToU8} from '../../../vendor/fflate.js';
import {equipmentStructure} from './equipment-policy.js';
import {safetyVehicleYear} from './safety-fleet.js';
import {planDriverName} from './safety-plan-catalog.js';
import {validDriverName} from './driver-master.js';

const main='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const sheetName='raw(안전장비조사용)';
const value=v=>String(v??'').trim();
const key=v=>value(v).normalize('NFC').replace(/[\s-]/g,'');
const unknown=/^(?:확인\s*중|미확인|미입력|확인 필요|#ERROR!|#N\/A|#REF!|-)?$/i;
const tags=(el,name)=>Array.from(el.getElementsByTagNameNS('*',name));
const xml=bytes=>new DOMParser().parseFromString(strFromU8(bytes),'application/xml');
const bytes=doc=>strToU8(new XMLSerializer().serializeToString(doc));
function group(rows,field){
  const map=new Map();
  for(const row of rows){const k=key(row[field]);if(!k)continue;if(!map.has(k))map.set(k,[]);map.get(k).push(row);}
  return map;
}
function combine(parts){
  const seen=new Set();
  return parts.map(value).filter(s=>s&&!seen.has(key(s))&&seen.add(key(s))).join(' / ');
}
function setCell(doc,cell,v){
  while(cell.firstChild)cell.removeChild(cell.firstChild);
  if(typeof v==='number'){cell.removeAttribute('t');const n=doc.createElementNS(main,'v');n.textContent=String(v);cell.appendChild(n);return;}
  cell.setAttribute('t','inlineStr');
  const inline=doc.createElementNS(main,'is'),t=doc.createElementNS(main,'t');
  t.textContent=String(v);inline.appendChild(t);cell.appendChild(inline);
}
function wrapStyles(files){
  const doc=xml(files['xl/styles.xml']),xfs=tags(doc,'cellXfs')[0],list=tags(xfs,'xf'),cache=new Map();
  return {forCell(c){
    const id=Number(c.getAttribute('s')||0);
    if(!cache.has(id)){
      const xf=list[id].cloneNode(true);let align=tags(xf,'alignment')[0];
      if(!align){align=doc.createElementNS(main,'alignment');xf.insertBefore(align,tags(xf,'protection')[0]||null);}
      align.setAttribute('wrapText','1');xf.setAttribute('applyAlignment','1');xfs.appendChild(xf);
      cache.set(id,tags(xfs,'xf').length-1);
    }
    c.setAttribute('s',String(cache.get(id)));
  },save(){xfs.setAttribute('count',String(tags(xfs,'xf').length));files['xl/styles.xml']=bytes(doc);}};
}
function addAudit(files,log,styles){
  const workbook=xml(files['xl/workbook.xml']),rels=xml(files['xl/_rels/workbook.xml.rels']),types=xml(files['[Content_Types].xml']);
  const doc=xml(strToU8('<worksheet xmlns="'+main+'"><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="18" customWidth="1"/><col min="2" max="2" width="25" customWidth="1"/><col min="3" max="3" width="48" customWidth="1"/><col min="4" max="4" width="88" customWidth="1"/></cols><sheetData/><autoFilter ref="A3:D'+log.length+'"/></worksheet>'));
  const sheetData=tags(doc,'sheetData')[0];
  for(const [i,items] of log.entries()){
    const row=doc.createElementNS(main,'row');row.setAttribute('r',String(i+1));sheetData.appendChild(row);
    items.forEach((v,j)=>{const c=doc.createElementNS(main,'c');c.setAttribute('r','ABCD'[j]+(i+1));row.appendChild(c);setCell(doc,c,v);styles.forCell(c);});
  }
  const id='rIdTeslaPoolAudit',path='worksheets/teslaPoolAudit.xml';
  const s=workbook.createElementNS(main,'sheet');s.setAttribute('name','차량별 대조내역');s.setAttribute('sheetId','2');s.setAttributeNS(rel,'r:id',id);tags(workbook,'sheets')[0].appendChild(s);
  const r=rels.createElementNS(rels.documentElement.namespaceURI,'Relationship');r.setAttribute('Id',id);r.setAttribute('Type',rel+'/worksheet');r.setAttribute('Target',path);rels.documentElement.appendChild(r);
  const type=types.createElementNS(types.documentElement.namespaceURI,'Override');type.setAttribute('PartName','/xl/'+path);type.setAttribute('ContentType','application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml');types.documentElement.appendChild(type);
  files['xl/'+path]=bytes(doc);files['xl/workbook.xml']=bytes(workbook);files['xl/_rels/workbook.xml.rels']=bytes(rels);files['[Content_Types].xml']=bytes(types);
}

export function buildTeslaPoolReport(input,records,{asOf,source='차량·안전 원장',xlsx=globalThis.XLSX}){
  if(input.byteLength>12*1024*1024)throw Error('12MB 이하의 고정풀 조사 원본을 선택하세요.');
  const book=xlsx.read(input,{type:'array'}),sheet=book.Sheets[sheetName];
  if(!sheet||book.SheetNames.length!==1)throw Error('고정풀 안전관리 원본의 raw(안전장비조사용) 시트를 선택하세요.');
  const read=addr=>value(sheet[addr]?.w??sheet[addr]?.v);
  const header={C:'운송사',D:'소속',E:'차체',F:'차량연식',G:'특장승인',I:'승인톤수',J:'최대적재',K:'차량번호',L:'운전기사',N:'특장장비업체',O:'차량교체',P:'인양',Q:'낙하방지',R:'추락방지',S:'작업계획서',T:'최근점검일',U:'정기검사일',V:'운행여부'};
  for(const [c,label] of Object.entries(header))if(!key(read(c+'4')).includes(label))throw Error(c+'열 제목이 달라 자동 기입을 중단했습니다. 원본 양식을 확인하세요.');
  const files=unzipSync(input),path='xl/worksheets/sheet1.xml',doc=xml(files[path]);
  const styles=wrapStyles(files);
  const eqs=group(records.equipment,'plateNo'),surveys=group(records.safety,'plateNo'),drivers=new Map(records.drivers.map(d=>[d.id,d]));
  const documents=records.vehicleSafetyDocuments||[],result={rows:0,matched:0,unmatched:0,duplicate:0,drivers:0,review:0};
  const year=(read('S4').match(/20\d{2}/)||[])[0];
  const audit=[['자료 기준',asOf,source,'원본에만 있는 값은 기존 조사값이며 이번 확인을 뜻하지 않습니다.'],['조사 대상',sheetName,read('V3'),'운행여부는 지정 기간 Cello 대사 기준입니다.'],['차량번호','차량 원장 연결','원장 반영 열','검토 사항']];
  const roster=tags(doc,'row').filter(row=>Number(row.getAttribute('r'))>=5&&read('K'+row.getAttribute('r')));
  const counts=new Map();for(const row of roster){const k=key(read('K'+row.getAttribute('r')));counts.set(k,(counts.get(k)||0)+1);}
  for(const row of roster){
    const i=row.getAttribute('r'),plate=read('K'+i),k=key(plate);
    const cells=new Map(tags(row,'c').map(c=>[c.getAttribute('r').replace(/\d+$/,''),c]));
    const write=(col,v)=>{if(!value(v))return;let c=cells.get(col);if(!c){c=doc.createElementNS(main,'c');c.setAttribute('r',col+i);const next=[...cells].find(([name])=>name.length>1||name>col);row.insertBefore(c,next?.[1]||null);cells.set(col,c);}setCell(doc,c,v);};
    const notes=[],filled=[],matches=eqs.get(k)||[],duplicate=matches.length>1||counts.get(k)>1;
    const e=!duplicate&&matches[0],list=surveys.get(k)||[],s=!duplicate&&list.length===1?list[0]:{};
    const status=duplicate?'차량번호 중복':e?'차량 원장 일치':'차량 원장 미연결';
    result.rows++;if(duplicate)result.duplicate++;else if(e)result.matched++;else result.unmatched++;
    if(!e)notes.push(status+' · 원본 조사값 확인');if(list.length>1)notes.push('안전 조사 기록 중복 · 안전 조사값 반영 보류');
    const put=(col,v)=>{if(value(v)){write(col,v);filled.push(col);}};
    const safety=e?.equipmentSafety||{},reg=e?.registration?.fields||{};
    // Explicit equipment entries (including cleared fields) supersede imported historical values.
    const current=(name,fallback)=>Object.hasOwn(safety,name)?safety[name]:Object.hasOwn(e||{},name)?e[name]:fallback;
    const applySafety=(col,name,extra)=>{
      const v=current(name,s[name]),detail=extra?current(extra,s[extra]):'';
      const old=read(col+i),next=combine([v,detail]);
      if(next){
        put(col,next);
        if(!unknown.test(old)&&key(old)!==key(next))notes.push(col+' 원본 조사값 '+old+' → 원장 '+next);
      }else if(Object.hasOwn(safety,name)||Object.hasOwn(e||{},name)){
        write(col,unknown.test(old)?'확인 필요':'원본 조사: '+old);
        notes.push(col+' 차량 원장 미입력');
      }
    };
    put('C',e?.company||s.company);put('D',e?.ownership||s.ownership);
    put('E',equipmentStructure(e)||s.bodyType);
    const modelYear=[e?.manufacturedAt,reg.manufacturedAt,e?.year,e?.sourceRoster?.vehicleYear,s.year].map(v=>safetyVehicleYear(v,Number(asOf.slice(0,4)))).find(Boolean);
    if(modelYear)put('F',modelYear);
    if(/^\d{4}$/.test(value(s.approvalYear)))put('G',Number(s.approvalYear));
    const approval=Number(s.approvalYear||read('G'+i));
    if(approval&&Number(asOf.slice(0,4))>=approval&&sheet['H'+i]?.f){
      const age=Number(asOf.slice(0,4))-approval,h=cells.get('H'),cached=tags(h,'v')[0];
      if(cached)cached.textContent=age<=5?'5년 이내':age<=10?'6년~10년':age<=15?'11년~15년':'16년 이상';
    }
    if(Number(s.tonnage)>0)put('I',Number(s.tonnage));
    if(Number(e?.capacity||s.capacity)>0)put('J',Number(e?.capacity||s.capacity));
    const d=drivers.get(e?.driverId),name=value(d?.name||e?.driverName);
    const conflict=(e?.driverId&&!d)||(d?.vehicleNo&&key(d.vehicleNo)!==k)||(d&&e.driverName&&![d.name,...d.aliases||[]].some(n=>key(n)===key(e.driverName)));
    const person=planDriverName(name);
    if(e&&validDriverName(person)&&!conflict){put('L',person);result.drivers++;if(!d)notes.push('차량에 기재된 기사명 · 기사 연결 확인');}else{write('L','기사 확인 필요');notes.push('현재 승무 기사 확인');}
    put('N',s.upfitter);put('O',s.replacePlan);
    applySafety('P','deckLift');applySafety('Q','deckFall');applySafety('R','fallProtect','fallProtectionNote');
    const plans=documents.filter(p=>e&&p.vehicleId===e.id&&p.kind==='plan'&&value(p.date||p.createdAt).startsWith(year)&&
      /^(?:tesla|테슬라)$/i.test(value(p.plan?.workbookFields?.PRODUCT_BRAND)||(/테슬라|tesla/i.test(value(p.plan?.workbookFields?.C9)+' '+value(p.plan?.workbookFields?.C31))?'TESLA':'')));
    plans.sort((a,b)=>value(b.createdAt).localeCompare(value(a.createdAt))||value(b.id).localeCompare(value(a.id)));
    const plan=plans[0];
    if(plan){const stages=documents.filter(p=>p.kind==='review'&&p.targetId===plan.id).map(p=>p.stage);
      put('S',stages.includes('external')?'SDS 확인':stages.includes('approve')?'내부 승인':plan.status==='submitted'?'제출 기록 있음':'초안 작성');}
    else put('S',s.workPlan);
    const date=current('specialInspection',''),outcome=current('specialInspectionResult','');
    const surveyed=value(s.specialInspection)||read('T'+i);
    if(date||outcome){const ext=unknown.test(surveyed)?'외부업체 점검 확인 필요':'외부업체 조사: '+surveyed;
      put('T',combine([ext,'장비 원장: '+combine([date,outcome])]));}else put('T',s.specialInspection);
    const inspection=value(e?.inspectionExpiry||reg.inspectionExpiry);
    if(inspection)put('U',combine([s.regularInspection||read('U'+i),'검사 유효기간 종료 '+inspection]));else put('U',s.regularInspection);
    if(sheet['V'+i]?.f||unknown.test(read('V'+i))){write('V','Cello 대사 필요');notes.push('해당 기간 운행여부 대사');}
    for(const col of ['O','P','Q','R','S','T','U']){
      const c=cells.get(col),v=c?.getAttribute('t')==='inlineStr'?tags(c,'t').map(t=>t.textContent).join(''):read(col+i);
      if(!v)write(col,'확인 필요');
      if(v.length>12&&c){styles.forCell(c);row.setAttribute('ht',String(Math.max(Number(row.getAttribute('ht')||0),Math.ceil(v.length/12)*16)));row.setAttribute('customHeight','1');}
      if(!v||/확인\s*(?:중|필요)|미확인|예정|없음|미설치|부적합|보완|초안/.test(v))notes.push(col+' '+(v||'확인 필요'));
    }
    if(notes.length)result.review++;audit.push([plate,status,filled.join(', ')||'원본 조사값 유지',notes.join(' · ')]);
  }
  if(!result.rows)throw Error('원본에서 차량번호가 기입된 행을 찾을 수 없습니다.');
  files[path]=bytes(doc);addAudit(files,audit,styles);styles.save();
  return {data:zipSync(files,{level:6}),result};
}
