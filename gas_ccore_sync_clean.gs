// ================================================================
// gas_ccore_sync_clean.gs  【クリーン版 / 2026-07-15】
// GASエディタで Ctrl+A → Delete → これを貼り付け → Ctrl+S
// ================================================================

// ---- 設定エリア（ここだけ書き換えてください） ----

var CCORE_API_BASE_URL = 'https://www.genspark.ai/api/code_sandbox_light/preview/fded4bcd-6c98-436e-8159-4d91facf0621/tables';

var SPREADSHEET_ID = '1-1QjgVjdbeeTqeRb17vDXwjvmnCLvDtiMKBCa9MZzSs';

var SHEET_NAME = 'カレンダー予定一覧';

var STAFF_MAPPING = [
  { calendarId: 'koike@8sin.co.jp',         calendarName: '小池',       assignee: '小池'       },
  { calendarId: 'hamano8sin@gmail.com',      calendarName: '濱野',       assignee: '濱野'       },
  { calendarId: 'takao8sin@gmail.com',       calendarName: '高尾',       assignee: '高尾'       },
  { calendarId: 'nishiwaki8400@gmail.com',   calendarName: '西脇',       assignee: '西脇'       },
  { calendarId: 'youngkwang8sin@gmail.com',  calendarName: 'YOUNG',      assignee: 'YOUNGKWANG' },
  { calendarId: 'satsuei8sin@gmail.com',     calendarName: '松永',       assignee: '松永'       },
  { calendarId: 'tomimura@8sin.co.jp',       calendarName: '富村',       assignee: '富村'       },
  { calendarId: 'shi-maeda@8sin.co.jp',      calendarName: '前田',       assignee: '前田'       },
  { calendarId: 'satou@8sin.co.jp',          calendarName: '佐藤',       assignee: '佐藤'       },
  { calendarId: 'murakami@8sin.co.jp',       calendarName: '村上',       assignee: '村上'       },
  { calendarId: '',                          calendarName: '四船',       assignee: '四船'       },
  { calendarId: '',                          calendarName: '吉岡',       assignee: '吉岡'       }
];

var INCLUDE_UNKNOWN_CALENDARS = false;

// ---- 以下は変更不要です ----

function doGet(e) {
  var output = ContentService.createTextOutput().setMimeType(ContentService.MimeType.JSON);
  try {
    var params    = e ? (e.parameter || {}) : {};
    var daysAhead = parseInt(params.daysAhead || '30', 10);
    var daysBack  = parseInt(params.daysBack  || '0',  10);
    var mode      = (params.mode || 'json').toLowerCase();
    var ccoreUrl  = params.ccoreUrl || CCORE_API_BASE_URL;
    if (isNaN(daysAhead) || daysAhead < 0) { daysAhead = 30; }
    if (daysAhead > 365) { daysAhead = 365; }
    if (isNaN(daysBack) || daysBack < 0) { daysBack = 0; }
    if (daysBack > 365) { daysBack = 365; }
    Logger.log('doGet mode=' + mode + ' daysAhead=' + daysAhead + ' daysBack=' + daysBack);
    var events = _fetchAllCalendarEvents(daysBack, daysAhead);
    Logger.log('取得イベント数: ' + events.length);
    var pushResult  = null;
    var sheetResult = null;
    if (mode === 'push' || mode === 'all') {
      pushResult = _pushToCCORE(events, ccoreUrl);
    }
    if (mode === 'sheet' || mode === 'all') {
      sheetResult = _writeToSpreadsheet(events);
    }
    var response = {
      ok: true,
      fetchedAt: new Date().toISOString(),
      mode: mode,
      daysBack: daysBack,
      daysAhead: daysAhead,
      count: events.length,
      events: events
    };
    if (pushResult)  { response.push  = pushResult;  }
    if (sheetResult) { response.sheet = sheetResult; }
    output.setContent(JSON.stringify(response));
  } catch (err) {
    Logger.log('doGet ERROR: ' + err.toString());
    output.setContent(JSON.stringify({ ok: false, error: err.toString() }));
  }
  return output;
}

