import {esc,icon} from '../core/utils.js';
import {visibleMenuGroups,parseHash} from './shell.js';
import {supabaseMode,workspaceProfile} from '../core/supabase-session.js';
import {canOpenPage} from '../core/workspace-access.js';
import {state} from '../core/data.js';
import {validDate} from '../core/schedule.js';

const workflows=[
 ['배차 준비·확정','dispatch',[
   ['board','배차 리스트'],['board','편성 묶음','view=groups'],['formation','가용 기사·장비','view=available','board'],
   ['formation','동선으로 편성','tab=packing'],['formation','초안 검토·확정','tab=review'],['customer-share','거래처 안내']]],
 ['차량·안전관리','safety',[['drivers','기사 정보'],['equipment','운송차량'],['vehicle-safety','차량 안전계획서'],['safety','안전점검']]],
 ['KGM 배차','kgm',[['kgm-import','엑셀 업로드'],['kgm-resources','가용 기사·차량'],['kgm','전용 배차판'],['kgm-notify','고객 안내']]],
 ['포워딩·컨테이너','forwarding',[['forwarding-orders','오더 관리'],['forwarding-containers','컨테이너 운송'],['forwarding-advances','대납금'],['forwarding-settlement','매출·매입 정산']]],
 ['정산·마감','rates',[['sale-rates','매출 단가'],['purchase-rates','매입 단가'],['settlement','정산·마감']]]
];
export function renderWorkMenu(view){
 const allowed=id=>!supabaseMode()||canOpenPage(workspaceProfile()?.role,id);
 const groups=visibleMenuGroups().filter(g=>g.items.length);
 const date=parseHash().params.get('date')||state.workdate;
 const key=s=>String(s).replace(/\s+/g,'').toLocaleLowerCase('ko');
 const cards=workflows.map(([title,area,steps])=>{
   const visible=steps.filter(([id,,,route])=>allowed(id)&&(!route||allowed(route)));
   if(!visible.length)return '';
   return `<section class="wm-flow" data-area="${area}"><h3>${title}</h3><div>${visible.map(([id,label,query,route])=>{
     const params=new URLSearchParams(query||'');if(validDate(date)&&['board','formation','fleet'].includes(route||id))params.set('date',date);
     return `<a href="#/${route||id}${params.size?'?'+esc(params.toString()):''}" data-link>${label}</a>`;
   }).join('')}</div></section>`;
 }).join('');
 view.innerHTML=`<section class="wm-home"><label class="wm-search">메뉴 검색<input class="input" type="search" placeholder="배차, 차량, 안전계획서 등" autocomplete="off"></label>
 <div data-wm-flows>${cards?'<h2>업무별 바로가기</h2><div class="wm-grid">'+cards+'</div>':''}</div>
 <h2>부서별 메뉴</h2><p data-wm-count role="status"></p><div class="wm-grid" data-wm-groups></div></section>`;
 const input=view.querySelector('input'),host=view.querySelector('[data-wm-groups]');
 function draw(){
   const q=key(input.value);let count=0;
   host.innerHTML=groups.map(g=>{
     const items=g.items.filter(i=>!q||key(g.group+' '+i.label).includes(q));
     count+=items.length;
     return items.length?`<section class="wm-dept" data-area="${esc(g.workspace)}"><h3>${esc(g.group)}</h3>${items.map(i=>`<a data-link href="${esc(i.hash)}">${icon(i.icon)} ${esc(i.label)}</a>`).join('')}</section>`:'';
   }).join('');
   const flows=view.querySelector('[data-wm-flows]');
   for(const card of flows.querySelectorAll('.wm-flow')){
     const title=card.querySelector('h3').textContent;let found=false;
     for(const link of card.querySelectorAll('a')){link.hidden=!!q&&!key(title+' '+link.textContent).includes(q);found||=!link.hidden;}
     card.hidden=!found;
   }
   flows.hidden=!flows.querySelector('.wm-flow:not([hidden])');
   view.querySelector('[data-wm-count]').textContent=q?(count?'부서 메뉴 '+count+'개 일치':flows.hidden?'일치하는 메뉴가 없습니다.':'업무별 바로가기에서 선택하세요.'):'';
 }
 input.oninput=draw;draw();
}
