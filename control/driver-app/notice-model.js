export const NOTICE_CATEGORIES=['사고 전파','브랜드별 출고 주의사항','기타 공지'];
export const noticeCategory=n=>NOTICE_CATEGORIES.includes(n.category)?n.category:['사고 사례','사고'].includes(n.category)?NOTICE_CATEGORIES[0]:NOTICE_CATEGORIES[2];
export function noticeList(rows,{category='',brand='',query='',unread=false}={}){
 const q=query.trim().toLocaleLowerCase();
 return rows.filter(n=>(!category||noticeCategory(n)===category)&&(!brand||n.brand===brand)&&(!unread||!n.read)&&(!q||[n.title,n.summary,n.body,n.brand].join(' ').toLocaleLowerCase().includes(q)))
 .sort((a,b)=>Number(!!b.important&&!b.read)-Number(!!a.important&&!a.read)||Number(!!b.pinned)-Number(!!a.pinned)||Number(!!a.read)-Number(!!b.read)||String(b.updated_at||'').localeCompare(String(a.updated_at||''))||String(a.id).localeCompare(String(b.id)));
}
export function validateNotice(input){
 const result={id:input.id||null,revision:input.revision??null,title:String(input.title||'').trim(),summary:String(input.summary||'').trim(),body:String(input.body||'').trim(),category:input.category,brand:String(input.brand||'').trim().toUpperCase(),important:input.important===true,pinned:input.pinned===true,expiresAt:input.expiresAt||null};
 if(!result.title||result.title.length>150||!result.body||result.body.length>10000||result.summary.length>200||!NOTICE_CATEGORIES.includes(result.category))throw Error('제목·본문·공지 구분을 확인하세요.');
 if(result.brand.length>40||(result.category===NOTICE_CATEGORIES[1]&&!result.brand))throw Error('출고 주의사항의 브랜드를 입력하세요.');
 if(result.category!==NOTICE_CATEGORIES[1])result.brand='';
 if(result.expiresAt&&(!Number.isFinite(Date.parse(result.expiresAt))||Date.parse(result.expiresAt)<=Date.now()))throw Error('게시 종료일은 오늘 이후로 설정하세요.');
 return result;
}

