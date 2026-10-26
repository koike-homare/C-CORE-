# C-RORE / Collection Core System

インフルエンサーマーケティング案件のエンドツーエンド管理システム。クライアント・インフルエンサー・案件・請求・サービス・チケット・チケット商品を一元管理します。

---

## 機能一覧（実装済み）

### ナビゲーション
| ページID | 説明 |
|---|---|
| `dashboard` | ダッシュボード（KPI集計） |
| `clients` | クライアント管理 |
| `influencers` | インフルエンサー管理 |
| `projects` | 案件一覧 |
| `schedule` | スケジュール管理 |
| `products` | サブスク/スポット管理（経費管理機能付き） |
| `tickets` | チケット管理 |
| `ticket-products` | チケット商品管理 |
| `inf-applications` | インフルエンサー申請管理 |
| `company` | 企業情報・アカウント管理 |
| `tasks` | タスク管理（Googleカレンダー GAS同期対応）|

---

### Googleカレンダー GAS連携（2026-07-15 追加）

#### 概要
Google Apps Script (GAS) を中継サーバーとして使い、スタッフ6名のGoogleカレンダーから予定を取得し `schedules` テーブルへ自動取込します。iCal URL 直接 fetch は CORS でブロックされるため、GAS Web App を経由する構成です。

#### スタッフ一覧（カレンダーID）
| スタッフ名 | カレンダーID |
|---|---|
| 小池 | koike@8sin.co.jp |
| 濱野 | hamano8sin@gmail.com |
| 高尾 | takao8sin@gmail.com |
| 西脇 | nishiwaki8400@gmail.com |
| YOUNGKWANG | youngkwang8sin@gmail.com |
| 松永 | satsuei8sin@gmail.com |

#### セットアップ手順
1. Google Drive で新しい Apps Script プロジェクトを作成する
2. `gas_calendar_sync.gs` の内容をコピーして貼り付ける
3. 「デプロイ」→「新しいデプロイ」→ 種類: **ウェブアプリ**
   - 実行ユーザー: **自分 (me)**
   - アクセスできるユーザー: **全員 (Anyone)**
4. 発行された Web App URL（`/exec` で終わるURL）をコピーする
5. C-CORE の「タスク管理」ページ → **「GAS設定」ボタン** → URL を貼り付けて保存

#### 動作フロー
```
C-CORE 「カレンダー取込」ボタン
  → GAS Web App fetch (daysAhead パラメータ付き)
  → GAS: CalendarApp.getEvents() で全スタッフのイベント取得
  → JSON返却 { events: [...] }
  → C-CORE: gas_event_id で重複チェック
  → schedules テーブルへ新規イベントのみ POST（追加のみ・削除/変更は手動）
```

#### UI
- **タスク管理ページ** スタッフタブバー右端に「カレンダー取込」「GAS設定」ボタンを追加
- **接続状態バッジ**（🔴未設定 / 🟢設定済み）でURL登録状況を視覚表示
- **同期ログパネル**（ターミナル風）：取込件数・スキップ件数をリアルタイム表示
- **企業情報 → アカウント管理** 各スタッフに「カレンダーID」「埋め込みコード」入力欄を追加
  - カレンダーID設定済みのアカウントに「連携済」バッジを表示

#### GAS Web App パラメータ
| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `daysAhead` | number | 30 | 今日から何日先まで取得するか（最大365） |
| `staffId` | string | (全員) | 特定スタッフのカレンダーIDで絞込 |

#### localStorage キー
| キー | 内容 |
|---|---|
| `ccore_gas_calendar_url` | GAS Web App URL |
| `ccore_gas_days_ahead` | 取得日数（デフォルト30） |

#### データモデル変更点
- `accounts` テーブル: `calendar_id`（text）, `embed_code`（rich_text）フィールド追加（9フィールド）
- `schedules` テーブル: `gas_event_id`（text・重複防止キー）, `gas_synced_at`（number・Unix ms）フィールド追加（14フィールド）

---
| `company` | 企業情報 |

---

### インフルエンサー申請ツール（`inf-applications` ページ + `apply.html`）

