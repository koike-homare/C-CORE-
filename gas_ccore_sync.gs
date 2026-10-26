/**
 * ============================================================
 *  C-CORE  —  Googleカレンダー → C-CORE スケジュール同期
 *  gas_ccore_sync.gs  【完全版 / 2026-07-15】
 * ============================================================
 *
 *  ★ このファイルをそのままコピペしてデプロイするだけで動きます ★
 *
 * 【データフロー】
 *
 *   Googleカレンダー（koike@8sin.co.jp から閲覧できる全カレンダー）
 *          ↓  CalendarApp.getAllCalendars()
 *   GAS Web App（このスクリプト）
 *     ① 全カレンダーからイベントを取得
 *     ② カレンダー表示名を担当者名として自動使用（マッピング不要）
 *     ③ C-CORE の schedules テーブルへ POST（重複は自動スキップ）
 *     ④ スプレッドシートへも書き出し（オプション）
 *          ↓
 *   実行月の1日から3か月目の月末までを C-CORE に反映
 *
 * ============================================================
 *
 * 【セットアップ手順（5ステップ）】
 *
 *  STEP 1: https://script.google.com を開く
 *  STEP 2: 「新しいプロジェクト」を作成する
 *  STEP 3: このファイルの内容を全て貼り付けて保存（Ctrl+S）
 *  STEP 4: CCORE_API_BASE_URL は設定済みです（変更不要）
 *            ※ 本番環境に切り替える場合のみ URL を変更してください
 *  STEP 5: 「デプロイ」→「新しいデプロイ」→ 以下の設定でデプロイ
 *            種類         : ウェブアプリ
 *            実行ユーザー : 自分（Me）
 *            アクセス     : 全員（Anyone）
 *          → 発行された URL をコピーして C-CORE の「GAS設定」に登録する
 *
 * 【動作確認（デプロイ前にテスト推奨）】
 *  ① スクリプトエディタの「関数を選択」から debugListCalendars を選んで実行
 *     → ログにカレンダー一覧が表示されれば OK
 *  ② debugFetch7Days を実行してイベントが取れているか確認
 *  ③ manualSyncToSheetOnly を実行してスプシに書き出し確認
 *  ④ 問題なければ C-CORE ボタンから「今日のスケジュールに取込」を押す
 *
 * 【GETパラメータ（C-COREから自動で送信されます）】
 *  取得期間  : 実行月の1日から3か月目の月末まで（自動計算）
 *  mode      : "json"   → イベントJSONを返すだけ（C-CORE側でPOST）
 *              "sheet"  → スプシ書き出し + C-CORE側でPOST
 *              "push"   → GAS側がC-CORE APIに直接POST（C-COREからURLを受け取る）
 *              "all"    → GAS側でPOST + スプシ書き出し 両方
 *  ccoreUrl  : C-COREのテーブルAPIのURL（mode=push/all のとき使用）
 *
 * ============================================================
 */


// ============================================================
//  ★★★ 設定エリア ★★★  ここだけ書き換えてください
// ============================================================

/**
 * C-CORE の Tables API ベースURL（テスト環境・設定済み）
 * 本番環境に切り替える場合は URL を書き換えてください。
 */
var CCORE_API_BASE_URL = 'https://www.genspark.ai/api/code_sandbox_light/preview/fded4bcd-6c98-436e-8159-4d91facf0621/tables';
//                        ↑↑↑ ここを書き換えてください ↑↑↑

/**
 * スプレッドシートID
 * URL: https://docs.google.com/spreadsheets/d/【ここの文字列】/edit
 */
var SPREADSHEET_ID = '1-1QjgVjdbeeTqeRb17vDXwjvmnCLvDtiMKBCa9MZzSs';

/** スプシの書き出し先シート名 */
var SHEET_NAME = 'カレンダー予定一覧';

// ============================================================
//  以下は変更不要です
// ============================================================

