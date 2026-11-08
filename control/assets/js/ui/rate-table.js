import {esc,nf,exportXlsx,todayStr} from '../core/utils.js';
import {RATE_FIELDS} from '../core/settlement.js';
const basis={vehicle:'대당',trip:'건당',km:'km당'};
const labels={customer:'거래처',driver:'기사',brand:'브랜드',model:'차종',cargoClass:'상품차량 분류',origin:'출발지',destination:'도착지',transportType:'장비·운송방식',otherCondition:'기타 조건'};
const safe=v=>/^[=+@\-\t\r]/.test(String(v??''))?"'"+v:v;
export function rateState(rate,day){return rate.active===false?'중지':rate.from&&day<rate.from?'적용 예정':rate.to&&day>rate.to?'기간 종료':'적용 중';}
export function renderRateTable(body,rates,{side='',edit,upload}={}){
 body.innerHTML=`<div class="card card-pad"><h3>${side==='sale'?'매출':side==='purchase'?'매입':'매출·매입'} 단가표</h3><p>모든 단가는 부가세 별도 공급가입니다. 빈 조건은 전체 적용이며, 특수조건과 적용기간까지 확인하세요.</p><div class="row" style="gap:12px;flex-wrap:wrap"><label>구분<select id="rt-side" class="select"><option value="">매출·매입</option><option value="sale">매출</option><option value="purchase">매입</option></select></label><label>적용 기준일<input class="input" id="rt-date" type="date" value="${todayStr()}"></label><label>상태<select id="rt-status" class="select"><option value="">전체</option>${['적용 중','적용 예정','기간 종료','중지'].map(s=>`<option>${s}</option>`).join('')}</select></label><label>거래처·기사·브랜드·구간 검색<input class="input" type="search" id="rt-search"></label><button class="btn btn-primary" id="rt-add">단가 등록</button><button class="btn" id="rt-upload">단가표 업로드</button><button class="btn" id="rt-export">조회 단가표 엑셀</button></div><p id="rt-summary" role="status"></p></div><div class="card scroll-x" style="margin-top:16px" id="rt-list"></div>`;
 const $=id=>body.querySelector('#'+id);$('rt-side').value=side;if(side)$('rt-side').disabled=true;
 let found=[];
 function draw(){const day=$('rt-date').value||todayStr(),selected=$('rt-side').value,q=$('rt-search').value.trim().toLowerCase(),status=$('rt-status').value;
  found=rates.filter(r=>(!selected||r.side===selected)&&(!status||rateState(r,day)===status)&&(!q||[r.name,...RATE_FIELDS.map(k=>r[k])].join(' ').toLowerCase().includes(q)));
  const n=s=>found.filter(r=>rateState(r,day)===s).length;
  $('rt-summary').textContent=`조회 ${found.length}건 · 적용 중 ${n('적용 중')} · 적용 예정 ${n('적용 예정')} · 기간 종료 ${n('기간 종료')} · 중지 ${n('중지')}`;
  $('rt-list').innerHTML=`<table class="data"><thead><tr><th>구분 / 단가명</th><th>거래처 / 기사</th><th>브랜드 / 차종</th><th>출발지 → 도착지</th><th>공급가 / 기준</th><th>추가 조건</th><th>적용기간 / 상태</th><th>관리</th></tr></thead><tbody>${found.map(r=>`<tr><td>${r.side==='sale'?'매출':'매입'} · ${r.kind==='extra'?'추가요금':'기본요금'}<br>${esc(r.name)}</td><td>${esc(r.customer||'전체 거래처')}<br>${esc(r.driver||'전체 기사')}</td><td>${esc(r.brand||'전체 브랜드')}<br>${esc(r.model||'전체 차종')}</td><td>${esc(r.origin||'전체 출발지')} → ${esc(r.destination||'전체 도착지')}</td><td class="num"><b>${nf(r.price)}원</b> / ${esc(basis[r.basis]||r.basis)}<br><span class="small muted">부가세율 ${nf(r.vatPercent||0)}%</span></td><td>${esc(['cargoClass','transportType','otherCondition'].filter(k=>r[k]).map(k=>labels[k]+': '+r[k]).join(' · ')||'없음')}<br><span class="small">거리 ${esc(r.minKm??'')} ~ ${esc(r.maxKm??'')}km · 우선순위 ${nf(r.priority||0)}</span></td><td>${esc(r.from||'시작 제한 없음')} ~ ${esc(r.to||'종료 제한 없음')}<br><span class="badge ${rateState(r,day)==='적용 중'?'green':'amber'}">${rateState(r,day)}</span></td><td><button class="btn btn-sm" data-rate-edit="${esc(r.id)}">상세·수정</button></td></tr>`).join('')||'<tr><td colspan="8">조회 조건에 맞는 단가가 없습니다.</td></tr>'}</tbody></table>`;
  body.querySelectorAll('[data-rate-edit]').forEach(b=>b.onclick=()=>edit(rates.find(r=>r.id===b.dataset.rateEdit)));
 }
 for(const id of ['rt-side','rt-date','rt-status','rt-search'])$(id).oninput=draw;
 $('rt-add').onclick=()=>edit(null,$('rt-side').value||'sale');$('rt-upload').onclick=()=>upload($('rt-side').value||'sale');
 $('rt-export').onclick=()=>exportXlsx({'단가표':[['구분','단가명','요금구분',...RATE_FIELDS.map(k=>labels[k]),'공급가(부가세 별도)','단가 기준','부가세율','시작일','종료일','최소km','최대km','우선순위','상태'],...found.map(r=>[r.side==='sale'?'매출':'매입',r.name,r.kind==='extra'?'추가':'기본',...RATE_FIELDS.map(k=>r[k]||''),r.price,basis[r.basis],r.vatPercent,r.from,r.to,r.minKm,r.maxKm,r.priority,rateState(r,$('rt-date').value||todayStr())].map(safe))]},`M&M_${$('rt-side').value==='sale'?'매출':$('rt-side').value==='purchase'?'매입':'전체'}_단가표.xlsx`);
 draw();
}