#### 概要
SNS広告リンクから外部インフルエンサーが自己申請できる仕組みと、C-COREの管理画面で申請を審査・承認・拒否できる機能。

#### フロー
```
SNS広告 → apply.html（公開フォーム） → influencer_applications テーブルに保存
→ C-CORE管理画面「インフルエンサー申請」ページで受信
→ 承認 → influencers テーブルへ自動登録 + サイドバーバッジ消灯
→ 拒否 → status = 'rejected' に更新（インフルエンサー登録なし）
```

#### `apply.html`（公開申請フォーム）
- **URL**: `apply.html`（SNS広告リンク先として使用）
- **3ステップウィザード**形式（基本情報 → SNS情報 → 確認・送信）
- 入力項目：名前/活動名・メール・電話・活動地域・ジャンル・メインSNS・SNS URL・フォロワー数・サブSNS（複数）・依頼単価・自己PR
- バリデーション付き・個人情報同意チェックボックス付き
- 申請完了後：成功画面（申請ID表示・審査フロー説明）

#### 管理画面（`page-inf-applications`）
- 集計バー：全申請数・審査待ち・承認済み・拒否の4カードをクリックでフィルタ
- ステータスタブ：すべて / 審査待ち（バッジ付き）/ 承認済み / 拒否
- 検索：名前・SNS・ジャンル・地域・メールで絞り込み
- 申請カード（一覧）：クリックで詳細モーダルを開く
  - 審査待ちカードには「承認」「拒否」クイックボタン表示
- 詳細モーダル（`modal-inf-application`）：
  - 左：基本情報・SNS情報・自己PR
  - 右（審査パネル）：管理者メモ・担当者入力・承認/拒否ボタン
  - 承認後：「承認済み・インフルエンサー登録完了」バナー表示
  - 拒否後：「拒否済み」バナー表示

#### サイドバーバッジ
- 審査待ち申請がある間はサイドバーの「インフルエンサー申請」に赤バッジを表示
- 全申請承認/拒否後にバッジ消灯

---

### サブスク/スポット 経費管理（`page-products`）

- **経費列追加**：一覧テーブルに「経費」列を追加。登録済み経費の合計金額・件数を表示
- **経費管理モーダル**（`openExpenseModal(productId)` で開く）
  - 上部サマリーバー：売上参照値 / 経費合計（計算値）/ 利益（参照値）
  - **固定費セクション**：費用タイプ2種でフォームパネル入力（CRUD対応）
    - `固定`（fixed）：毎回一定の金額を経費として設定
    - `割合`（ratio）：売上の●%を経費として設定（リアルタイムプレビュー付き）
  - **追加経費セクション**：インラインテーブル入力形式（2026-06-07 変更）
    - 列構成：経費名 / 単価 / 数量 / 合計（自動計算） / 備考 / 削除ボタン
    - デフォルト2行表示、「＋ 追加」ボタンで行を追加
    - 各セルを直接編集可能、フォーカスアウト時に自動保存（API PATCH）
    - 合計 = 単価 × 数量 をリアルタイム計算
- **データ永続化**：`product_expenses` テーブルへ保存（product_id で紐付け）

---

### チケット管理（`page-tickets`）
- チケット番号自動採番：`TKT-YYYYMM-NNN`
- **ステータス**：提案中／進行中／請求中／完了
- **カテゴリ**：ソフトデリート対応、カラーバッジ付き
- **期間**：開始日〜終了日
- **詳細内容**：チケット商品管理から複数選択
- KPI4枚（提案中/進行中/請求中/完了）
- 検索・ステータスフィルタ・カテゴリフィルタ
- 📄 提案書作成ボタン → A4横向き2ページ提案書モーダル
- 💰 入金通知書ボタン → 月選択 → 印刷用PDF出力

### チケット商品管理（`page-ticket-products`）
- カードグリッド表示（レスポンシブ、12件/ページ）
- **自動「販売中」判定**：チケットの start_date〜end_date が今日を含む商品を自動で「販売中」に設定（メモリのみ、DBは変更しない）
- コピー作成ボタン（status=「販売可」でPOST）
- 編集時確認ダイアログ（status=「販売中」の場合）
- **タブUI**：「商品管理」「フォーマット管理」の2タブ構成（`switchTprodTab()`）

