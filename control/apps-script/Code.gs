/**
 * M&M 통합 운송 관제 — Google Sheets 백엔드 (Apps Script)
 *
 * 설치
 * 1. 새 Google 스프레드시트 생성 → ID 복사
 * 2. 확장 프로그램 → Apps Script → 이 코드 붙여넣기
 * 3. 아래 CONFIG의 TOKEN, SPREADSHEET_ID 수정
 * 4. 배포 → 새 배포 → 웹앱 (실행: 나 / 액세스: 모든 사용자) → /exec URL 복사
 * 5. 앱 설정 → Google Sheets에 URL·TOKEN 입력 → 연결 테스트 → 전체 업로드
 */

const CONFIG = {
  TOKEN: 'CHANGE_ME_TO_A_LONG_RANDOM_TOKEN_1234567890',
  SPREADSHEET_ID: 'PUT_SPREADSHEET_ID_HERE',
  DRIVE_FOLDER_ID: '',
  TIMEZONE: 'Asia/Seoul',
  MAX_BULK: 500,
};

const HEADERS = {
  DRIVERS: ['id', 'name', 'phone', 'vehicleNo', 'type', 'preferred', 'avoid', 'aliases', 'status', 'joinedAt', 'memo', 'createdAt', 'updatedAt'],
  EQUIPMENT: ['id', 'plateNo', 'type', 'model', 'capacity', 'driverId', 'driverName', 'insuranceExpiry', 'inspectionExpiry', 'status', 'memo', 'createdAt', 'updatedAt'],
  PRODUCTS: ['id', 'brand', 'model', 'trim', 'price', 'dealer', 'region', 'sourceUrl', 'updatedAt', 'note', 'createdAt'],
  INCIDENTS: ['id', 'date', 'type', 'severity', 'driverId', 'driverName', 'vehicleNo', 'vin', 'customer', 'destination', 'description', 'cost', 'status', 'photos', 'request', 'createdBy', 'createdAt', 'updatedAt'],
  ASSIGNMENTS: ['id', 'date', 'driverId', 'driverName', 'vehicleNo', 'orderIds', 'regions', 'totalCount', 'totalTurns', 'score', 'reasons', 'status', 'createdAt', 'updatedAt'],
  DISPATCH: ['id', 'dedupeKey', 'date', 'departTime', 'customer', 'origin', 'destination', 'vin', 'color', 'position', 'model', 'driver', 'count', 'turn', 'code', 'note', 'billed', 'unpaid', 'unloadName', 'unloadPhone', 'customerName', 'customerPhone', 'vehicleNo', 'driverPhone', 'status', 'supportAmount', 'brand', 'region', 'sourceFile', 'sheet', 'rowNumber', 'importedAt'],
  IMPORTS: ['id', 'fileName', 'sheets', 'totalRows', 'inserted', 'updated', 'dates', 'warnings', 'importedAt'],
};

const JSON_FIELDS = ['preferred', 'avoid', 'aliases', 'orderIds', 'regions', 'reasons', 'photos', 'sheets', 'dates', 'warnings'];

function doGet(e) {
  const token = (e && e.parameter && e.parameter.token) || '';
  if (!safeEqual_(token, CONFIG.TOKEN)) return json_({ ok: false, error: '인증 토큰이 올바르지 않습니다.' });
  return json_({ ok: true, data: ping_() });
}

function doPost(e) {
  let body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!safeEqual_(String(body.token || ''), CONFIG.TOKEN)) {
      return json_({ ok: false, error: '인증 토큰이 올바르지 않습니다.' });
    }
    const action = String(body.action || '');
    const payload = body.payload || {};
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) return json_({ ok: false, error: '다른 요청이 처리 중입니다. 잠시 후 다시 시도하세요.' });
    try {
      switch (action) {
        case 'ping': return json_({ ok: true, data: ping_() });
        case 'list': return json_({ ok: true, data: list_(payload) });
        case 'upsert': return json_({ ok: true, data: upsert_(payload) });
        case 'delete': return json_({ ok: true, data: delete_(payload) });
        case 'uploadPhoto': return json_({ ok: true, data: uploadPhoto_(payload) });
        case 'setup': return json_({ ok: true, data: setup_() });
        default: return json_({ ok: false, error: '지원하지 않는 action: ' + action });
      }
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

/* ------------------------------------------------------------------ */
function ping_() {
  const ss = ss_();
  return {
    mode: 'appsScript',
    spreadsheetTitle: ss.getName(),
    tabCount: ss.getSheets().length,
    version: '1.0.0',
    checkedAt: new Date().toISOString(),
  };
}

function setup_() {
  const ss = ss_();
  const created = [];
  Object.keys(HEADERS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) { sh = ss.insertSheet(name); created.push(name); }
    if (sh.getLastRow() < 1) {
      sh.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]);
      sh.setFrozenRows(1);
    }
  });
  return { created: created, sheets: Object.keys(HEADERS) };
}

