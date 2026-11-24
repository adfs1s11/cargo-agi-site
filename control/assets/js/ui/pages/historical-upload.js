import {openModal,esc,nf,exportXlsx} from '../../core/utils.js';
import {state} from '../../core/data.js';
import {reviewSheetRows,commitSheetRows} from '../../core/sheet-import.js';
import {ensureWorkspaceStores,confirmSupabaseSaved} from '../../core/supabase-cloud.js';
import {supabaseMode,workspaceProfile} from '../../core/supabase-session.js';

function fileMonth(name){
  const m=name.match(/(?:^|[^\d])(?:20)?(\d{2})[-._ ]?(0[1-9]|1[0-2])(?=[^\d]|$)/);
  return m?'20'+m[1]+'-'+m[2]:'';
}
function parseFile(buffer,month){
  const worker=new Worker(new URL('./historical-workbook-worker.js',import.meta.url));
  return new Promise((resolve,reject)=>{
    worker.onmessage=({data})=>{worker.terminate();if(data.ok)resolve(data);else reject(Error(data.error));};
    worker.onerror=()=>{worker.terminate();reject(Error('배차판 파일을 읽지 못했습니다. 파일 형식을 확인하세요.'));};
    worker.postMessage({bytes:buffer,month},[buffer]);
  });
}
export function openHistoricalUpload({onSaved}){
  const online=supabaseMode(),canSave=!online||workspaceProfile()?.role==='admin';
  let generation=0,review=null,saved=null,busy=false;
  openModal({title:'과거 배차판 엑셀 업로드',sub:'날짜 시트의 운송을 구글시트 배차와 대조해 운송 현황에 반영합니다.',size:'wide',
    body:`<div class="form-grid"><label class="field full">월별 배차판<input class="input" id="hx-file" type="file" accept=".xlsx,.xls"></label><label class="field">배차 기준월<input type="month" class="input" id="hx-month"></label></div>
    <p class="small muted">신규 운송만 추가합니다. 기존 등록 건은 비교하고, 기사·구간·대수 등이 다르면 보류 내역에 표시합니다.</p>
    <button class="btn btn-primary" id="hx-preview">원장과 대조</button> <span class="small" role="status" id="hx-status"></span>
    <div id="hx-results"></div>`,foot:`<button class="btn btn-ghost" data-close>닫기</button>${canSave?'<button class="btn btn-primary" id="hx-save" disabled>신규 운송 반영</button>':'<span class="small muted">원장 저장은 관리자 계정에서 가능합니다.</span>'}`,
    onClose(){generation++;},onMount(el,close){
      const get=id=>el.querySelector('#hx-'+id),msg=text=>{get('status').textContent=text;};
      const reset=()=>{generation++;review=null;saved=null;get('results').replaceChildren();if(canSave)get('save').disabled=true;msg('');};
      get('file').onchange=()=>{reset();get('month').value=fileMonth(get('file').files[0]?.name||'');};
      get('month').oninput=reset;
      function lock(value){
        busy=value;
        for(const id of ['file','month','preview'])get(id).disabled=value||!!saved;
        if(canSave)get('save').disabled=value||!review?.rows.length;
      }
      get('preview').onclick=async()=>{
        if(busy)return;
        reset();const current=generation,file=get('file').files[0],month=get('month').value;
        if(!file||!month)return msg('엑셀 파일과 배차 기준월을 선택하세요.');
        if(!/\.xlsx?$/i.test(file.name)||file.size>40*1024*1024)return msg('40MB 이하의 .xlsx 또는 .xls 배차판을 선택하세요.');
        lock(true);msg('날짜 시트를 읽는 중…');
        try{
          const {batches,issues}=await parseFile(await file.arrayBuffer(),month);
          if(generation!==current)return;
          msg('기존 운송 및 원본 내 중복을 대조하는 중…');
          if(online&&canSave)await ensureWorkspaceStores(['dispatch','imports','closings','assignments','settlements']);
          const days=new Date(Date.UTC(+month.slice(0,4),+month.slice(5),0)).getUTCDate();
          const options={from:month+'-01',to:month+'-'+days,excelFile:file.name,title:file.name};
          const result=await reviewSheetRows(batches,{...options,existing:state.dispatch,drivers:state.drivers,assignments:state.assignments});
          if(current!==generation)return;
          const closed=state.closings?.some(r=>r.month===month&&r.status==='closed');
          const held=result.held.concat(issues);
          if(closed)for(const row of result.rows)held.push({sheet:row.tab,row:row.rowNumber,reason:'마감된 월'});
          const rows=closed?[]:result.rows;
          review={...options,...result,held,rows};
          const detail=[...held,...result.outside];
          const missingContacts=rows.filter(r=>r.driver&&(!r.driverPhone||!r.vehicleNo)).length;
          const counts=new Map(batches.map(b=>[b.originalTitle,{add:0,repeat:0,hold:0}]));
          for(const [list,field] of [[rows,'add'],[result.duplicates,'repeat'],[detail,'hold']]){
            for(const r of list){const name=r.tab||r.sheet;if(!counts.has(name))counts.set(name,{add:0,repeat:0,hold:0});counts.get(name)[field]++;}
          }
          get('results').innerHTML=`<p class="insight"><b>신규 ${nf(rows.length)}건</b> · 기존·원본 중복 ${nf(result.duplicates.length)}건 · 보류·기간 밖 ${nf(detail.length)}건/항목</p>
            ${missingContacts?'<p class="small muted">기사명이 있는 신규 건 중 차량번호 또는 기사 연락처 공란 '+nf(missingContacts)+'건입니다. 엑셀 수식에 저장된 결과가 없으면 공란으로 반영합니다. 필요하면 원본에서 값을 확인한 뒤 다시 선택하세요.</p>':''}
            <div class="scroll-x" style="max-height:35vh"><table class="data"><thead><tr><th>원본 시트</th><th>신규</th><th>중복</th><th>확인 필요</th></tr></thead><tbody>${[...counts].map(([s,c])=>`<tr><td>${esc(s)}</td><td>${nf(c.add)}</td><td>${nf(c.repeat)}</td><td>${nf(c.hold)}</td></tr>`).join('')}</tbody></table></div>
            ${detail.length?'<details><summary>보류 사유 확인</summary>'+detail.slice(0,15).map(r=>'<p class="small">'+esc(r.sheet)+' '+esc(r.row||'')+' · '+esc(r.reason)+'</p>').join('')+'</details>':''}
            <button class="btn btn-ghost" id="hx-report">전체 대조 내역 엑셀</button>`;
          get('report').onclick=()=>exportXlsx({'대조 내역':[['구분','시트','원본 행','운송일','VIN','사유'],...rows.map(r=>['신규',r.tab,r.rowNumber,r.date,r.vin,'']),...result.duplicates.map(r=>['중복',r.tab,r.rowNumber,r.date,r.vin,r.importReason]),...detail.map(r=>['보류',r.sheet,r.row||'',r.date||'',r.vin||'',r.reason])]},month+'_과거배차판_대조.xlsx');
          msg(closed?'마감된 월입니다. 대조 내역을 확인하세요.':rows.length?'대조가 끝났습니다.':'추가할 신규 운송이 없습니다.');
        }catch(e){if(current===generation)msg(e.message);}finally{if(current===generation)lock(false);}
      };
      if(canSave)get('save').onclick=async()=>{
        if(busy||!review?.rows.length)return;
        lock(true);msg('신규 운송을 저장하는 중…');
        try{
          if(online&&workspaceProfile()?.role!=='admin')throw Error('원장 저장 권한을 확인하세요.');
          if(!saved)saved=await commitSheetRows(review.rows,review);
          if(online){msg('서버 저장 결과를 확인하는 중…');await confirmSupabaseSaved();}
          const date=review.rows.map(r=>r.date).sort().at(-1);
          msg('저장 완료 · 신규 '+nf(saved.inserted)+'건 · 저장 시 중복 '+nf(saved.duplicates)+'건 · 재확인 '+nf(saved.conflicts)+'건');
          get('save').textContent='배차 현황 보기';get('save').disabled=false;
          get('save').onclick=()=>{close();onSaved(date);};
        }catch(e){if(saved)get('save').textContent='서버 저장 다시 확인';msg(e.message);lock(false);}
      };
    }});
}