// ────────────────────────────────────────────────────────────
//  doGet: Web App エントリポイント（C-COREのボタンから呼ばれる）
// ────────────────────────────────────────────────────────────
function doGet(e) {
  var output = ContentService
    .createTextOutput()
    .setMimeType(ContentService.MimeType.JSON);

  try {
    var params    = e ? (e.parameter || {}) : {};
    var mode      = (params.mode || 'json').toLowerCase();
    var ccoreUrl  = params.ccoreUrl || CCORE_API_BASE_URL;
    Logger.log('[doGet] mode=' + mode + ' | ccoreUrl=' + ccoreUrl);

    // ① カレンダーからイベントを取得
    var events = _fetchCurrentThreeMonths();
    Logger.log('[doGet] 取得イベント数: ' + events.length);

    var pushResult  = null;
    var sheetResult = null;

    // ② C-CORE API へ直接 POST（mode = push / all）
    if (mode === 'push' || mode === 'all') {
      pushResult = _pushToCCORE(events, ccoreUrl);
    }

    // ③ スプレッドシートへ書き出し（mode = sheet / all）
    if (mode === 'sheet' || mode === 'all') {
      sheetResult = _writeToSpreadsheet(events);
    }

    // ④ JSON レスポンスを返す
    var response = {
      ok        : true,
      fetchedAt : new Date().toISOString(),
      mode      : mode,
      period    : '当月1日から3か月目の月末まで',
      count     : events.length,
      events    : events
    };
    if (pushResult)  response.push  = pushResult;
    if (sheetResult) response.sheet = sheetResult;

    output.setContent(JSON.stringify(response));

  } catch (err) {
    Logger.log('[doGet] ERROR: ' + err.toString() + '\n' + err.stack);
    output.setContent(JSON.stringify({ ok: false, error: err.toString() }));
  }

  return output;
}


// ────────────────────────────────────────────────────────────
//  ① 全カレンダーのイベントを取得して配列で返す
// ────────────────────────────────────────────────────────────
function _fetchCurrentThreeMonths() {
  var now = new Date();
  var start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  var end = new Date(now.getFullYear(), now.getMonth() + 3, 1, 0, 0, 0, 0);
  end.setMilliseconds(-1);
  return _fetchAllCalendarEvents(start, end);
}