---

### フォーマット管理機能（`page-ticket-products` > フォーマット管理タブ）

- **proposal_formats テーブル** にフォーマット定義を保存
- フィールド：`format_name`（フォーマット名）・`product_count`（1 or 2）・`sort_order`（並び順）
- CRUD：一覧表示・新規作成・編集・削除
- **適応タイプ**：カード選択UI（商品数1 / 商品数2）
- バッジ表示：青=商品数1・緑=商品数2

---

### 提案書機能（2026-05-24 全面改訂）

#### 商品数1 — A4縦向き 1ページ構成（`_buildProposalHtml1`）
参照デザイン：すき焼きしゃぶしゃぶ ひら乃 生協組合員限定オリジナルランチフライヤー

| セクション | 内容 |
|---|---|
| ① タイトルバー | 白背景・赤太字タイトル・下部3px赤ライン |
| ② 情報ブロック | 左58%: 黒ラベル行（有効期限/店舗名アクセス/ご利用可能時間） / 右42%: 店舗説明テキスト+補助写真 |
| ③ 商品エリア | 左46%: 料理写真(大) / 右54%: 商品名(赤太字)+詳細テキスト |
| ④ 価格テーブル | 3列（種別/注文番号/組合員価格）、「組合員価格」列のみ赤背景ヘッダー |
| ⑤ 注意書き | ●箇条書き本文（黒） + ※警告（赤） + 電話番号 |
| ⑥ フッター | 左:電話番号 / 右:「取扱い窓口 ○○」赤太字 |

使用フィールド：`title`, `period`, `unavailable`, `store_name`, `store_addr`, `store_hours`, `store_desc`, `sub_img1`, `sub_img2`, `prod1_img`, `prod1_name`, `prod1_detail`, `prod1_order`, `prod1_price`, `prod1_notice`, `notes`, `warn_text`, `phone`, `issuer`

#### 商品数2 — A4横向き 2ページ構成（`_buildProposalHtml2`）

| ページ | 内容 |
|---|---|
| 1ページ目 | タイトル帯 + 基本情報（有効期限・店舗名・営業時間） + 商品エリア（2商品並列） + 注意書き・問い合わせ |
| 2ページ目 | 周辺MAP（OpenStreetMap / Leaflet.js）+ 店舗情報まとめ |

#### 共通仕様
- **ディスパッチャー**: `_buildProposalWindowHtml(s, logoHtml, mapHtml, t)` → `s.is_two_products` で分岐
- **各フィールドを contenteditable でインライン編集可能**
- **商品画像クリックでアップロード**（base64、300KB以内に自動リサイズ）
- **OpenStreetMap + Nominatim** でジオコーディング（住所→座標）し Leaflet.js でマップ表示
  - Google Maps API 不要・無料・CORS対応
- **印刷 / PDF保存ボタン**：新しいウィンドウで印刷
- **「マップ更新」ボタン**：住所編集後に手動再読み込み（商品数2のみ）

---

### 入金通知書（チケット）
- パターンA（billing_items 使用）・パターンB（商品マスタのみ）
- 商品名セルに「販売価格 XXXX」サブテキスト表示
- 手数料率を行ごとに計算（手数料率の固定値バグ修正済み）
- 集計テーブル：率別行分割表示（15%、20%等）
- 精算額・小計から括弧 `()` 削除

---

## テーブル構造