function _fetchAllCalendarEvents(daysBack, daysAhead) {
  var now   = new Date();
  var start = new Date(now.getTime() - daysBack  * 86400000);
  var end   = new Date(now.getTime() + daysAhead * 86400000);
  start.setHours(0,  0,  0,   0);
  end.setHours(23, 59, 59, 999);
  var allCals   = CalendarApp.getAllCalendars();
  var allEvents = [];
  for (var ci = 0; ci < allCals.length; ci++) {
    var cal      = allCals[ci];
    var calId    = cal.getId();
    var calName  = cal.getName();
    var assignee = _resolveAssignee(calId, calName);
    if (!assignee) {
      if (!INCLUDE_UNKNOWN_CALENDARS) { continue; }
      assignee = '未分類';
    }
    Logger.log('カレンダー取得: ' + calName + ' -> ' + assignee);
    try {
      var events = cal.getEvents(start, end);
      for (var ei = 0; ei < events.length; ei++) {
        var ev       = events[ei];
        var startDt  = ev.getStartTime();
        var endDt    = ev.getEndTime();
        var isAllDay = ev.isAllDayEvent();
        var dateStr  = Utilities.formatDate(startDt, 'Asia/Tokyo', 'yyyy-MM-dd');
        var startStr = isAllDay ? null : Utilities.formatDate(startDt, 'Asia/Tokyo', 'HH:mm');
        var endStr   = isAllDay ? null : Utilities.formatDate(endDt,   'Asia/Tokyo', 'HH:mm');
        var durHrs   = isAllDay ? 0 : Math.round((endDt.getTime() - startDt.getTime()) / 360000) / 10;
        var gasId    = calId + '__' + ev.getId();
        allEvents.push({
          gas_event_id   : gasId,
          calendar_id    : calId,
          calendar_name  : calName,
          assignee       : assignee,
          title          : ev.getTitle()       || '（タイトルなし）',
          date           : dateStr,
          start_time     : startStr,
          end_time       : endStr,
          duration_hours : durHrs,
          all_day        : isAllDay,
          notes          : ev.getDescription() || '',
          location       : ev.getLocation()    || '',
          gas_synced_at  : Date.now()
        });
      }
    } catch (calErr) {
      Logger.log('カレンダーエラー スキップ: ' + calName + ' ' + calErr.toString());
    }
  }
  allEvents.sort(function(a, b) {
    var ka = a.date + (a.start_time || '00:00');
    var kb = b.date + (b.start_time || '00:00');
    if (ka < kb) { return -1; }
    if (ka > kb) { return  1; }
    return 0;
  });
  return allEvents;
}

function _pushToCCORE(events, baseUrl) {
  if (!baseUrl || baseUrl.indexOf('YOUR_CCORE') >= 0) {
    Logger.log('CCORE_API_BASE_URL 未設定のため push スキップ');
    return { added: 0, skipped: events.length, errors: 0 };
  }
  var schedulesUrl = baseUrl.replace(/\/+$/, '') + '/schedules';
  Logger.log('POST先: ' + schedulesUrl);
  var existingIds = _fetchExistingGasEventIds(schedulesUrl);
  var existSet    = {};
  for (var xi = 0; xi < existingIds.length; xi++) {
    existSet[existingIds[xi]] = true;
  }
  var added   = 0;
  var skipped = 0;
  var errors  = 0;
  for (var ei = 0; ei < events.length; ei++) {
    var ev = events[ei];
    if (existSet[ev.gas_event_id]) {
      skipped++;
      continue;
    }
    var notesFull = ev.notes + (ev.location ? '\n場所: ' + ev.location : '');
    var payload = JSON.stringify({
      assignee       : ev.assignee,
      date           : ev.date,
      title          : ev.title,
      start_time     : ev.start_time,
      end_time       : ev.end_time,
      duration_hours : ev.duration_hours,
      is_recurring   : false,
      recur_days     : [],
      notes          : notesFull,
      gas_event_id   : ev.gas_event_id,
      gas_synced_at  : ev.gas_synced_at
    });
    try {
      var resp = UrlFetchApp.fetch(schedulesUrl, {
        method             : 'post',
        contentType        : 'application/json',
        payload            : payload,
        muteHttpExceptions : true
      });
      var code = resp.getResponseCode();
      if (code === 200 || code === 201) {
        added++;
        Logger.log('POST OK: [' + ev.assignee + '] ' + ev.date + ' ' + ev.title);
      } else {
        errors++;
        Logger.log('POST NG[' + code + ']: ' + ev.title);
      }
    } catch (fetchErr) {
      errors++;
      Logger.log('POST ERROR: ' + ev.title + ' ' + fetchErr.toString());
    }
  }
  Logger.log('push完了: added=' + added + ' skipped=' + skipped + ' errors=' + errors);
  return { added: added, skipped: skipped, errors: errors };
}

function _fetchExistingGasEventIds(schedulesUrl) {
  var ids     = [];
  var page    = 1;
  var maxPage = 20;
  while (page <= maxPage) {
    try {
      var url  = schedulesUrl + '?limit=500&page=' + page;
      var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (resp.getResponseCode() !== 200) { break; }
      var data    = JSON.parse(resp.getContentText());
      var records = data.data || [];
      if (records.length === 0) { break; }
      for (var ri = 0; ri < records.length; ri++) {
        if (records[ri].gas_event_id) { ids.push(records[ri].gas_event_id); }
      }
      if (!data.total || page * 500 >= parseInt(data.total, 10)) { break; }
      page++;
    } catch (e) {
      Logger.log('既存ID取得エラー page=' + page + ': ' + e.toString());
      break;
    }
  }
  return ids;
}