function _fetchAllCalendarEvents(start, end) {

  var allCals = CalendarApp.getAllCalendars();
  Logger.log('[fetch] カレンダー数: ' + allCals.length
    + ' | ' + Utilities.formatDate(start, 'Asia/Tokyo', 'yyyy/MM/dd')
    + ' 〜 ' + Utilities.formatDate(end,   'Asia/Tokyo', 'yyyy/MM/dd'));

  var allEvents = [];

  allCals.forEach(function(cal) {
    var calId    = cal.getId();
    var calName  = cal.getName();
    var assignee = calName;
    Logger.log('[fetch] ✓ ' + calName + ' (' + calId + ')');

    try {
      var events = cal.getEvents(start, end);
      Logger.log('[fetch]   イベント数: ' + events.length);

      events.forEach(function(ev) {
        var startDt  = ev.getStartTime();
        var endDt    = ev.getEndTime();
        var isAllDay = ev.isAllDayEvent();

        // 日付・時刻を文字列に変換
        var dateStr      = Utilities.formatDate(startDt, 'Asia/Tokyo', 'yyyy-MM-dd');
        var startTimeStr = isAllDay ? null : Utilities.formatDate(startDt, 'Asia/Tokyo', 'HH:mm');
        var endTimeStr   = isAllDay ? null : Utilities.formatDate(endDt,   'Asia/Tokyo', 'HH:mm');

        // 時間（h）を小数点1桁で計算。終日イベントは 0
        var durationHrs = isAllDay
          ? 0
          : Math.round((endDt.getTime() - startDt.getTime()) / 360000) / 10;

        // gas_event_id = "カレンダーID__イベントID"（重複防止キー）
        var gasEventId = calId + '__' + ev.getId();

        allEvents.push({
          gas_event_id   : gasEventId,
          calendar_id    : calId,
          calendar_name  : calName,
          assignee       : assignee,
          title          : ev.getTitle()       || '（タイトルなし）',
          date           : dateStr,             // "yyyy-MM-dd"
          start_time     : startTimeStr,        // "HH:mm" or null
          end_time       : endTimeStr,          // "HH:mm" or null
          duration_hours : durationHrs,         // 数値（時間）
          all_day        : isAllDay,            // bool
          notes          : ev.getDescription() || '',
          location       : ev.getLocation()    || '',
          gas_synced_at  : Date.now()           // 取込タイムスタンプ（ms）
        });
      });

    } catch (calErr) {
      Logger.log('[fetch]   [ERROR スキップ] ' + calName + ': ' + calErr.toString());
    }
  });

  // 日付 → 開始時刻の順でソート
  allEvents.sort(function(a, b) {
    var ka = a.date + (a.start_time || '00:00');
    var kb = b.date + (b.start_time || '00:00');
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  return allEvents;
}


// ────────────────────────────────────────────────────────────
//  ② C-CORE Tables API の /schedules へ POST
//     既存レコードの gas_event_id と照合して重複はスキップ
// ────────────────────────────────────────────────────────────
function _pushToCCORE(events, baseUrl) {
  // URL未設定チェック
  if (!baseUrl || baseUrl.indexOf('YOUR_CCORE') >= 0) {
    Logger.log('[push] CCORE_API_BASE_URL が未設定のため push をスキップします');
    return { added: 0, skipped: events.length, errors: 0, error: 'CCORE_API_BASE_URL 未設定' };
  }

  var schedulesUrl = baseUrl.replace(/\/+$/, '') + '/schedules';
  Logger.log('[push] 送信先URL: ' + schedulesUrl);

  // 既存の gas_event_id を全取得（ページネーション対応）
  var existingIds = _fetchExistingGasEventIds(schedulesUrl);
  Logger.log('[push] 既存 gas_event_id 件数: ' + existingIds.length);

  var existSet = {};
  existingIds.forEach(function(id) { existSet[id] = true; });

  var added   = 0;
  var skipped = 0;
  var errors  = 0;

  events.forEach(function(ev) {
    // 重複チェック
    if (existSet[ev.gas_event_id]) {
      skipped++;
      return;
    }

    // POST ペイロード（C-CORE schedules テーブルのフィールドに合わせる）
    var payload = JSON.stringify({
      assignee       : ev.assignee,
      date           : ev.date,
      title          : ev.title,
      start_time     : ev.start_time,
      end_time       : ev.end_time,
      duration_hours : ev.duration_hours,
      is_recurring   : false,
      recur_days     : [],
      notes          : ev.notes + (ev.location ? '\n場所: ' + ev.location : ''),
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
        Logger.log('[push] OK: [' + ev.assignee + '] ' + ev.date + ' ' + ev.start_time + ' ' + ev.title);
      } else {
        errors++;
        Logger.log('[push] NG[' + code + ']: ' + ev.title + ' | ' + resp.getContentText().slice(0, 150));
      }
    } catch (fetchErr) {
      errors++;
      Logger.log('[push] ERROR: ' + ev.title + ' | ' + fetchErr.toString());
    }
  });

  Logger.log('[push] 結果: added=' + added + ' skipped=' + skipped + ' errors=' + errors);
  return { added: added, skipped: skipped, errors: errors };
}

/**
 * C-CORE schedules テーブルから既存の gas_event_id を全て取得
 * 重複 POST を防ぐために使用（ページネーション対応・最大 10,000 件）
 */
function _fetchExistingGasEventIds(schedulesUrl) {
  var ids  = [];
  var page = 1;
  var maxPages = 20; // 500件/ページ × 20 = 最大10,000件

  while (page <= maxPages) {
    try {
      var url  = schedulesUrl + '?limit=500&page=' + page;
      var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });

      if (resp.getResponseCode() !== 200) break;

      var data    = JSON.parse(resp.getContentText());
      var records = data.data || [];
      if (records.length === 0) break;

      records.forEach(function(r) {
        if (r.gas_event_id) ids.push(r.gas_event_id);
      });

      // 全件取得済みかチェック
      if (!data.total || page * 500 >= parseInt(data.total, 10)) break;
      page++;

    } catch (e) {
      Logger.log('[existingIds] error page=' + page + ': ' + e.toString());
      break;
    }
  }

  return ids;
}


// ────────────────────────────────────────────────────────────
//  ③ スプレッドシートへの書き出し（バックアップ・目視確認用）
// ────────────────────────────────────────────────────────────
function _writeToSpreadsheet(events) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

  // 既存データをクリア
  sheet.clearContents();
  sheet.clearFormats();

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');

  // 列定義（C-COREのスケジュール表示に合わせた順）
  var headers = [
    'カレンダーID',
    '担当者',
    'スケジュール名',
    '日付',
    '開始時間',
    '終了時間',
    '時間(h)',
    '終日',
    'メモ',
    '場所',
    'gas_event_id',
    '取込日時'
  ];

  var rows = [headers];

  events.forEach(function(ev) {
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
  });

  // 一括書き込み
  if (rows.length > 1) {
    sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
  }

  // ヘッダー行のスタイル
  var hdr = sheet.getRange(1, 1, 1, headers.length);
  hdr.setFontWeight('bold');
  hdr.setBackground('#1a73e8');
  hdr.setFontColor('#ffffff');
  hdr.setHorizontalAlignment('center');

  // 列幅自動調整・1行目固定・フィルター
  sheet.autoResizeColumns(1, headers.length);
  sheet.setFrozenRows(1);
  if (sheet.getFilter()) sheet.getFilter().remove();
  sheet.getRange(1, 1, rows.length, headers.length).createFilter();

  var count = rows.length - 1;
  Logger.log('[sheet] 書き出し完了: ' + count + ' 件 → シート「' + SHEET_NAME + '」');
  return { sheet: SHEET_NAME, count: count };
}