| テーブル名 | 説明 | 主要フィールド |
|---|---|---|
| `clients` | クライアント | company_name, industry, status |
| `client_contacts` | クライアント担当者 | client_id, name, email, phone, is_deleted |
| `projects` | 案件 | project_name, client_id, contact_id, status, budget |
| `influencers` | インフルエンサー | name, sns_type, followers, unit_price |
| `project_influencers` | 案件×インフル紐付け | project_id, influencer_id, request_status |
| `products` | サブスク/スポット案件 | product_type, product_name, client_id, status |
| `invoice_items` | 請求明細 | product_id, item_name, unit_price, quantity |
| `services` | サービスマスタ | service_name, service_type, is_deleted |
| `company_info` | 企業情報 | company_name, address, bank_name |
| `ticket_categories` | チケットカテゴリ | name, color, is_deleted, sort_order |
| `tickets` | チケット | ticket_number, title, category_id, status, start_date, end_date, ticket_product_ids, billing_items |
| `ticket_products` | チケット商品マスタ | store_name, product_name, sale_price, commission_collection, commissions[], status, image_url, store_address, store_hours, store_phone, product_detail |
| `product_expenses` | 経費マスタ | product_id, expense_name, expense_category(fixed_cost/extra_cost), expense_type(fixed/ratio), amount, ratio, unit_price, quantity, notes, sort_order |
| `influencer_applications` | インフルエンサー申請 | name, email, phone, sns_main, sns_url, followers, genre, region, price_min, price_max, pr_text, sub_sns[], status(pending/approved/rejected), admin_note, influencer_id, applied_at, reviewed_at, reviewed_by |

---

## API エンドポイント（相対URL）

```
GET    tables/{table}          一覧取得（?page=1&limit=100&sort=field）
GET    tables/{table}/{id}     1件取得
POST   tables/{table}          新規作成
PUT    tables/{table}/{id}     全更新
PATCH  tables/{table}/{id}     部分更新（ソフトデリートに使用）
DELETE tables/{table}/{id}     削除（ソフトデリート推奨）
```

---

## 技術仕様

- **フロントエンド**：HTML5 + CSS3 + Vanilla JS（モジュールなし）
- **CDN**：Font Awesome 6.4.0, Google Fonts (Inter / Noto Sans JP), Chart.js 4.4.0
- **Leaflet.js**：動的ロード（提案書マップ表示時のみ）`v1.9.4`
- **OpenStreetMap + Nominatim**：住所ジオコーディング（無料・API Key不要）
- **データ永続化**：RESTful Table API（相対パス `tables/`）
- **ソフトデリート**：`API.patch(table, id, { is_deleted: true })` で論理削除
- **モーダル制御**：`.open` クラス付与 / `data-modal` 属性でクローズ
- **トースト通知**：`showToast(msg, type)` — type: `success`（デフォルト）/ `error`
- **base64画像処理**：`_resizeImageToBase64(file, {maxPx, quality, maxBytes})` で圧縮

---

## 既知の未実装・今後の拡張候補

- [ ] チケット→案件・クライアントの紐付け
- [ ] チケット商品の並び替え（ドラッグ＆ドロップ）
- [ ] チケット商品の在庫数管理
- [ ] 申請フォーム(原数カウンター)の必要応じて追加
- [ ] 申請承認のメール通知（外部SMTP連携）
- [ ] タスク管理：オーバーワーク閾値をUI上で設定可能にする
- [ ] タスク管理：スタッフ別の週次・月次作業時間レポート
- [ ] タスク管理：タスク引継ぎ完了通知機能

---

## 最近の主要改修履歴（2026-05-25）

### ダッシュボード 分析タブ大幅拡張
| 変更内容 | 詳細 |
|---|---|
| 売上合算 | インフルエンサー案件 + サブスク/スポット + チケット販売を全カテゴリ合計して表示 |
| カテゴリ別売上比率 | 積み上げ横棒グラフ（純CSS）+ 凡例でカテゴリ別金額・パーセントを表示 |
| 月別売上テーブル | グラフ廃止→テーブル化。計測期間・売上合計・インフルエンサー案件・サブスク/スポット・チケット販売・原価・利益・利益率・案件数の9列 |
| 月別フィルター | `type="month"` input × 2（From/To）で期間絞り込み。適用ボタン・リセットボタン付き |
| テーブルソート | 全列ソート対応（`_analysisSortCol`/`_analysisSortDir`）。ヘッダークリックで昇順/降順切替 |
| 利益率バッジ | ≥30%: 緑（`margin-good`）/ 20-30%: 黄（`margin-mid`）/ <20%: 赤（`margin-bad`） |
| 合計行 | テーブル末尾に全期間合計行を表示 |
| 戦略AI自動更新 | ボタン廃止→毎日00:00に自動更新（`localStorage` 日次キャッシュ / `_STRATEGY_STORAGE_KEY_PREFIX` キー）|
| 戦略更新日時 | セクションヘッダーに「最終更新: YYYY-MM-DD」表示（`dash-analysis-strategy-updated`）|
| 翌00:00タイマー | `_scheduleMidnightStrategyRefresh()` で毎日0時にキャッシュクリア→再生成 |