function _writeToSpreadsheet(events) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  sheet.clearContents();
  sheet.clearFormats();
  var now     = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
  var headers = ['カレンダーID', '担当者', 'スケジュール名', '日付', '開始時間', '終了時間', '時間(h)', '終日', 'メモ', '場所', 'gas_event_id', '取込日時'];
  var rows    = [headers];
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    rows.push([
      ev.calendar_id,
      ev.assignee,
      ev.title,
      ev.date,
      ev.start_time  || '',
      ev.end_time    || '',
      ev.duration_hours,
      ev.all_day ? '○' : '',
      ev.notes,
      ev.location,
      ev.gas_event_id,
      now
    ]);
  }
  if (rows.length > 1) {
    sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
  }
  var hdr = sheet.getRange(1, 1, 1, headers.length);
  hdr.setFontWeight('bold');
  hdr.setBackground('#1a73e8');
  hdr.setFontColor('#ffffff');
  sheet.autoResizeColumns(1, headers.length);
  sheet.setFrozenRows(1);
  if (sheet.getFilter()) { sheet.getFilter().remove(); }
  sheet.getRange(1, 1, rows.length, headers.length).createFilter();
  var count = rows.length - 1;
  Logger.log('スプシ書き出し完了: ' + count + '件');
  return { sheet: SHEET_NAME, count: count };
}

function _resolveAssignee(calId, calName) {
  for (var i = 0; i < STAFF_MAPPING.length; i++) {
    var m = STAFF_MAPPING[i];
    if (m.calendarId && m.calendarId.length > 0 && m.calendarId.toLowerCase() === calId.toLowerCase()) {
      return m.assignee;
    }
    if (m.calendarName && calName.indexOf(m.calendarName) >= 0) {
      return m.assignee;
    }
  }
  return null;
}

// ---- テスト・デバッグ用関数 ----

function debugListCalendars() {
  var cals = CalendarApp.getAllCalendars();
  Logger.log('カレンダー一覧 (' + cals.length + '件)');
  for (var i = 0; i < cals.length; i++) {
    var cal = cals[i];
    var a   = _resolveAssignee(cal.getId(), cal.getName());
    Logger.log((a ? '[OK] ' : '[未] ') + cal.getName() + ' / ID: ' + cal.getId() + ' / 担当者: ' + (a || '未マッピング'));
  }
}

function debugFetch7Days() {
  var events = _fetchAllCalendarEvents(0, 7);
  Logger.log('直近7日間のイベント: ' + events.length + '件');
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    Logger.log('[' + ev.assignee + '] ' + ev.date + ' ' + (ev.start_time || '終日') + ' ' + ev.title);
  }
}

function manualSyncToSheetOnly() {
  Logger.log('スプシ書き出し開始');
  var events = _fetchAllCalendarEvents(0, 30);
  Logger.log('取得件数: ' + events.length);
  var result = _writeToSpreadsheet(events);
  Logger.log('完了: ' + result.count + '件');
}

function manualSyncToCCORE() {
  Logger.log('C-CORE 送信開始');
  var events = _fetchAllCalendarEvents(0, 30);
  Logger.log('取得件数: ' + events.length);
  var result = _pushToCCORE(events, CCORE_API_BASE_URL);
  Logger.log('結果: added=' + result.added + ' skipped=' + result.skipped + ' errors=' + result.errors);
}

function manualSyncAll() {
  Logger.log('全同期開始（スプシ + C-CORE）');
  var events      = _fetchAllCalendarEvents(0, 30);
  Logger.log('取得件数: ' + events.length);
  var sheetResult = _writeToSpreadsheet(events);
  var pushResult  = _pushToCCORE(events, CCORE_API_BASE_URL);
  Logger.log('スプシ: ' + sheetResult.count + '件');
  Logger.log('C-CORE: added=' + pushResult.added + ' skipped=' + pushResult.skipped + ' errors=' + pushResult.errors);
}

function triggerDailySync() {
  try {
    var events = _fetchAllCalendarEvents(0, 30);
    _writeToSpreadsheet(events);
    _pushToCCORE(events, CCORE_API_BASE_URL);
    Logger.log('triggerDailySync 完了: ' + events.length + '件');
  } catch (e) {
    Logger.log('triggerDailySync ERROR: ' + e.toString());
  }
}
