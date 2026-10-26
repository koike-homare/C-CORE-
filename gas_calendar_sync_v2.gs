/**
 * ============================================================
 *  C-CORE  —  Google カレンダー → スプレッドシート 同期スクリプト v2
 *  gas_calendar_sync_v2.gs
 * ============================================================
 *
 * 【概要】
 *  koike@8sin.co.jp にアクセス権のある「全カレンダー」を走査し
 *  ① スプレッドシートに書き出す（全イベント一覧）
 *  ② Web App として C-CORE アプリから GET で取得できる JSON を返す
 *     → 各スタッフ名のマッピングでスケジュールを自動振り分け
 *
 * 【使い方】
 *  1. https://script.google.com で新しいプロジェクトを作成
 *  2. このコードを貼り付ける
 *  3. SPREADSHEET_ID を対象スプシのIDに書き換える
 *     （URLの /d/〇〇〇/ の部分）
 *  4. STAFF_MAPPING を実際のスタッフ設定に合わせる
 *     ※ カレンダー名 or カレンダーIDで突き合わせる
 *  5. 「デプロイ」→「新しいデプロイ」
 *       種類         : ウェブアプリ
 *       実行ユーザー : 自分 (Me)
 *       アクセス     : 全員 (Anyone)
 *  6. 発行された Web App URL を C-CORE の「GAS設定」に登録する
 *
 * 【動作】
 *  - GETアクセス時：JSON を返す（C-CORE 側の同期ボタンから呼ばれる）
 *  - POST / 手動実行時：スプレッドシートへの書き出しも実行
 *
 * 【GETパラメータ】
 *   daysAhead  : 今日から何日先まで（デフォルト 60）
 *   daysBack   : 今日から何日前まで（デフォルト 0）
 *   mode       : "json"（デフォルト）| "sheet" でスプシ書き込みも実行
 * ============================================================
 */

// ────────────────────────────────────────────────────────────
//  設定: スプレッドシート ID
//  URL: https://docs.google.com/spreadsheets/d/★ここ★/edit
// ────────────────────────────────────────────────────────────
var SPREADSHEET_ID = '1-1QjgVjdbeeTqeRb17vDXwjvmnCLvDtiMKBCa9MZzSs';

// シート名（なければ自動作成）
var SHEET_NAME = 'カレンダー取込';

// ────────────────────────────────────────────────────────────
//  設定: スタッフマッピング
//  カレンダーのIDまたは名前（部分一致）でスタッフ名を特定
//  ※ calendarName: カレンダー名に含まれる文字列（部分一致）
//  ※ calendarId  : カレンダーのメールアドレス（完全一致）
//  どちらかが一致すれば OK。両方書いても構わない。
// ────────────────────────────────────────────────────────────
var STAFF_MAPPING = [
  { calendarId: 'koike@8sin.co.jp',          assignee: '小池'        },
  { calendarId: 'hamano8sin@gmail.com',       assignee: '濱野'        },
  { calendarId: 'takao8sin@gmail.com',        assignee: '高尾'        },
  { calendarId: 'nishiwaki8400@gmail.com',    assignee: '西脇'        },
  { calendarId: 'youngkwang8sin@gmail.com',   assignee: 'YOUNGKWANG'  },
  { calendarId: 'satsuei8sin@gmail.com',      assignee: '松永'        },
  // カレンダー名での部分一致例（上記で取れない場合の補完）
  { calendarName: '小池',    assignee: '小池'       },
  { calendarName: '濱野',    assignee: '濱野'       },
  { calendarName: '高尾',    assignee: '高尾'       },
  { calendarName: '西脇',    assignee: '西脇'       },
  { calendarName: 'YOUNG',   assignee: 'YOUNGKWANG' },
  { calendarName: '松永',    assignee: '松永'       },
  { calendarName: '四船信宏', assignee: '四船'      },
  { calendarName: '吉岡',    assignee: '吉岡'      },
];