### セールスタブ 戦略更新
| 変更内容 | 詳細 |
|---|---|
| 戦略ボタン廃止 | 「分析を更新」ボタンを削除 |
| 自動更新対応 | `_autoRefreshDailyStrategy('sales', ...)` 呼び出しに変更。分析タブと同じ日次キャッシュ方式 |
| 更新日時表示 | セクションヘッダーに「最終更新: YYYY-MM-DD」表示（`dash-sales-strategy-updated`）|

### クライアント管理
| 変更内容 | 詳細 |
|---|---|
| 業種→支店名/部署名 | テーブルヘッダー・renderClients内の `c.industry` → `c.branch_dept` に統一 |
| クライアント結合機能 | チェックボックス選択 → 優先クライアント選択 → プレビュー → 担当者/案件/product移行 → 不要クライアント削除 |

### CSV取込
| 変更内容 | 詳細 |
|---|---|
| ドロップ対応 | `<label>` → `<div>` 化。`dragenter`/`dragover`/`dragleave`/`drop` イベント実装 |
| dragCounterによる誤fire対策 | 子要素への移動時の誤 `dragleave` 発火を `dragCounter` で抑制 |
| MutationObserver | モーダルopen時に `_droppedFile` リセット |

### コード修正
| 変更内容 | 詳細 |
|---|---|
| `_generateStrategyAnalysis` | 2引数 → 3引数（`callback` 追加）に変更。コールバック形式と直接描画形式の両対応 |
| CSS追加 | `.dash-ratio-*`（売上比率バー）/ `.dash-monthly-table`（月別テーブル）/ `.dash-month-input`（フィルター入力）/ `.dash-filter-apply/reset`（フィルターボタン）/ `.dash-strategy-updated`（更新日時）/ `.margin-good/mid/bad`（利益率バッジ）/ `.dash-mt-*`（テーブルセル補助） |
- [ ] ソフトデリートされたチケットの復元UI
- [ ] 提案書の保存・テンプレート機能
- [ ] 案件詳細パネルにクライアント担当者情報を表示

---

## ファイル構成

```
index.html       メインHTML（全ページ・全モーダルを含む）
js/
  app.js         全ロジック（約11500行）
css/
  style.css      全スタイル（約9300行）
```

---

*最終更新：2026-07-14（タスク管理 時間管理中心改修）*

## 変更履歴（直近）

### 2026-07-14 — タスク管理機能 時間管理中心改修

#### ダッシュボード
| 変更内容 | 詳細 |
|---|---|
| サマリーカード刷新 | 「今日の総作業時間」「未完了タスク予測時間計」「オーバーワーク人数」「期限超過タスク数」に変更 |
| スタッフ別概要テーブル | 列を「今日(h)／予測(h)／未完了／進行中／期限超過」に変更。オーバーワーク行を橙背景でハイライト |
| 負荷バーグラフ | スタッフ別の今日の作業時間をCSSバーグラフで可視化。閾値ライン（赤線）・段階別カラー（通常/注意≥6h/オーバー≥8h）付き |
| タスク集中検知 | 1人に未完了タスクの40%以上が集中している場合に警告バナーを表示 |

#### スタッフ別ページ
| 変更内容 | 詳細 |
|---|---|
| 時間サマリーバー | ページ上部に「今日の作業時間／未完了タスク予測合計／残予測時間／未完了タスク数」4チップを表示 |
| オーバーワーク警告バナー | 作業時間≥6h：注意バナー（橙）、≥8h：警告バナー（橙）、≥10h：深刻バナー（赤） |
| タスク集中警告バナー | 全体比40%以上集中時に黄色バナーで表示 |

