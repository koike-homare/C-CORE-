/**
 * ============================================================
 *  C-CORE  —  Google カレンダー GAS 同期スクリプト
 *  gas_calendar_sync.gs
 * ============================================================
 *
 * 【使い方】
 *  1. Google Drive で「新しいスクリプト」を作成してこのコードを貼り付ける
 *  2. STAFF_CALENDARS の内容を実際のスタッフ情報に合わせて確認する
 *  3. 「デプロイ」→「新しいデプロイ」
 *       種類         : ウェブアプリ
 *       実行ユーザー : 自分 (me)
 *       アクセス     : 全員 (Anyone)
 *  4. 発行された Web App URL を C-CORE 側の「GAS設定」に貼り付ける
 *
 * 【GETパラメータ】
 *   daysAhead  : 何日後までのイベントを取得するか（デフォルト 30）
 *   staffId    : 特定スタッフのみ取得する場合は calendar_id を指定
 *                省略時は全スタッフ取得
 *
 * 【返却 JSON】
 *   {
 *     "ok": true,
 *     "fetchedAt": "2026-07-15T10:00:00.000Z",
 *     "events": [
 *       {
 *         "gas_event_id"  : "カレンダーID__イベントID",
 *         "calendar_id"   : "koike@8sin.co.jp",
 *         "assignee"      : "小池",
 *         "title"         : "撮影対応",
 *         "date"          : "2026-07-20",
 *         "start_time"    : "10:00",
 *         "end_time"      : "12:00",
 *         "duration_hours": 2.0,
 *         "all_day"       : false,
 *         "notes"         : "（説明文）",
 *         "location"      : ""
 *       },
 *       ...
 *     ]
 *   }
 *
 * 【注意事項】
 *   - スクリプトを実行するGoogleアカウントが各カレンダーの
 *     「閲覧権限」以上を持っている必要があります
 *   - 終日イベントは start_time="00:00", end_time="23:59",
 *     duration_hours=0, all_day=true として返却します
 * ============================================================
 */

// ────────────────────────────────────────────────────────────
//  スタッフ設定（calendar_id と表示名）
//  ※ calendar_id は C-CORE のアカウント管理に登録した値と一致させること
// ────────────────────────────────────────────────────────────
var STAFF_CALENDARS = [
  { calendar_id: "koike@8sin.co.jp",          assignee: "小池" },
  { calendar_id: "hamano8sin@gmail.com",       assignee: "濱野" },
  { calendar_id: "takao8sin@gmail.com",        assignee: "高尾" },
  { calendar_id: "nishiwaki8400@gmail.com",    assignee: "西脇" },
  { calendar_id: "youngkwang8sin@gmail.com",   assignee: "YOUNGKWANG" },
  { calendar_id: "satsuei8sin@gmail.com",      assignee: "松永" }
];

// ────────────────────────────────────────────────────────────
//  doGet: Web App エントリポイント
// ────────────────────────────────────────────────────────────
function doGet(e) {
  // CORS ヘッダーを付与して JSON を返す
  var output = ContentService
    .createTextOutput()
    .setMimeType(ContentService.MimeType.JSON);

  try {
    var params    = e ? (e.parameter || {}) : {};
    var daysAhead = parseInt(params.daysAhead || "30", 10);
    var filterCal = params.staffId || null;   // 特定スタッフのみ取得したい場合

    if (isNaN(daysAhead) || daysAhead < 1)  daysAhead = 30;
    if (daysAhead > 365)                     daysAhead = 365;

    var now  = new Date();
    var end  = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    var allEvents = [];

    STAFF_CALENDARS.forEach(function(staff) {
      // staffId フィルター
      if (filterCal && filterCal !== staff.calendar_id) return;

      try {
        var cal = CalendarApp.getCalendarById(staff.calendar_id);
        if (!cal) {
          Logger.log("Calendar not found: " + staff.calendar_id);
          return;
        }

        var events = cal.getEvents(now, end);

        events.forEach(function(ev) {
          var startDt   = ev.getStartTime();
          var endDt     = ev.getEndTime();
          var isAllDay  = ev.isAllDayEvent();

          var dateStr      = Utilities.formatDate(startDt, "Asia/Tokyo", "yyyy-MM-dd");
          var startTimeStr = isAllDay ? "00:00" : Utilities.formatDate(startDt, "Asia/Tokyo", "HH:mm");
          var endTimeStr   = isAllDay ? "23:59" : Utilities.formatDate(endDt,   "Asia/Tokyo", "HH:mm");
          var durationHrs  = isAllDay ? 0 : Math.round((endDt - startDt) / 36000) / 100;

          // 重複防止キー: カレンダーID __ イベントID
          var gasEventId = staff.calendar_id + "__" + ev.getId();

          allEvents.push({
            gas_event_id  : gasEventId,
            calendar_id   : staff.calendar_id,
            assignee      : staff.assignee,
            title         : ev.getTitle()       || "（タイトルなし）",
            date          : dateStr,
            start_time    : startTimeStr,
            end_time      : endTimeStr,
            duration_hours: durationHrs,
            all_day       : isAllDay,
            notes         : ev.getDescription() || "",
            location      : ev.getLocation()    || ""
          });
        });

      } catch (calErr) {
        Logger.log("Error fetching calendar [" + staff.calendar_id + "]: " + calErr.toString());
      }
    });

    // 日付 → 開始時刻 でソート
    allEvents.sort(function(a, b) {
      var ka = a.date + " " + a.start_time;
      var kb = b.date + " " + b.start_time;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });

    output.setContent(JSON.stringify({
      ok        : true,
      fetchedAt : new Date().toISOString(),
      daysAhead : daysAhead,
      count     : allEvents.length,
      events    : allEvents
    }));

  } catch (err) {
    output.setContent(JSON.stringify({
      ok    : false,
      error : err.toString()
    }));
  }

  return output;
}


// ────────────────────────────────────────────────────────────
//  テスト用: スクリプトエディタで直接実行して動作確認
// ────────────────────────────────────────────────────────────
function testFetch() {
  var result = doGet({ parameter: { daysAhead: "14" } });
  Logger.log(result.getContent());
}