// ============================================================
//  テスト・デバッグ用関数
//  → Apps Script エディタの「▶ 実行」から直接呼べます
// ============================================================

/**
 * 【テスト1】カレンダー一覧の確認
 * 取得対象となる全カレンダーをログで確認できます。
 */
function debugListCalendars() {
  var cals = CalendarApp.getAllCalendars();
  Logger.log('================================================');
  Logger.log('アクセス可能なカレンダー一覧 (' + cals.length + '件)');
  Logger.log('================================================');
  cals.forEach(function(cal) {
    Logger.log(
      '✓ ' + cal.getName()
      + '\n  ID: ' + cal.getId()
      + '\n  → 担当者名としてカレンダー表示名を使用'
    );
  });
}

/**
 * 【テスト2】直近7日分のイベントをログ出力（API送信なし）
 * 取得できるイベントの一覧をログで確認できます。
 */
function debugFetch7Days() {
  var start = new Date();
  start.setHours(0, 0, 0, 0);
  var end = new Date(start.getTime() + 7 * 86400000);
  end.setHours(23, 59, 59, 999);
  var events = _fetchAllCalendarEvents(start, end);
  Logger.log('================================================');
  Logger.log('直近7日間のイベント: ' + events.length + '件');
  Logger.log('================================================');
  events.forEach(function(ev) {
    Logger.log(
      '[' + ev.assignee + '] '
      + ev.date + ' '
      + (ev.start_time ? ev.start_time + '-' + ev.end_time : '終日') + ' '
      + ev.title
    );
  });
}

/**
 * 【手動実行A】スプレッドシートにだけ書き出す（C-COREには送信しない）
 * 動作確認や手動バックアップに使用してください。
 */
function manualSyncToSheetOnly() {
  Logger.log('=== スプシ書き出し開始 ===');
  var events = _fetchCurrentThreeMonths();
  Logger.log('取得件数: ' + events.length);
  var result = _writeToSpreadsheet(events);
  Logger.log('完了: ' + result.count + '件 → シート「' + result.sheet + '」');
}

/**
 * 【手動実行B】C-CORE に直接 POST する（スプシには書き出さない）
 * ★ CCORE_API_BASE_URL を正しく設定した上で実行してください
 */
function manualSyncToCCORE() {
  Logger.log('=== C-CORE 送信開始 ===');
  var events = _fetchCurrentThreeMonths();
  Logger.log('取得件数: ' + events.length);
  var result = _pushToCCORE(events, CCORE_API_BASE_URL);
  Logger.log('送信結果: added=' + result.added + ' / skipped=' + result.skipped + ' / errors=' + result.errors);
}

/**
 * 【手動実行C】スプシ書き出し + C-CORE 送信を両方実行
 * 上記A + Bを同時に行います。
 */
function manualSyncAll() {
  Logger.log('=== 全同期（スプシ + C-CORE）開始 ===');
  var events = _fetchCurrentThreeMonths();
  Logger.log('取得件数: ' + events.length);
  var sheetResult = _writeToSpreadsheet(events);
  var pushResult  = _pushToCCORE(events, CCORE_API_BASE_URL);
  Logger.log('スプシ: ' + sheetResult.count + '件');
  Logger.log('C-CORE: added=' + pushResult.added + ' / skipped=' + pushResult.skipped + ' / errors=' + pushResult.errors);
}

/**
 * 【定期実行用】毎日自動取込トリガーから呼ばれる関数
 * スプシ書き出し + C-CORE 送信を実行します。
 * トリガー設定: 「トリガー」→「+ トリガーを追加」→ この関数を選択 → 時間ベース
 */
function triggerDailySync() {
  try {
    var events     = _fetchCurrentThreeMonths();
    _writeToSpreadsheet(events);
    _pushToCCORE(events, CCORE_API_BASE_URL);
    Logger.log('[triggerDailySync] 完了: ' + events.length + '件処理');
  } catch (e) {
    Logger.log('[triggerDailySync] ERROR: ' + e.toString());
  }
}