#### 設定定数（`app.js` / `js/app.js`）
| 定数 | 値 | 意味 |
|---|---|---|
| `OVERWORK_THRESHOLD_TODAY` | 8（h） | 今日の作業時間オーバーワーク閾値 |
| `OVERWORK_THRESHOLD_EST` | 40（h） | 週予測時間の参考閾値 |
| `TASK_CONCENTRATION_RATIO` | 0.4（40%） | 1人集中警告の割合閾値 |

#### キャッシュバスティング
- `css/style.css` → `?v=20260714c`
- `app.js` / `js/app.js` → 動的読み込み（バージョンなし）

---

### 2026-06-08 — 「お断り/待ち」グループの正式実装

#### 概要
案件詳細のインフルエンサーリストに「お断り/待ち」専用グループを追加。
一度アサインしたものの都合が合わずアサイン不可となったインフルエンサーを、記録として残しつつ集計・スケジュール・共有から除外できる。

#### 実装内容

| 機能 | 詳細 |
|---|---|
| **最下部固定表示** | `sort_order` に関係なく、常にリスト最下部に表示される |
| **専用ヘッダーUI** | グレー背景・🚫アイコン・「集計・スケジュール除外」バッジで視覚的に区別 |
| **アサイン単価合計から除外** | 案件詳細のコストサマリー（アサイン合計・粗利・利益率）の計算対象外 |
| **ドラッグ並び替え無効** | `draggable="false"` で誤移動を防止 |
| **グループ名編集・削除ボタン非表示** | 固有グループ名を保護 |
| **追加ボタン設置** | グループ追加行に「お断り/待ちリストを追加」ボタンを表示（未作成時のみ） |
| **一括移動の選択肢に追加** | チェックボックス一括移動のドロップダウンに 🚫 付きで表示 |
| **アサイン人数サブテキスト** | コストサマリーに「（お断り/待ち N名を除く）」を表示 |

#### すでに実装済みだった除外処理（変更なし）
- インフルエンサー分析テーブルの集計（`_renderInfAnalysisTable`）
- スケジュール確認モーダル（`openScheduleModal`）
- スケジュール共有（`schedule-share.html`）

### 2026-05-27 — 案件複数クライアント対応
- **`projects` テーブルに `project_clients` フィールド（text型）追加**
  - JSON配列: `[{"client_id":"xxx","contact_id":"yyy","budget":330000}, ...]`
  - 後方互換のため `client_id` / `budget` フィールドは残存（先頭行の値を自動セット）
- **案件登録・編集モーダル（`index.html` + `js/app.js`）**
  - クライアント・担当者・予算を1行に集約した**行追加型UI**に変更
  - 「クライアント追加」ボタンで行を動的追加可能
  - 予算合計が自動計算されてリアルタイム表示
  - 担当者はクライアント選択に連動してドロップダウン表示
  - 1行のみの時は削除ボタンを非表示（誤操作防止）
- **案件一覧（`renderProjects`）**
  - クライアント列を全社名縦並び（`multi-client-list`）表示に変更
  - 検索フィルタも複数クライアント名に対応
- **案件詳細パネル（`openProjectDetail`）**
  - メタ情報のクライアント表示を「社名A / 社名B / ...」形式に変更
  - クライアント・担当者・予算を示す専用テーブル（`detail-client-table`）を追加
- **`css/style.css` / `style.css`**：複数クライアント行UI・詳細テーブル用CSS追加
- **`js/app.js` / `app.js`**：完全同期済み

---

### 2026-05-31 — インフルエンサー分析集計ルール確定・スケジュールメモ機能追加

#### ① インフルエンサー管理 — 食事ジャンル/単価帯フィルター追加（`js/app.js`）
- `loadInfluencers()` を 3 Promise.all に拡張（projRes 追加・foodGenreCount/priceRangeCount 集計）
- `renderInfluencers()` に `foodGenreFilter`/`priceRangeFilter` フィルター追加
- インフルエンサーカードに `.inf-v3-expertise` バッジ（得意ジャンル/単価帯）表示
- インフルエンサー類似検索 `getSimFilters()`/`renderSimResults()` にも同フィルター追加
- `style.css`/`css/style.css` に得意バッジ CSS 追加