// マッピング未定義のカレンダーは取得するか（true=取得・assignee="未分類"）
var INCLUDE_UNKNOWN_CALENDARS = true;

// ────────────────────────────────────────────────────────────
//  doGet: Web App エントリポイント（C-CORE からの同期呼び出し）
// ────────────────────────────────────────────────────────────
function doGet(e) {
  var output = ContentService
    .createTextOutput()
    .setMimeType(ContentService.MimeType.JSON);

  try {
    var params    = e ? (e.parameter || {}) : {};
    var daysAhead = parseInt(params.daysAhead || '60',  10);
    var daysBack  = parseInt(params.daysBack  || '0',   10);
    var mode      = params.mode || 'json';  // "json" | "sheet"

    if (isNaN(daysAhead) || daysAhead < 0)  daysAhead = 60;
    if (daysAhead > 365)                    daysAhead = 365;
    if (isNaN(daysBack)  || daysBack  < 0)  daysBack  = 0;
    if (daysBack  > 365)                    daysBack  = 365;

    var events = _fetchAllEvents(daysBack, daysAhead);

    // mode=sheet のときはスプレッドシートにも書き出す
    if (mode === 'sheet') {
      _writeToSheet(events);
    }

    output.setContent(JSON.stringify({
      ok        : true,
      fetchedAt : new Date().toISOString(),
      daysBack  : daysBack,
      daysAhead : daysAhead,
      count     : events.length,
      events    : events
    }));

  } catch (err) {
    Logger.log('doGet error: ' + err.toString());
    output.setContent(JSON.stringify({
      ok    : false,
      error : err.toString()
    }));
  }

  return output;
}

// ────────────────────────────────────────────────────────────
//  手動実行: スプレッドシートへの書き出し（テスト・定期実行用）
// ────────────────────────────────────────────────────────────
function syncToSheet() {
  var events = _fetchAllEvents(0, 60);
  var count  = _writeToSheet(events);
  Logger.log('スプレッドシートに ' + count + ' 件を書き出しました');
  return count;
}

