import {TRAINING_TOPICS,TRAINING_STATES,trainingConfirmed} from './training-model.js';
export function fillEducationSheet(doc,cells,{writeCell,elements,namespace}){
 const write=(a,v)=>writeCell(doc,a,v),confirmed=trainingConfirmed(cells),state=TRAINING_STATES[cells.TRAINING_STATE]||'교육 미연결',style=elements(doc,'c').find(c=>c.getAttribute('r')==='C8')?.getAttribute('s'),labelStyle=elements(doc,'c').find(c=>c.getAttribute('r')==='B4')?.getAttribute('s');
 const conducted=!!cells.TRAINING_ID&&['held','completed'].includes(cells.TRAINING_STATE)&&!!cells.TRAINING_DATE&&!!cells.TRAINING_VERIFIED_BY;write('B2','안전교육 확인서 · '+(conducted?cells.TRAINING_DATE+' 실시':state));
 write('D4',[cells.TRAINING_DATE||'교육일 미등록',cells.TRAINING_TIME].filter(Boolean).join(' '));write('G4',cells.TRAINING_LOCATION||'교육장소 확인 필요');write('D5',cells.TRAINING_TITLE||cells.C9||'교육명 확인 필요');write('G5',cells.TRAINING_INSTRUCTOR||'교육자 확인 필요');
 let topics=[];try{topics=JSON.parse(cells.TRAINING_TOPICS||'[]');}catch{}if(!Array.isArray(topics))topics=[];
 TRAINING_TOPICS.forEach(([id],i)=>write('H'+(8+i),conducted&&topics.includes(id)?'○':''));
 for(let r=19;r<=33;r++)for(const c of ['C','D','E','F','G','H'])write(c+r,'');
 write('C19',cells.H9||'');write('D19',cells.C20||'운전자 확인 필요');write('E19','운전자');write('F19',cells.H36||'');write('G19',confirmed&&cells.TRAINING_PPE==='1'?'확인':'확인 필요');write('H19','');
 if(!confirmed)write('B17',cells.TRAINING_STATE==='held'?'교육 실시일·교육내용은 확인되었습니다. 개인별 참석·이수와 본인 서명은 별도 확인하세요.':'교육 이수·참석 및 서명 확인 전 초안입니다. 교육 자료 보관·예정은 실제 이수를 의미하지 않습니다. 실제 교육 후 참석 확인과 본인 서명을 받으세요.');
 const rows=[['교육 상태',state],['교육명',cells.TRAINING_TITLE||'미연결'],['교육일·시간',[cells.TRAINING_DATE,cells.TRAINING_TIME].filter(Boolean).join(' ')||'확인 필요'],['교육내용',cells.TRAINING_CONTENT||'등록된 교육 내용 없음'],['참석 확인',confirmed?'해당 운전자 참석 확인':cells.TRAINING_ATTENDANCE==='absent'?'미참석':'확인 필요'],['확인자',cells.TRAINING_VERIFIED_BY||'확인 필요'],['교육자료',cells.TRAINING_MATERIALS||'첨부 없음'],['교육사진',cells.TRAINING_PHOTOS||'첨부 없음'],['원본 확인','안전교육 메뉴에서 자료·사진을 확인하세요. 본인 서명은 자동 입력하지 않습니다.']];
 let merges=elements(doc,'mergeCells')[0];if(!merges){merges=doc.createElementNS(namespace,'mergeCells');const before=elements(doc,'pageMargins')[0]||null;doc.documentElement.insertBefore(merges,before);}
 const merge=ref=>{if(elements(doc,'mergeCell').some(c=>c.getAttribute('ref')===ref))return;const node=doc.createElementNS(namespace,'mergeCell');node.setAttribute('ref',ref);merges.appendChild(node);};
 let rowNo=35;
 for(const [label,value]of rows){const chars=[...String(value)];for(let i=0;i<Math.max(chars.length,1);i+=140){const text=chars.slice(i,i+140).join('');write('B'+rowNo,label+(i?' (계속)':''));write('D'+rowNo,text);merge('B'+rowNo+':C'+rowNo);merge('D'+rowNo+':H'+rowNo);for(const [col,s]of [['B',labelStyle],['D',style]]){const c=elements(doc,'c').find(c=>c.getAttribute('r')===col+rowNo);if(s)c.setAttribute('s',s);}const lineCount=text.split('\n').reduce((n,l)=>n+Math.max(1,Math.ceil([...l].reduce((a,c)=>a+(/[^\x00-\x7f]/.test(c)?2:1),0)/42)),0),row=elements(doc,'row').find(r=>Number(r.getAttribute('r'))===rowNo);row.setAttribute('ht',String(Math.min(409,Math.max(30,lineCount*15+10))));row.setAttribute('customHeight','1');rowNo++;}}
 merges.setAttribute('count',String(elements(doc,'mergeCell').length));const dimension=elements(doc,'dimension')[0];if(dimension)dimension.setAttribute('ref','A1:H'+(rowNo-1));
 for(const r of [4,5,17]){const row=elements(doc,'row').find(x=>Number(x.getAttribute('r'))===r);if(row){row.setAttribute('ht',r===17?'60':'46');row.setAttribute('customHeight','1');}}
 return rowNo-1;
}