#### ② インフルエンサー分析 — 集計バグ修正・CPR指標・期間フィルター追加（`app.js` / `index.html`）
| 変更内容 | 詳細 |
|---|---|
| 集計バグ修正 | `request_amount` 未入力時に `unit_price` で補填していた → 入力済みのみ合算に修正 |
| 指標変更 | 「フォロワー単価」→ **CPR（Cost per Reach）**= 累計支払 ÷ 累計リーチ |
| テーブル列追加 | 「累計リーチ」「得意ジャンル」列を追加 |
| 集計期間フィルター | プリセット5種（全期間/今年度/前年度/直近6ヶ月/直近3ヶ月）＋カスタム年月入力を追加 |
| 期間基準 | `visit_datetime` → `post_date` → `project.start_date` の優先順位で基準日を取得 |
| `_infAInRange()` | 期間フィルター判定ヘルパー関数追加 |
| `_iaPresetRange()` | 決算月対応の年度計算ヘルパー追加 |

#### ③ スケジュール共有・出力 — メモ機能追加（`app.js` / `index.html` / `schedule-share.html`）
- `projects` テーブルに `schedule_memo` フィールド追加
- スケジュール共有モーダル（`modal-schedule-share`）・出力モーダル（`modal-schedule-view`）両方にメモエリア追加
- どちらで編集・保存しても同一 DB フィールドに反映（Ctrl+Enter 保存対応）
- `schedule-share.html` にもメモ表示・編集（`renderMemoBox` / `initMemoBox`）実装
- 印刷/PDF 出力にもメモをボックス形式で挿入（`_printSchedule(project, ..., memo='')` 引数追加）

#### ④ 集計ルール確定 — `request_status` フィルタリング完全廃止（`js/app.js`）
- **発見**：`request_status` に旧ステータス「候補」が全894件中585件（65.4%）存在
- **ユーザー決定**：「候補・確定などのステータスは無視して集計する」（A案採用）
- `_renderInfAnalysisTable()` の `filteredAssigns` から `request_status === '調整中'` フィルターを削除
- アサインレコードが存在すること自体を実績としてカウント（キャンセル案件のみ除外）
- `_debug_assign.html`（調査用一時ファイル）を削除

#### テーブル構造更新
| テーブル | 追加フィールド | 型 |
|---|---|---|
| `projects` | `schedule_memo` | text |

---

### 2026-05-31 — report.html 報告書ジェネレーター改善（NG表現修正・結果ページ削除機能）

#### ① `generateAnalysis` NG表現修正（`report.html`）
クライアント提出用報告書としてネガティブ・改善示唆表現をすべて中立・事実報告表現に変更。

| 修正前（NG） | 修正後（OK） |
|---|---|
| `エンゲージメント率は低め。内容やハッシュタグ戦略の見直しが検討されます` | `エンゲージメント率は X% を記録しました` |
| `保存数は少なめだが、継続的なコンテンツ改善により向上が期待できる` | `保存数 N が記録されました` |
| `引き続き投稿後の反応を観察し、次回施策の改善に活かす予定です` | `引き続き投稿後の反応を観察してまいります` |
| `一定の保存が得られ、情報保存価値のある投稿` | `一定の保存が確認された、情報保存価値のある投稿` |

#### ② 結果ページ削除機能（`report.html`）
- 各 `page--result` の右上に **「× このページを削除」ボタン**（`.page-delete-btn.no-print`）を追加
- クリック → 確認ダイアログ → `page.remove()` でDOMから削除
- `rebuildSummaryFromDOM()` でサマリページ（テーブル行）を自動再生成
- `rebuildPageNumbers()` で全ページのフッター「X / Y」を振り直し
- 続きサマリページも件数に応じて自動追加・削除
- 印刷時は `.no-print` で非表示（`@media print` 適用済み）

#### 新規追加関数
| 関数 | 概要 |
|---|---|
| `deleteResultPage(btn)` | ボタン押下でページDOMを削除、サマリ再生成・番号振り直しを連鎖 |
| `rebuildSummaryFromDOM()` | 残存する結果ページのDOMからKPI値を読み取りサマリを再構築 |
| `rebuildPageNumbers()` | 全ページのフッターページ番号を振り直す |
