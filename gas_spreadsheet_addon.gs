/**
 * ============================================================
 *  C-CORE  —  スプレッドシート拡張機能
 *  gas_spreadsheet_addon.gs
 * ============================================================
 *
 * 【概要】
 *  このスクリプトを C-CORE スプレッドシートに直接貼り付けると
 *  スプレッドシートのメニューバーに「📅 カレンダー取込」が追加され、
 *  Googleカレンダーのスケジュールを直接スプレッドシートに取り込めます。
 *
 * 【機能一覧】
 *  1. 全スタッフ一括取込 → 「カレンダー取込（全体）」シートへ書き出し
 *  2. スタッフ別シートへ自動振り分け（各担当者ごとのシートを作成・更新）
 *  3. 取込期間を選択（今日〜7日後 / 今日〜30日後 / 今日〜90日後 / カスタム）
 *  4. 過去分も取込（daysBack 指定）
 *  5. 定期実行トリガーの設定（毎日自動取込）
 *
 * 【セットアップ手順】
 *  1. 対象スプレッドシート（ID: 1-1QjgVjdbeeTqeRb17vDXwjvmnCLvDtiMKBCa9MZzSs）を開く
 *  2. 拡張機能 → Apps Script を選択
 *  3. このファイルの内容を全て貼り付けて保存（Ctrl+S）
 *  4. スプレッドシートを再読み込みするとメニューに「📅 カレンダー取込」が表示される
 *  5. 初回のみ「カレンダーへのアクセス許可」ダイアログが出るので承認する
 *
 * 【デプロイ不要】
 *  このスクリプトは Web App としてデプロイする必要はありません。
 *  スプレッドシートに紐づいたコンテナバインド型スクリプトとして動作します。
 *
 * ============================================================
 */

// ────────────────────────────────────────────────────────────
//  設定
// ────────────────────────────────────────────────────────────

/** 全体取込シート名 */
var SHEET_ALL    = 'カレンダー取込（全体）';

/** スタッフ別シートのプレフィックス */
var SHEET_PREFIX = '📅 ';

/** マッピング未定義カレンダーを取得するか */
var INCLUDE_UNKNOWN = false;

/**
 * スタッフマッピング
 * calendarId : Googleカレンダーのメールアドレス（完全一致・優先）
 * calendarName: カレンダー名に含まれる文字列（部分一致・補完）
 * assignee   : C-COREでのスタッフ名
 * color      : スプシの行背景色（省略可）
 */
var STAFF_MAPPING = [
  { calendarId: 'koike@8sin.co.jp',        assignee: '小池',        color: '#e8f0fe' },
  { calendarId: 'hamano8sin@gmail.com',     assignee: '濱野',        color: '#fce8e6' },
  { calendarId: 'takao8sin@gmail.com',      assignee: '高尾',        color: '#e6f4ea' },
  { calendarId: 'nishiwaki8400@gmail.com',  assignee: '西脇',        color: '#fff8e1' },
  { calendarId: 'youngkwang8sin@gmail.com', assignee: 'YOUNGKWANG',  color: '#fce4ec' },
  { calendarId: 'satsuei8sin@gmail.com',    assignee: '松永',        color: '#f3e5f5' },
  // 名前部分一致（ID指定で取れない場合の補完）
  { calendarName: '小池',     assignee: '小池',       color: '#e8f0fe' },
  { calendarName: '濱野',     assignee: '濱野',       color: '#fce8e6' },
  { calendarName: '高尾',     assignee: '高尾',       color: '#e6f4ea' },
  { calendarName: '西脇',     assignee: '西脇',       color: '#fff8e1' },
  { calendarName: 'YOUNG',    assignee: 'YOUNGKWANG', color: '#fce4ec' },
  { calendarName: '松永',     assignee: '松永',       color: '#f3e5f5' },
  { calendarName: '四船',     assignee: '四船',       color: '#e0f2f1' },
  { calendarName: '吉岡',     assignee: '吉岡',       color: '#fff3e0' },
];

// ────────────────────────────────────────────────────────────
//  スプレッドシート起動時にカスタムメニューを追加
// ────────────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📅 カレンダー取込')
    .addItem('▶ 全スタッフ一括取込（今日〜30日後）', 'menuSyncAll30')
    .addItem('▶ 全スタッフ一括取込（取込期間を選択）', 'menuSyncWithDialog')
    .addSeparator()
    .addItem('📁 スタッフ別シートに振り分け（30日後）', 'menuSyncByStaff30')
    .addItem('📁 スタッフ別シートに振り分け（期間選択）', 'menuSyncByStaffWithDialog')
    .addSeparator()
    .addItem('🗓 カレンダー一覧を確認', 'menuListCalendars')
    .addItem('🔄 定期実行トリガーを設定（毎日 AM6時）', 'menuSetDailyTrigger')
    .addItem('🗑 定期実行トリガーを削除', 'menuDeleteTriggers')
    .addToUi();
}

