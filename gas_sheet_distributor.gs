/**
 * ============================================================
 *  C-CORE  —  カレンダー予定一覧 → スタッフ別シート振り分け
 *  gas_sheet_distributor.gs
 * ============================================================
 *
 * 【概要】
 *  既にスプレッドシートに取り込まれている「カレンダー予定一覧」シートを
 *  読み込んで、カレンダーID列を軸に各スタッフのシートへ自動振り分けします。
 *
 * 【対象スプレッドシート】
 *  https://docs.google.com/spreadsheets/d/1-1QjgVjdbeeTqeRb17vDXwjvmnCLvDtiMKBCa9MZzSs/edit
 *
 * 【セットアップ手順】
 *  1. 上記スプレッドシートを開く
 *  2. 拡張機能 → Apps Script を選択
 *  3. このファイルの内容を全て貼り付けて保存（Ctrl+S）
 *  4. スプレッドシートを再読み込みすると
 *     メニューに「📋 スタッフ別振り分け」が表示される
 *  5. 初回のみ権限承認ダイアログで「許可」を押す
 *
 * 【入力シート列構成（カレンダー予定一覧）】
 *  A: カレンダーID
 *  B: 参加者
 *  C: スケジュール名
 *  D: 日付
 *  E: 開始時間
 *  F: 終了時間
 *
 * 【出力】
 *  「📋 小池」「📋 濱野」 … スタッフ名ごとのシートを自動作成・更新
 *
 * ============================================================
 */

// ────────────────────────────────────────────────────────────
//  設定
// ────────────────────────────────────────────────────────────

/** 読み込み元シート名 */
var SRC_SHEET_NAME = 'カレンダー予定一覧';

/** 出力シートのプレフィックス */
var OUT_PREFIX = '📋 ';

/**
 * カレンダーID → スタッフ情報マッピング
 *
 * ★ スクリーンショットで確認された実際のカレンダーIDをもとに設定済み
 *
 * calendarId   : スプシの「カレンダーID」列の値（完全一致）
 * assignee     : スタッフ名（シート名・ヘッダーに使用）
 * color        : スタッフシートのタブ色・行背景色（薄色）
 * headerColor  : ヘッダー行の背景色（濃色）
 */
var STAFF_MAP = [
  // ── 社内アカウント ──────────────────────────────────────
  {
    calendarId  : 'koike@8sin.co.jp',
    assignee    : '小池',
    color       : '#e8f0fe',
    headerColor : '#1a73e8'
  },
  {
    calendarId  : 'hamano8sin@gmail.com',
    assignee    : '濱野',
    color       : '#fce8e6',
    headerColor : '#d93025'
  },
  {
    calendarId  : 'takao8sin@gmail.com',
    assignee    : '高尾',
    color       : '#e6f4ea',
    headerColor : '#1e8e3e'
  },
  {
    calendarId  : 'nishiwaki8400@gmail.com',
    assignee    : '西脇',
    color       : '#fff8e1',
    headerColor : '#f9ab00'
  },
  {
    calendarId  : 'youngkwang8sin@gmail.com',
    assignee    : 'YOUNGKWANG',
    color       : '#fce4ec',
    headerColor : '#e91e63'
  },
  {
    calendarId  : 'satsuei8sin@gmail.com',
    assignee    : '松永',
    color       : '#f3e5f5',
    headerColor : '#9c27b0'
  },
  {
    calendarId  : 'tomimura@8sin.co.jp',
    assignee    : '富村',
    color       : '#e0f7fa',
    headerColor : '#00838f'
  },
  {
    calendarId  : 'shi-maeda@8sin.co.jp',
    assignee    : '前田',
    color       : '#fff3e0',
    headerColor : '#e65100'
  },
  {
    calendarId  : 'satou@8sin.co.jp',
    assignee    : '佐藤',
    color       : '#f9fbe7',
    headerColor : '#827717'
  },
  {
    calendarId  : 'murakami@8sin.co.jp',
    assignee    : '村上',
    color       : '#e8eaf6',
    headerColor : '#3949ab'
  },
  // ── スクリーンショットで確認されたその他のカレンダーID ──
  // （共有カレンダー・店舗カレンダー等）
  {
    calendarId  : 'ribenrendenglu@gmail.com',
    assignee    : '天満鮨',
    color       : '#fafafa',
    headerColor : '#616161'
  },
  {
    calendarId  : 'ousetsu066@gmail.com',
    assignee    : '天満鮨（参加者）',
    color       : '#fafafa',
    headerColor : '#616161'
  },
  {
    calendarId  : 'hassin.honbu@gmail.com',
    assignee    : '晴々（本部）',
    color       : '#e8f5e9',
    headerColor : '#2e7d32'
  },
  {
    calendarId  : 'hassin.matsuda.s@gmail.com',
    assignee    : '晴々（松田）',
    color       : '#e8f5e9',
    headerColor : '#388e3c'
  },
];

