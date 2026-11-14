import {state} from '../../core/data.js';
import {workspaceProfile} from '../../core/supabase-session.js';
import {calculateSettlement,loadSettlementData,totals} from '../../core/settlement.js';
import {esc,nf,todayStr,exportXlsx} from '../../core/utils.js';
import {pageHead} from '../components.js';
// Deliberately independent from writable settlement forms.
export default async function renderFinanceReview(view,{rateSide=''}={}){
 if(workspaceProfile()?.role!=='finance')throw Error('재무 조회 권한이 필요합니다.');
 const request=Symbol();view.financeRequest=request;let month=(state.workdate||todayStr()).slice(0,7),query='',page=0;
 view.innerHTML=pageHead('재무팀 · 정산 검토','조회·엑셀 내보내기 전용입니다. 단가 수정·가져오기·마감 권한은 없습니다.')+'<p role="status">정산 자료 확인 중…</p>';
 const data=await loadSettlementData();if(view.financeRequest!==request||!view.isConnected)return;
 let exportRows=[],rows=[],closed=null;
 function draw(){
  closed=data.closings.find(c=>c.month===month&&c.status==='closed');
  const entries=closed?.entries||calculateSettlement(state.dispatch.filter(r=>r.date?.startsWith(month)),data.rates,data.settlements,state.assignments,state.products);
  const t=totals(entries);
  const rates=data.rates.filter(r=>!rateSide||r.side===rateSide);
  const headings=rateSide?['구분','단가명','거래처','기사','출발지','도착지','기준','공급가','부가세율','시작일','종료일']:['운송일','거래처','기사','VIN','대수','매출 공급가','매출 부가세','매입 공급가','매입 부가세','검토 상태'];
  rows=rateSide?rates.map(r=>[r.side==='sale'?'매출':'매입',r.name,r.customer,r.driver,r.origin,r.destination,({vehicle:'대당',trip:'건당',km:'km당'})[r.basis]||r.basis,r.price,r.vatPercent,r.from,r.to]):entries.map(e=>[e.date,e.customer,e.driver,e.vin,e.count,e.sale.amount,e.sale.vat,e.purchase.amount,e.purchase.vat,closed?'마감 확정':e.issues.length?'미확정: '+e.issues.join(' / '):'검토 중']);
  const filtered=rows.filter(r=>!query||r.join(' ').toLowerCase().includes(query.toLowerCase()));exportRows=[headings,...filtered];
  const pages=Math.max(1,Math.ceil(filtered.length/100));page=Math.min(page,pages-1);
  view.innerHTML=pageHead('재무팀 · '+(rateSide==='sale'?'매출 단가 조회':rateSide==='purchase'?'매입 단가 조회':'정산 검토'),'조회·내보내기 전용 · 모든 금액은 부가세 별도 공급가입니다.')+
   `<div class="card card-pad"><label>정산 월 <input id="finance-month" type="month" class="input" value="${esc(month)}"></label><p>${closed?'마감 확정본':'미확정 · 청구·지급 전 확인 필요'} · ${nf(entries.length)}건 · 확인 필요 ${nf(t.unresolved)}건</p>${!rateSide?`<p>매출 공급가 ${nf(t.sale)}원 / 매입 공급가 ${nf(t.purchase)}원</p>`:''}<input class="input" id="finance-search" placeholder="거래처·기사·VIN 검색" value="${esc(query)}"><button class="btn btn-primary" id="finance-export">조회 결과 엑셀 내보내기</button></div>`+
   `<div class="card scroll-x"><table class="data"><thead><tr>${headings.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${filtered.slice(page*100,page*100+100).map(r=>`<tr>${r.map(v=>`<td>${esc(v??'')}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${headings.length}">조회 자료가 없습니다.</td></tr>`}</tbody></table></div><p>${nf(filtered.length)}건 · ${page+1}/${pages}페이지</p><button class="btn" id="finance-prev" ${page===0?'disabled':''}>이전</button><button class="btn" id="finance-next" ${page+1>=pages?'disabled':''}>다음</button>`;
  view.querySelector('#finance-month').onchange=e=>{if(e.target.value){month=e.target.value;page=0;draw();}};
  view.querySelector('#finance-search').onchange=e=>{query=e.target.value.trim();page=0;draw();};
  view.querySelector('#finance-prev').onclick=()=>{page--;draw();};view.querySelector('#finance-next').onclick=()=>{page++;draw();};
  view.querySelector('#finance-export').onclick=()=>exportXlsx({'재무 검토':exportRows,'검토 상태':[['구분',rateSide?'단가 조회':closed?'마감 확정본':'미확정 정산 검토'],['정산 월',month],['주의','미확정 자료는 청구·지급 확정액이 아닙니다.']]},`M&M_재무검토_${rateSide||'정산'}_${month}.xlsx`);
 }
 draw();
}