function list_(payload) {
  var name = tableName_(payload.table);
  var sh = ensure_(name);
  var last = sh.getLastRow();
  if (last < 2) return { table: name, rows: [] };
  var values = sh.getRange(2, 1, last - 1, HEADERS[name].length).getValues();
  var rows = values.map(function (row) { return rowToObj_(name, row); }).filter(function (r) { return r.id; });
  return { table: name, rows: rows };
}

function upsert_(payload) {
  var name = tableName_(payload.table);
  var rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (!rows.length) return { table: name, upserted: 0 };
  if (rows.length > CONFIG.MAX_BULK) throw new Error('한 번에 ' + CONFIG.MAX_BULK + '건까지만 저장할 수 있습니다.');
  var sh = ensure_(name);
  var headers = HEADERS[name];
  var last = sh.getLastRow();
  var ids = {};
  if (last >= 2) {
    var existing = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < existing.length; i++) ids[String(existing[i][0])] = i + 2;
  }
  var appends = [];
  var now = new Date().toISOString();
  rows.forEach(function (obj) {
    if (!obj || !obj.id) return;
    var values = headers.map(function (h) {
      if (JSON_FIELDS.indexOf(h) >= 0) {
        var v = obj[h];
        return v === undefined || v === null ? '' : (typeof v === 'string' ? v : JSON.stringify(v));
      }
      var val = obj[h];
      return val === undefined || val === null ? '' : val;
    });
    var rowIndex = ids[String(obj.id)];
    if (rowIndex) {
      sh.getRange(rowIndex, 1, 1, headers.length).setValues([values]);
    } else {
      appends.push(values);
      ids[String(obj.id)] = last + appends.length;
    }
  });
  if (appends.length) sh.getRange(last + 1, 1, appends.length, headers.length).setValues(appends);
  return { table: name, upserted: rows.length, appended: appends.length, at: now };
}

function delete_(payload) {
  var name = tableName_(payload.table);
  var ids = Array.isArray(payload.ids) ? payload.ids.map(String) : [];
  if (!ids.length) return { table: name, deleted: 0 };
  var sh = ensure_(name);
  var last = sh.getLastRow();
  if (last < 2) return { table: name, deleted: 0 };
  var values = sh.getRange(2, 1, last - 1, 1).getValues();
  var targets = [];
  for (var i = 0; i < values.length; i++) if (ids.indexOf(String(values[i][0])) >= 0) targets.push(i + 2);
  targets.sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); });
  return { table: name, deleted: targets.length };
}

function uploadPhoto_(payload) {
  if (!CONFIG.DRIVE_FOLDER_ID) throw new Error('CONFIG.DRIVE_FOLDER_ID가 설정되지 않았습니다.');
  var dataUrl = String(payload.dataUrl || '');
  var m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error('이미지 데이터 형식이 올바르지 않습니다.');
  var bytes = Utilities.base64Decode(m[2]);
  var blob = Utilities.newBlob(bytes, m[1], payload.name || ('photo_' + Date.now() + '.jpg'));
  var folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  var file = folder.createFile(blob);
  return { fileId: file.getId(), url: file.getUrl(), size: bytes.length, name: blob.getName() };
}

/* ------------------------------------------------------------------ */
function ss_() {
  if (!CONFIG.SPREADSHEET_ID || CONFIG.SPREADSHEET_ID.indexOf('PUT_') === 0) {
    throw new Error('CONFIG.SPREADSHEET_ID를 설정하세요.');
  }
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function tableName_(value) {
  var name = String(value || '').toUpperCase();
  if (!HEADERS[name]) throw new Error('지원하지 않는 테이블: ' + value);
  return name;
}

function ensure_(name) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS[name].length).setFontWeight('bold').setBackground('#0B1E33').setFontColor('#FFFFFF');
    return sh;
  }
  if (sh.getLastRow() < 1) {
    sh.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function rowToObj_(name, row) {
  var obj = {};
  HEADERS[name].forEach(function (h, i) {
    var v = row[i];
    if (JSON_FIELDS.indexOf(h) >= 0) {
      try { obj[h] = v ? JSON.parse(v) : []; } catch (e) { obj[h] = v; }
    } else if (v instanceof Date) {
      obj[h] = Utilities.formatDate(v, CONFIG.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
    } else {
      obj[h] = v;
    }
  });
  return obj;
}

function safeEqual_(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
