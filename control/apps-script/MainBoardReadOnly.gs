/** Separate read-only bridge. Never combine this file with Code.gs (both define doPost).
 * Script Properties: SOURCE_SPREADSHEET_ID, READ_TOKEN (32+ random characters).
 * No source sheet is created, edited, sorted, shared, or deleted by this script.
 * A shared token authorizes administrator imports only; it is not per-employee RBAC.
 */
function doGet(){return mainJson_({ok:false,error:'읽기 전용 배차 조회는 인증된 POST 요청을 사용하세요.'});}
function doPost(event){
  try{
    var config=PropertiesService.getScriptProperties();
    var token=config.getProperty('READ_TOKEN')||'',sourceId=config.getProperty('SOURCE_SPREADSHEET_ID')||'';
    if(token.length<32||!sourceId)throw Error('Script Properties의 SOURCE_SPREADSHEET_ID와 READ_TOKEN을 설정하세요.');
    var body=JSON.parse(event&&event.postData&&event.postData.contents||'{}');
    if(!mainEqual_(String(body.token||''),token))throw Error('연결 토큰이 일치하지 않습니다.');
    var p=body.payload||{};
    if(String(p.spreadsheetId||'')!==sourceId)throw Error('설정된 원본 스프레드시트만 조회할 수 있습니다.');
    var source=SpreadsheetApp.openById(sourceId);
    if(body.action==='mainMeta')return mainJson_({ok:true,data:{spreadsheetId:sourceId,title:source.getName(),version:'main-readonly-1',sheets:source.getSheets().filter(function(s){return !s.isSheetHidden()&&mainTab_(s.getName(),String(p.year||''));}).map(function(s){return{sheetId:s.getSheetId(),title:s.getName(),lastRow:s.getLastRow(),columns:s.getLastColumn()};})}});
    if(body.action!=='mainRows')throw Error('읽기 전용 mainMeta/mainRows만 지원합니다.');
    var sheet=source.getSheetById(Number(p.sheetId));
    if(!sheet||sheet.isSheetHidden())throw Error('조회할 일자 탭이 없습니다.');
    var expected=mainTab_(sheet.getName(),String(p.year||''));
    if(!mainDate_(p.from)||!mainDate_(p.to)||p.from>p.to||p.from.slice(0,4)!==p.to.slice(0,4)||p.year!==p.from.slice(0,4)||(Date.parse(p.to)-Date.parse(p.from))/86400000>30||!expected||expected<p.from||expected>p.to)throw Error('선택한 기간에 해당하는 일자 탭만 조회할 수 있습니다.');
    var last=sheet.getLastRow(),columns=Math.min(sheet.getLastColumn(),60);
    if(!columns)return mainJson_({ok:true,data:{sheetId:sheet.getSheetId(),title:sheet.getName(),headers:[],rows:[],nextRow:null}});
    var start=Number(p.startRow||2),limit=Number(p.limit||500);
    if(!Number.isInteger(start)||start<2||!Number.isInteger(limit)||limit<1||limit>500)throw Error('조회 범위를 확인하세요.');
    var count=Math.max(0,Math.min(limit,last-start+1));
    var values=count?sheet.getRange(start,1,count,columns).getDisplayValues():[];
    return mainJson_({ok:true,data:{sheetId:sheet.getSheetId(),title:sheet.getName(),headers:sheet.getRange(1,1,1,columns).getDisplayValues()[0],rows:values.map(function(row,i){return{rowNumber:start+i,values:row};}),nextRow:start+count<=last?start+count:null}});
  }catch(error){return mainJson_({ok:false,error:String(error.message||error)});}
}
function mainDate_(value){return /^20\d{2}-\d{2}-\d{2}$/.test(String(value||''))&&!isNaN(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
function mainTab_(name,year){var m=String(name).match(/^(\d{2})(\d{2})$/),f=String(name).match(/^(20\d{2})[-.]?(\d{2})[-.]?(\d{2})$/);var date=f?f[1]+'-'+f[2]+'-'+f[3]:m?year+'-'+m[1]+'-'+m[2]:'';return mainDate_(date)?date:'';}
function mainEqual_(a,b){if(a.length!==b.length)return false;var diff=0;for(var i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function mainJson_(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