// ────────────────────────────────────────────────────────────
//  メニューハンドラ
// ────────────────────────────────────────────────────────────

/** 全スタッフ一括取込（30日後まで） */
function menuSyncAll30() {
  _runSync({ daysBack: 0, daysAhead: 30, byStaff: false });
}

/** 全スタッフ一括取込（期間選択ダイアログ付き） */
function menuSyncWithDialog() {
  var params = _showPeriodDialog();
  if (!params) return; // キャンセル
  _runSync({ daysBack: params.daysBack, daysAhead: params.daysAhead, byStaff: false });
}

/** スタッフ別シートに振り分け（30日後まで） */
function menuSyncByStaff30() {
  _runSync({ daysBack: 0, daysAhead: 30, byStaff: true });
}

/** スタッフ別シートに振り分け（期間選択ダイアログ付き） */
function menuSyncByStaffWithDialog() {
  var params = _showPeriodDialog();
  if (!params) return; // キャンセル
  _runSync({ daysBack: params.daysBack, daysAhead: params.daysAhead, byStaff: true });
}

/** アクセス可能なカレンダー一覧を表示 */
function menuListCalendars() {
  var cals = CalendarApp.getAllCalendars();
  var lines = ['アクセス可能なカレンダー一覧 (' + cals.length + '件)\n'];
  cals.forEach(function(cal) {
    var assignee = _resolveAssignee(cal.getId(), cal.getName());
    lines.push(
      '• ' + cal.getName() +
      '\n  ID: ' + cal.getId() +
      '\n  → 担当者: ' + (assignee || '（未マッピング）')
    );
  });
  SpreadsheetApp.getUi().alert(
    'カレンダー一覧',
    lines.join('\n\n'),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/** 毎日AM6時に自動取込するトリガーを設定 */
function menuSetDailyTrigger() {
  // 既存トリガーを削除してから再設定
  _deleteAllTriggers();
  ScriptApp.newTrigger('triggerDailySync')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();
  SpreadsheetApp.getUi().alert(
    'トリガー設定完了',
    '毎日 AM6:00 に全スタッフ取込（今日〜30日後）が自動実行されます。\n' +
    '「📅 カレンダー取込」→「定期実行トリガーを削除」で解除できます。',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/** トリガーを全削除 */
function menuDeleteTriggers() {
  var deleted = _deleteAllTriggers();
  SpreadsheetApp.getUi().alert(
    'トリガー削除完了',
    deleted + ' 件のトリガーを削除しました。',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ────────────────────────────────────────────────────────────
//  定期実行用エントリポイント（トリガーから呼ばれる）
// ────────────────────────────────────────────────────────────
function triggerDailySync() {
  _runSync({ daysBack: 0, daysAhead: 30, byStaff: true, silent: true });
}

// ────────────────────────────────────────────────────────────
//  期間選択ダイアログ
// ────────────────────────────────────────────────────────────
function _showPeriodDialog() {
  var ui = SpreadsheetApp.getUi();

  // プリセット選択
  var presetResult = ui.prompt(
    '取込期間を選択',
    '取込期間のプリセットを入力してください:\n\n' +
    '  1 → 今日〜7日後\n' +
    '  2 → 今日〜30日後\n' +
    '  3 → 今日〜60日後\n' +
    '  4 → 今日〜90日後\n' +
    '  5 → カスタム（次の画面で入力）\n\n' +
    '※ 過去分は含みません。過去も含めたい場合は 5 を選択してください。',
    ui.ButtonSet.OK_CANCEL
  );

  if (presetResult.getSelectedButton() !== ui.Button.OK) return null;

  var choice = presetResult.getResponseText().trim();

  if      (choice === '1') return { daysBack: 0, daysAhead: 7  };
  else if (choice === '2') return { daysBack: 0, daysAhead: 30 };
  else if (choice === '3') return { daysBack: 0, daysAhead: 60 };
  else if (choice === '4') return { daysBack: 0, daysAhead: 90 };
  else if (choice === '5') {
    // カスタム入力
    var aheadResult = ui.prompt(
      'カスタム期間（先日数）',
      '今日から何日後まで取込しますか？\n（例: 45）',
      ui.ButtonSet.OK_CANCEL
    );
    if (aheadResult.getSelectedButton() !== ui.Button.OK) return null;
    var daysAhead = parseInt(aheadResult.getResponseText().trim(), 10);
    if (isNaN(daysAhead) || daysAhead < 1) daysAhead = 30;

    var backResult = ui.prompt(
      'カスタム期間（過去日数）',
      '今日から何日前まで取込しますか？\n過去分不要なら 0 を入力してください。\n（例: 7）',
      ui.ButtonSet.OK_CANCEL
    );
    if (backResult.getSelectedButton() !== ui.Button.OK) return null;
    var daysBack = parseInt(backResult.getResponseText().trim(), 10);
    if (isNaN(daysBack) || daysBack < 0) daysBack = 0;

    return { daysBack: daysBack, daysAhead: daysAhead };
  } else {
    ui.alert('無効な選択です。処理をキャンセルしました。');
    return null;
  }
}

// ────────────────────────────────────────────────────────────
//  メイン同期処理
// ────────────────────────────────────────────────────────────
function _runSync(opts) {
  var daysBack  = opts.daysBack  || 0;
  var daysAhead = opts.daysAhead || 30;
  var byStaff   = opts.byStaff  || false;
  var silent    = opts.silent   || false;

  var ui = SpreadsheetApp.getUi();

  try {
    // ① イベント取得
    if (!silent) SpreadsheetApp.getActiveSpreadsheet().toast(
      'カレンダーデータを取得中...', '📅 カレンダー取込', 10
    );

    var events = _fetchAllEvents(daysBack, daysAhead);
    Logger.log('取得イベント数: ' + events.length);

    // ② 全体シートへ書き出し
    var countAll = _writeAllSheet(events);

    if (!silent) SpreadsheetApp.getActiveSpreadsheet().toast(
      '全体シートに ' + countAll + ' 件を書き出しました。', '📅 カレンダー取込', 5
    );

    // ③ スタッフ別シートへ振り分け（byStaff=true の場合）
    var staffSummary = [];
    if (byStaff) {
      if (!silent) SpreadsheetApp.getActiveSpreadsheet().toast(
        'スタッフ別シートに振り分け中...', '📅 カレンダー取込', 10
      );
      staffSummary = _writeStaffSheets(events);
    }

    // ④ 完了メッセージ
    if (!silent) {
      var msg = '✅ 取込完了！\n\n'
        + '  取得件数: ' + events.length + ' 件\n'
        + '  全体シート: 「' + SHEET_ALL + '」に書き出しました\n';

      if (byStaff && staffSummary.length > 0) {
        msg += '\n  スタッフ別シート:\n';
        staffSummary.forEach(function(s) {
          msg += '    ' + SHEET_PREFIX + s.name + ': ' + s.count + ' 件\n';
        });
      }

      msg += '\n  取込期間: 今日';
      if (daysBack > 0) msg += '（' + daysBack + '日前から）';
      msg += ' 〜 ' + daysAhead + '日後まで';

      ui.alert('取込完了', msg, ui.ButtonSet.OK);
    }

  } catch (err) {
    Logger.log('_runSync error: ' + err.toString());
    if (!silent) {
      ui.alert(
        'エラーが発生しました',
        err.toString() + '\n\n' +
        '【よくある原因】\n' +
        '・Googleカレンダーへのアクセス権限が未承認\n' +
        '  → 「実行」メニューから任意の関数を実行して権限を許可してください\n' +
        '・スプレッドシートIDが正しくない\n' +
        '  → スクリプトの SPREADSHEET_ID を確認してください',
        ui.ButtonSet.OK
      );
    }
    throw err;
  }
}

// ────────────────────────────────────────────────────────────
//  全カレンダーのイベントを取得
// ────────────────────────────────────────────────────────────
function _fetchAllEvents(daysBack, daysAhead) {
  var now   = new Date();
  var start = new Date(now.getTime() - daysBack  * 86400000);
  var end   = new Date(now.getTime() + daysAhead * 86400000);
  start.setHours(0,  0,  0,   0);
  end.setHours(23, 59, 59, 999);

  var allCals   = CalendarApp.getAllCalendars();
  var allEvents = [];

  Logger.log('カレンダー数: ' + allCals.length + ' | 期間: ' +
    Utilities.formatDate(start, 'Asia/Tokyo', 'yyyy/MM/dd') + ' 〜 ' +
    Utilities.formatDate(end,   'Asia/Tokyo', 'yyyy/MM/dd'));

  allCals.forEach(function(cal) {
    var calId   = cal.getId();
    var calName = cal.getName();
    var assignee = _resolveAssignee(calId, calName);

    if (!assignee && !INCLUDE_UNKNOWN) return; // 未マッピング除外
    if (!assignee) assignee = '未分類';

    try {
      var evs = cal.getEvents(start, end);
      evs.forEach(function(ev) {
        var startDt  = ev.getStartTime();
        var endDt    = ev.getEndTime();
        var isAllDay = ev.isAllDayEvent();
        var dateStr      = Utilities.formatDate(startDt, 'Asia/Tokyo', 'yyyy-MM-dd');
        var startTimeStr = isAllDay ? '' : Utilities.formatDate(startDt, 'Asia/Tokyo', 'HH:mm');
        var endTimeStr   = isAllDay ? '' : Utilities.formatDate(endDt,   'Asia/Tokyo', 'HH:mm');
        var durationHrs  = isAllDay ? '' : Math.round((endDt - startDt) / 36000) / 100;

        allEvents.push({
          gas_event_id  : calId + '__' + ev.getId(),
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
          location      : ev.getLocation()    || '',
          status        : ev.getMyStatus().toString()
        });
      });
    } catch (e) {
      Logger.log('  [スキップ] ' + calName + ': ' + e.toString());
    }
  });

  // 日付・開始時刻でソート
  allEvents.sort(function(a, b) {
    var ka = a.date + (a.start_time || '00:00');
    var kb = b.date + (b.start_time || '00:00');
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  return allEvents;
}

// ────────────────────────────────────────────────────────────
//  全体シートへの書き出し
// ────────────────────────────────────────────────────────────
function _writeAllSheet(events) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_ALL) || ss.insertSheet(SHEET_ALL);

  sheet.clearContents();
  sheet.clearFormats();

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');

  var headers = [
    '担当者', '日付', '開始', '終了', '時間(h)', '終日',
    'タイトル', '場所', 'メモ', 'ステータス',
    'カレンダー名', 'gas_event_id', '取込日時'
  ];

  var rows = [headers];
  events.forEach(function(ev) {
    rows.push([
      ev.assignee,
      ev.date,
      ev.start_time,
      ev.end_time,
      ev.duration_hours,
      ev.all_day ? '○' : '',
      ev.title,
      ev.location,
      ev.notes,
      ev.status,
      ev.calendar_name,
      ev.gas_event_id,
      now
    ]);
  });

  if (rows.length > 1) {
    sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);

    // スタッフ別に行の背景色を設定
    for (var i = 1; i < rows.length; i++) {
      var assignee = rows[i][0];
      var color    = _getStaffColor(assignee);
      if (color) {
        sheet.getRange(i + 1, 1, 1, headers.length).setBackground(color);
      }
    }
  }

  // ヘッダー行スタイル
  _styleHeader(sheet, headers.length);
  sheet.autoResizeColumns(1, headers.length);
  sheet.setFrozenRows(1);

  // フィルター設定（担当者・日付でフィルタリングできるように）
  var dataRange = sheet.getRange(1, 1, rows.length, headers.length);
  if (sheet.getFilter()) sheet.getFilter().remove();
  dataRange.createFilter();

  Logger.log('全体シート書き出し: ' + (rows.length - 1) + ' 件');
  return rows.length - 1;
}

// ────────────────────────────────────────────────────────────
//  スタッフ別シートへの振り分け書き出し
// ────────────────────────────────────────────────────────────
function _writeStaffSheets(events) {
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var summary = [];

  // スタッフ名でグルーピング
  var groups = {};
  events.forEach(function(ev) {
    var name = ev.assignee;
    if (!groups[name]) groups[name] = [];
    groups[name].push(ev);
  });

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');

  var headers = [
    '日付', '曜日', '開始', '終了', '時間(h)', '終日',
    'タイトル', '場所', 'メモ', 'ステータス', 'カレンダー名', 'gas_event_id'
  ];

  var dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  Object.keys(groups).forEach(function(staffName) {
    var sheetName = SHEET_PREFIX + staffName;

    // シートを取得または作成
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }

    sheet.clearContents();
    sheet.clearFormats();

    var evList = groups[staffName];
    var rows   = [headers];

    evList.forEach(function(ev) {
      // 曜日を計算
      var dayOfWeek = '';
      if (ev.date) {
        try {
          var d = new Date(ev.date + 'T00:00:00+09:00');
          dayOfWeek = dayNames[d.getDay()];
        } catch(e) {}
      }

      rows.push([
        ev.date,
        dayOfWeek,
        ev.start_time,
        ev.end_time,
        ev.duration_hours,
        ev.all_day ? '○' : '',
        ev.title,
        ev.location,
        ev.notes,
        ev.status,
        ev.calendar_name,
        ev.gas_event_id
      ]);
    });

    // データ書き込み
    if (rows.length > 1) {
      sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);

      // 土日に背景色
      for (var i = 1; i < rows.length; i++) {
        var day = rows[i][1];
        if (day === '土') {
          sheet.getRange(i + 1, 1, 1, headers.length).setBackground('#e3f2fd');
        } else if (day === '日') {
          sheet.getRange(i + 1, 1, 1, headers.length).setBackground('#fce4ec');
        }
      }
    }

    // ヘッダースタイル（スタッフカラーで）
    var staffColor = _getStaffColor(staffName) || '#4285F4';
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground(_darkenColor(staffColor));
    headerRange.setFontColor('#ffffff');

    // 列幅自動調整・行固定・フィルター
    sheet.autoResizeColumns(1, headers.length);
    sheet.setFrozenRows(1);
    var dataRange = sheet.getRange(1, 1, rows.length, headers.length);
    if (sheet.getFilter()) sheet.getFilter().remove();
    dataRange.createFilter();

    // シート見出し色
    var tabColor = _getStaffColor(staffName);
    if (tabColor) sheet.setTabColor(tabColor);

    var count = rows.length - 1;
    summary.push({ name: staffName, count: count });
    Logger.log('  ' + sheetName + ': ' + count + ' 件');
  });

  return summary;
}

// ────────────────────────────────────────────────────────────
//  ユーティリティ
// ────────────────────────────────────────────────────────────

/** カレンダーID/名前 → スタッフ名を解決 */
function _resolveAssignee(calId, calName) {
  for (var i = 0; i < STAFF_MAPPING.length; i++) {
    var m = STAFF_MAPPING[i];
    if (m.calendarId && m.calendarId.toLowerCase() === calId.toLowerCase()) {
      return m.assignee;
    }
    if (m.calendarName && calName.indexOf(m.calendarName) >= 0) {
      return m.assignee;
    }
  }
  return null;
}

/** スタッフ名 → 背景色 */
function _getStaffColor(assignee) {
  for (var i = 0; i < STAFF_MAPPING.length; i++) {
    if (STAFF_MAPPING[i].assignee === assignee && STAFF_MAPPING[i].color) {
      return STAFF_MAPPING[i].color;
    }
  }
  return null;
}

/**
 * 薄い色を濃くする（ヘッダー背景用）
 * 例: '#e8f0fe' → より濃いブルー系
 */
function _darkenColor(hex) {
  // pastel → vivid 変換テーブル
  var table = {
    '#e8f0fe': '#1a73e8',
    '#fce8e6': '#d93025',
    '#e6f4ea': '#1e8e3e',
    '#fff8e1': '#f9ab00',
    '#fce4ec': '#e91e63',
    '#f3e5f5': '#9c27b0',
    '#e0f2f1': '#009688',
    '#fff3e0': '#ff6d00',
  };
  return table[hex] || '#4285F4';
}

/** ヘッダー行にスタイルを適用 */
function _styleHeader(sheet, colCount) {
  var headerRange = sheet.getRange(1, 1, 1, colCount);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4285F4');
  headerRange.setFontColor('#ffffff');
  headerRange.setHorizontalAlignment('center');
}

/** 全トリガーを削除して削除数を返す */
function _deleteAllTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) { ScriptApp.deleteTrigger(t); });
  return triggers.length;
}