// ────────────────────────────────────────────────────────────
//  コアロジック: koike@8sin.co.jp の全カレンダーを取得
// ────────────────────────────────────────────────────────────
function _fetchAllEvents(daysBack, daysAhead) {
  var now   = new Date();
  var start = new Date(now.getTime() - daysBack  * 86400000);
  var end   = new Date(now.getTime() + daysAhead * 86400000);

  // 今日の 00:00 を start の基準にする
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  // アクセス可能な全カレンダーを取得
  var allCals = CalendarApp.getAllCalendars();
  Logger.log('取得できるカレンダー数: ' + allCals.length);

  var allEvents = [];

  allCals.forEach(function(cal) {
    var calId   = cal.getId();
    var calName = cal.getName();

    // スタッフ名を特定
    var assignee = _resolveAssignee(calId, calName);
    if (!assignee && !INCLUDE_UNKNOWN_CALENDARS) return;
    if (!assignee) assignee = '未分類(' + calName + ')';

    Logger.log('  [' + calName + '] (' + calId + ') → ' + assignee);

    try {
      var events = cal.getEvents(start, end);
      Logger.log('    イベント数: ' + events.length);

      events.forEach(function(ev) {
        var startDt  = ev.getStartTime();
        var endDt    = ev.getEndTime();
        var isAllDay = ev.isAllDayEvent();

        var dateStr      = Utilities.formatDate(startDt, 'Asia/Tokyo', 'yyyy-MM-dd');
        var startTimeStr = isAllDay ? '00:00' : Utilities.formatDate(startDt, 'Asia/Tokyo', 'HH:mm');
        var endTimeStr   = isAllDay ? '23:59' : Utilities.formatDate(endDt,   'Asia/Tokyo', 'HH:mm');
        var durationHrs  = isAllDay ? 0 : Math.round((endDt - startDt) / 36000) / 100;

        var gasEventId = calId + '__' + ev.getId();

        allEvents.push({
          gas_event_id  : gasEventId,
          calendar_id   : calId,
          calendar_name : calName,
          assignee      : assignee,
          title         : ev.getTitle()       || '（タイトルなし）',
          date          : dateStr,
          start_time    : startTimeStr,
          end_time      : endTimeStr,
          duration_hours: durationHrs,
          all_day       : isAllDay,
          notes         : ev.getDescription() || '',
          location      : ev.getLocation()    || ''
        });
      });
    } catch (calErr) {
      Logger.log('    エラー: ' + calErr.toString());
    }
  });

  // 日付・開始時刻でソート
  allEvents.sort(function(a, b) {
    var ka = a.date + ' ' + a.start_time;
    var kb = b.date + ' ' + b.start_time;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  return allEvents;
}

// ────────────────────────────────────────────────────────────
//  カレンダーID・名前 → スタッフ名を解決
// ────────────────────────────────────────────────────────────
function _resolveAssignee(calId, calName) {
  for (var i = 0; i < STAFF_MAPPING.length; i++) {
    var m = STAFF_MAPPING[i];
    // calendarId 完全一致
    if (m.calendarId && m.calendarId.toLowerCase() === calId.toLowerCase()) {
      return m.assignee;
    }
    // calendarName 部分一致（大文字小文字無視）
    if (m.calendarName && calName.indexOf(m.calendarName) >= 0) {
      return m.assignee;
    }
  }
  return null;
}

// ────────────────────────────────────────────────────────────
//  スプレッドシートへの書き出し
// ────────────────────────────────────────────────────────────
function _writeToSheet(events) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);

  // シートがなければ作成
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  // 既存データをクリア
  sheet.clearContents();

  // ヘッダー行
  var headers = [
    'gas_event_id',
    'カレンダーID',
    'カレンダー名',
    '担当者(assignee)',
    'タイトル',
    '日付',
    '開始時刻',
    '終了時刻',
    '時間(h)',
    '終日',
    'メモ',
    '場所',
    '取込日時'
  ];

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');

  var rows = [headers];
  events.forEach(function(ev) {
    rows.push([
      ev.gas_event_id,
      ev.calendar_id,
      ev.calendar_name,
      ev.assignee,
      ev.title,
      ev.date,
      ev.start_time,
      ev.end_time,
      ev.duration_hours,
      ev.all_day ? '○' : '',
      ev.notes,
      ev.location,
      now
    ]);
  });

  // 一括書き込み
  if (rows.length > 0) {
    sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
  }

  // ヘッダー行を太字・背景色
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4285F4');
  headerRange.setFontColor('#ffffff');

  // 列幅を自動調整
  sheet.autoResizeColumns(1, headers.length);

  // 先頭行を固定
  sheet.setFrozenRows(1);

  Logger.log('スプレッドシート書き出し完了: ' + (rows.length - 1) + ' 件');
  return rows.length - 1;
}

// ────────────────────────────────────────────────────────────
//  テスト用関数（スクリプトエディタから直接実行して確認）
// ────────────────────────────────────────────────────────────

/** 全カレンダーの一覧を確認する */
function listAllCalendars() {
  var cals = CalendarApp.getAllCalendars();
  Logger.log('==== アクセス可能なカレンダー一覧 (' + cals.length + '件) ====');
  cals.forEach(function(cal) {
    Logger.log('  名前: ' + cal.getName() + ' | ID: ' + cal.getId());
  });
}

/** 動作テスト（直近14日分を取得してログ出力） */
function testFetch() {
  var events = _fetchAllEvents(0, 14);
  Logger.log('取得イベント数: ' + events.length);
  events.slice(0, 5).forEach(function(ev) {
    Logger.log(JSON.stringify(ev));
  });
}

/** スプレッドシート書き出しテスト */
function testWriteSheet() {
  var count = syncToSheet();
  Logger.log('書き出し完了: ' + count + ' 件');
}