/**
 * カレンダーID完全一致でマッピングされないIDを
 * 「未分類」シートに入れるか
 * false にすると未マッピング行はどのシートにも出力されない
 */
var INCLUDE_UNMATCHED = true;

/** 「未分類」シート名 */
var UNMATCHED_SHEET = '📋 未分類';

// ────────────────────────────────────────────────────────────
//  スプレッドシート起動時にカスタムメニューを追加
// ────────────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📋 スタッフ別振り分け')
    .addItem('▶ 今すぐ振り分け実行', 'menuDistribute')
    .addSeparator()
    .addItem('🗑 スタッフ別シートをすべて削除', 'menuDeleteStaffSheets')
    .addItem('📋 カレンダーID マッピング一覧を確認', 'menuShowMapping')
    .addSeparator()
    .addItem('🔄 定期実行トリガーを設定（毎日 AM7:00）', 'menuSetTrigger')
    .addItem('🗑 定期実行トリガーを削除', 'menuDeleteTriggers')
    .addToUi();
}

// ────────────────────────────────────────────────────────────
//  メニューハンドラ
// ────────────────────────────────────────────────────────────

/** 振り分け実行 */
function menuDistribute() {
  var result = distributeToStaffSheets();
  if (!result) return;

  var msg = '✅ 振り分け完了！\n\n'
    + '  読込件数: ' + result.total + ' 件\n\n'
    + '  【スタッフ別振り分け結果】\n';

  result.summary.forEach(function(s) {
    msg += '    ' + OUT_PREFIX + s.name + ': ' + s.count + ' 件\n';
  });

  if (result.unmatched > 0) {
    msg += '\n  未分類（マッピングなし）: ' + result.unmatched + ' 件\n';
    if (INCLUDE_UNMATCHED) msg += '  → 「' + UNMATCHED_SHEET + '」シートに出力しました\n';
  }

  SpreadsheetApp.getUi().alert('振り分け完了', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

/** スタッフ別シートをすべて削除 */
function menuDeleteStaffSheets() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.alert(
    '確認',
    '「' + OUT_PREFIX + '〇〇」形式のシートをすべて削除します。よろしいですか？',
    ui.ButtonSet.OK_CANCEL
  );
  if (res !== ui.Button.OK) return;

  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var sheets  = ss.getSheets();
  var deleted = 0;
  sheets.forEach(function(sheet) {
    if (sheet.getName().indexOf(OUT_PREFIX) === 0 ||
        sheet.getName() === UNMATCHED_SHEET) {
      ss.deleteSheet(sheet);
      deleted++;
    }
  });
  ui.alert('削除完了', deleted + ' 枚のシートを削除しました。', ui.ButtonSet.OK);
}

/** マッピング一覧を表示 */
function menuShowMapping() {
  var lines = ['【カレンダーID → スタッフ名 マッピング一覧】\n'];
  STAFF_MAP.forEach(function(m) {
    lines.push('  ' + m.calendarId + '\n    → ' + m.assignee);
  });
  lines.push('\n未マッピングのカレンダーID → '
    + (INCLUDE_UNMATCHED ? '「' + UNMATCHED_SHEET + '」に出力' : '出力しない'));

  SpreadsheetApp.getUi().alert(
    'マッピング一覧',
    lines.join('\n'),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/** 毎日AM7:00に自動実行するトリガーを設定 */
function menuSetTrigger() {
  _deleteAllTriggers();
  ScriptApp.newTrigger('triggerDailyDistribute')
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .create();
  SpreadsheetApp.getUi().alert(
    'トリガー設定完了',
    '毎日 AM7:00 に自動振り分けが実行されます。\n'
    + '「📋 スタッフ別振り分け」→「定期実行トリガーを削除」で解除できます。',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/** トリガー削除 */
function menuDeleteTriggers() {
  var n = _deleteAllTriggers();
  SpreadsheetApp.getUi().alert('削除完了', n + ' 件のトリガーを削除しました。',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

// ────────────────────────────────────────────────────────────
//  定期実行用エントリポイント
// ────────────────────────────────────────────────────────────
function triggerDailyDistribute() {
  distributeToStaffSheets();
}

// ────────────────────────────────────────────────────────────
//  メイン処理：「カレンダー予定一覧」→ スタッフ別シート振り分け
// ────────────────────────────────────────────────────────────
function distributeToStaffSheets() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(SRC_SHEET_NAME);

  if (!src) {
    SpreadsheetApp.getUi().alert(
      'エラー',
      '「' + SRC_SHEET_NAME + '」シートが見つかりません。\n'
      + 'シート名を確認してください。',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return null;
  }

  // ① ソースデータを全取得
  var lastRow = src.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert(
      '情報',
      '「' + SRC_SHEET_NAME + '」にデータが見つかりませんでした。',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return null;
  }

  // ヘッダー行（1行目）を読む
  var headerRow    = src.getRange(1, 1, 1, src.getLastColumn()).getValues()[0];
  var colCalId     = _findColIndex(headerRow, ['カレンダーID', 'calendarId', 'calendar_id']);
  var colAttendee  = _findColIndex(headerRow, ['参加者', 'attendee', '招待者']);
  var colTitle     = _findColIndex(headerRow, ['スケジュール名', 'タイトル', 'title', '件名']);
  var colDate      = _findColIndex(headerRow, ['日付', 'date']);
  var colStart     = _findColIndex(headerRow, ['開始時間', '開始', 'start', 'start_time']);
  var colEnd       = _findColIndex(headerRow, ['終了時間', '終了', 'end', 'end_time']);

  Logger.log('列インデックス → calId:' + colCalId + ' title:' + colTitle
    + ' date:' + colDate + ' start:' + colStart + ' end:' + colEnd);

  // 列が見つからない場合はデフォルト（A〜F = 0〜5）
  if (colCalId  < 0) colCalId   = 0;
  if (colTitle  < 0) colTitle   = 2;
  if (colDate   < 0) colDate    = 3;
  if (colStart  < 0) colStart   = 4;
  if (colEnd    < 0) colEnd     = 5;

  // データ行を全取得
  var numCols  = src.getLastColumn();
  var allData  = src.getRange(2, 1, lastRow - 1, numCols).getValues();

  // ② カレンダーIDでグルーピング
  var groups   = {};   // assignee → 行配列
  var unmatchedRows = [];

  allData.forEach(function(row) {
    var calId    = String(row[colCalId] || '').trim().toLowerCase();
    if (!calId) return; // 空行スキップ

    var mapping  = _findMapping(calId);
    var assignee = mapping ? mapping.assignee : null;

    if (!assignee) {
      // マッピングなし
      unmatchedRows.push(row);
      return;
    }

    if (!groups[assignee]) groups[assignee] = { mapping: mapping, rows: [] };
    groups[assignee].rows.push(row);
  });

  // ③ スタッフ別シートへ書き出し
  var summary  = [];
  var dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  Object.keys(groups).forEach(function(assignee) {
    var grp      = groups[assignee];
    var mapping  = grp.mapping;
    var dataRows = grp.rows;
    var sheetName = OUT_PREFIX + assignee;

    // シート取得または作成
    var outSheet = ss.getSheetByName(sheetName);
    if (!outSheet) outSheet = ss.insertSheet(sheetName);

    outSheet.clearContents();
    outSheet.clearFormats();

    // 出力ヘッダー
    var outHeaders = ['日付', '曜日', '開始', '終了', 'スケジュール名', '参加者', 'カレンダーID'];
    var writeRows  = [outHeaders];

    dataRows.forEach(function(row) {
      var dateVal  = row[colDate];
      var dayOfWeek = '';

      // 曜日計算
      try {
        var d;
        if (dateVal instanceof Date) {
          d = dateVal;
        } else {
          // "2026年7月14日" または "2026-07-14" 形式を変換
          var dateStr = String(dateVal)
            .replace(/(\d{4})年(\d{1,2})月(\d{1,2})日/, '$1-$2-$3');
          d = new Date(dateStr);
        }
        if (!isNaN(d.getTime())) dayOfWeek = dayNames[d.getDay()];
      } catch(e) {}

      // 日付を「yyyy/MM/dd」形式で統一出力
      var dateOut = dateVal;
      if (dateVal instanceof Date) {
        dateOut = Utilities.formatDate(dateVal, 'Asia/Tokyo', 'yyyy/MM/dd');
      }

      // 時刻を「HH:mm」形式で統一出力
      var startOut = _formatTime(row[colStart]);
      var endOut   = _formatTime(row[colEnd]);
      var attendee = (colAttendee >= 0) ? (row[colAttendee] || '') : '';

      writeRows.push([
        dateOut,
        dayOfWeek,
        startOut,
        endOut,
        row[colTitle]    || '',
        attendee,
        row[colCalId]    || ''
      ]);
    });

    // 書き込み
    if (writeRows.length > 1) {
      outSheet.getRange(1, 1, writeRows.length, outHeaders.length).setValues(writeRows);

      // 土日行に色付け
      for (var i = 1; i < writeRows.length; i++) {
        var dow = writeRows[i][1];
        var bg  = dow === '土' ? '#bbdefb' : dow === '日' ? '#ffcdd2' : (mapping.color || null);
        if (bg) outSheet.getRange(i + 1, 1, 1, outHeaders.length).setBackground(bg);
      }
    }

    // ヘッダースタイル
    var hdr = outSheet.getRange(1, 1, 1, outHeaders.length);
    hdr.setFontWeight('bold');
    hdr.setBackground(mapping.headerColor || '#4285F4');
    hdr.setFontColor('#ffffff');
    hdr.setHorizontalAlignment('center');

    // スタッフ名を A1 上部に表示（1行インサート）
    outSheet.insertRowBefore(1);
    var titleCell = outSheet.getRange(1, 1, 1, outHeaders.length);
    titleCell.merge();
    titleCell.setValue('▶ ' + assignee + ' のスケジュール（取込: '
      + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm') + '）');
    titleCell.setBackground(mapping.headerColor || '#4285F4');
    titleCell.setFontColor('#ffffff');
    titleCell.setFontWeight('bold');
    titleCell.setFontSize(12);

    // 列幅自動調整・行固定・フィルター
    outSheet.autoResizeColumns(1, outHeaders.length);
    outSheet.setFrozenRows(2); // タイトル行＋ヘッダー行

    // フィルター設定（ヘッダー＋データ範囲）
    var filterRange = outSheet.getRange(2, 1, writeRows.length, outHeaders.length);
    if (outSheet.getFilter()) outSheet.getFilter().remove();
    filterRange.createFilter();

    // シートタブ色
    if (mapping.color) outSheet.setTabColor(mapping.headerColor || mapping.color);

    var count = writeRows.length - 1;
    summary.push({ name: assignee, count: count });
    Logger.log('  ' + sheetName + ': ' + count + ' 件');
  });

  // ④ 未分類シート（INCLUDE_UNMATCHED=true の場合）
  if (INCLUDE_UNMATCHED && unmatchedRows.length > 0) {
    var unkSheet = ss.getSheetByName(UNMATCHED_SHEET) || ss.insertSheet(UNMATCHED_SHEET);
    unkSheet.clearContents();
    unkSheet.clearFormats();

    var unkHeaders = ['日付', '曜日', '開始', '終了', 'スケジュール名', '参加者', 'カレンダーID'];
    var unkRows    = [unkHeaders];

    unmatchedRows.forEach(function(row) {
      var dateVal   = row[colDate];
      var dayOfWeek = '';
      try {
        var d = dateVal instanceof Date ? dateVal : new Date(String(dateVal).replace(/(\d{4})年(\d{1,2})月(\d{1,2})日/, '$1-$2-$3'));
        if (!isNaN(d.getTime())) dayOfWeek = dayNames[d.getDay()];
      } catch(e) {}

      var dateOut  = dateVal instanceof Date ? Utilities.formatDate(dateVal, 'Asia/Tokyo', 'yyyy/MM/dd') : dateVal;
      var attendee = (colAttendee >= 0) ? (row[colAttendee] || '') : '';
      unkRows.push([
        dateOut,
        dayOfWeek,
        _formatTime(row[colStart]),
        _formatTime(row[colEnd]),
        row[colTitle]  || '',
        attendee,
        row[colCalId]  || ''
      ]);
    });

    unkSheet.getRange(1, 1, unkRows.length, unkHeaders.length).setValues(unkRows);

    var unkHdr = unkSheet.getRange(1, 1, 1, unkHeaders.length);
    unkHdr.setFontWeight('bold');
    unkHdr.setBackground('#607d8b');
    unkHdr.setFontColor('#ffffff');

    unkSheet.autoResizeColumns(1, unkHeaders.length);
    unkSheet.setFrozenRows(1);
    unkSheet.setTabColor('#607d8b');
    Logger.log('  ' + UNMATCHED_SHEET + ': ' + (unkRows.length - 1) + ' 件');
  }

  ss.toast('振り分け完了: ' + allData.length + ' 件処理しました', '📋 スタッフ別振り分け', 5);
  Logger.log('振り分け完了: 合計 ' + allData.length + ' 件');

  return {
    total     : allData.length,
    summary   : summary,
    unmatched : unmatchedRows.length
  };
}

// ────────────────────────────────────────────────────────────
//  ユーティリティ
// ────────────────────────────────────────────────────────────

/**
 * ヘッダー行から列インデックスを検索
 * @param {Array}  headerRow - ヘッダー行の値配列
 * @param {Array}  candidates - 候補列名の配列（いずれかに一致）
 * @returns {number} 0始まりのインデックス / 見つからなければ -1
 */
function _findColIndex(headerRow, candidates) {
  for (var i = 0; i < headerRow.length; i++) {
    var h = String(headerRow[i]).trim();
    for (var j = 0; j < candidates.length; j++) {
      if (h === candidates[j] || h.toLowerCase() === candidates[j].toLowerCase()) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * カレンダーID（小文字）でマッピングを検索
 * @param {string} calIdLower - 小文字化されたカレンダーID
 * @returns {Object|null} STAFF_MAP のエントリ または null
 */
function _findMapping(calIdLower) {
  for (var i = 0; i < STAFF_MAP.length; i++) {
    if (STAFF_MAP[i].calendarId.toLowerCase() === calIdLower) {
      return STAFF_MAP[i];
    }
  }
  return null;
}

/**
 * 時刻値を「HH:mm」文字列に変換
 * スプシの時刻は Date オブジェクトまたは "10:00" 文字列で入ることがある
 */
function _formatTime(val) {
  if (!val && val !== 0) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Tokyo', 'HH:mm');
  }
  var s = String(val).trim();
  // "10:00:00" → "10:00"
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) return s.slice(0, 5);
  return s;
}

/** 全トリガーを削除して件数を返す */
function _deleteAllTriggers() {
  var ts = ScriptApp.getProjectTriggers();
  ts.forEach(function(t) { ScriptApp.deleteTrigger(t); });
  return ts.length;
}