// ────────────────────────────────────────────────────────────
//  テスト・デバッグ用関数（スクリプトエディタから直接実行）
// ────────────────────────────────────────────────────────────

/** カレンダー一覧をログ出力 */
function debugListCalendars() {
  var cals = CalendarApp.getAllCalendars();
  Logger.log('==== カレンダー一覧 (' + cals.length + ' 件) ====');
  cals.forEach(function(cal) {
    var assignee = _resolveAssignee(cal.getId(), cal.getName());
    Logger.log(
      '名前: ' + cal.getName() +
      ' | ID: ' + cal.getId() +
      ' | → ' + (assignee || '【未マッピング】')
    );
  });
}

/** 直近14日分を取得してログ出力 */
function debugFetch14Days() {
  var events = _fetchAllEvents(0, 14);
  Logger.log('取得件数: ' + events.length);
  events.slice(0, 10).forEach(function(ev) {
    Logger.log(
      '[' + ev.assignee + '] ' + ev.date + ' ' +
      ev.start_time + '-' + ev.end_time + ' ' + ev.title
    );
  });
}

/** スプレッドシートへのテスト書き出し（30日後まで・スタッフ別あり） */
function debugFullSync() {
  _runSync({ daysBack: 0, daysAhead: 30, byStaff: true, silent: false });
}
