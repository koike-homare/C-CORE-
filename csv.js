/**
 * csv.js — CSV取込 / フォーマットダウンロード 共通ロジック
 * SheetJS (xlsx) を使わず、純粋なCSV + BOM出力（Excel対応）
 */

/* ================================================================
   各テーブルのフィールド定義
   label   : CSVヘッダー（日本語）
   key     : APIフィールド名
   required: 必須フラグ
   note    : 入力ガイド（フォーマット2行目に出力）
================================================================ */
const CSV_SCHEMAS = {

  /* ── クライアント管理 ── */
  clients: {
    label: 'クライアント管理',
    table: 'clients',
    fields: [
      { label: '会社名',             key: 'company_name',     required: true,  note: '例）株式会社〇〇' },
      { label: '支店名 / 部署名',    key: 'branch_dept',      required: false, note: '例）渋谷支店 / マーケティング部' },
      { label: '担当者名',           key: 'client_name',      required: false, note: '例）田中 太郎' },
      { label: 'メール',             key: 'email',            required: false, note: '例）tanaka@example.com' },
      { label: '電話番号',           key: 'phone',            required: false, note: '例）03-0000-0000' },
      { label: 'ステータス',         key: 'status',           required: false, note: '取引中 / 休眠 / 停止' },
      { label: '住所',               key: 'address',          required: false, note: '例）東京都渋谷区〇〇1-1-1' },
      { label: '銀行名',         key: 'bank_name',        required: false, note: '例）三菱UFJ銀行' },
      { label: '支店名',         key: 'bank_branch',      required: false, note: '例）渋谷支店' },
      { label: '口座種別',       key: 'bank_type',        required: false, note: '普通 / 当座' },
      { label: '口座番号',       key: 'bank_number',      required: false, note: '例）1234567' },
      { label: '適格請求書番号', key: 'qualified_number', required: false, note: '例）T1234567890123' },
      { label: 'メモ',           key: 'notes',            required: false, note: '自由記述' },
    ],
  },

  /* ── インフルエンサー管理 ── */
  influencers: {
    label: 'インフルエンサー管理',
    table: 'influencers',
    fields: [
      { label: '名前（活動名）',  key: 'name',             required: true,  note: '例）〇〇ちゃんねる' },
      { label: '本名',            key: 'real_name',        required: false, note: '例）山田 花子' },
      { label: 'SNS種別',         key: 'sns_type',         required: false, note: '例）Instagram / TikTok / YouTube（メインに*）Instagram*,TikTok' },
      { label: 'アカウントURL',   key: 'account_url',      required: false, note: '例）https://www.instagram.com/xxx' },
      { label: 'フォロワー数',    key: 'followers',        required: false, note: '半角数字 例）50000' },
      { label: 'ジャンル',        key: 'genre',            required: false, note: '例）グルメ・フード' },
      { label: 'エリア',          key: 'area',             required: false, note: '例）東京都' },
      { label: '連絡先メール',    key: 'contact_email',    required: false, note: '例）info@example.com' },
      { label: '電話番号',        key: 'phone',            required: false, note: '例）090-0000-0000' },
      { label: '住所',            key: 'address',          required: false, note: '例）東京都港区〇〇' },
      { label: '所属事務所',      key: 'agency',           required: false, note: '例）〇〇プロダクション' },
      { label: '単価目安',        key: 'unit_price',       required: false, note: '半角数字 例）50000' },
      { label: '案件受付',        key: 'available',        required: false, note: '受付中 / 停止中' },
      { label: '銀行名',          key: 'bank_name',        required: false, note: '例）三井住友銀行' },
      { label: '支店名',          key: 'bank_branch',      required: false, note: '例）新宿支店' },
      { label: '口座種別',        key: 'bank_type',        required: false, note: '普通 / 当座' },
      { label: '口座番号',        key: 'bank_number',      required: false, note: '例）7654321' },
      { label: '口座名義',        key: 'bank_holder',      required: false, note: '例）ヤマダ ハナコ（カタカナ）' },
      { label: '適格請求書番号',  key: 'qualified_number', required: false, note: '例）T1234567890123' },
      { label: 'メモ',            key: 'notes',            required: false, note: '自由記述' },
    ],
  },

  /* ── インフルエンサー案件 ── */
  projects: {
    label: 'インフルエンサー案件',
    table: 'projects',
    fields: [
      { label: '案件名',       key: 'project_name', required: true,  note: '例）〇〇キャンペーン2026' },
      { label: 'クライアント名', key: 'client_name_ref', required: false, note: '会社名で自動マッチング（完全一致）' },
      { label: 'PR商品・サービス', key: 'product_name', required: false, note: '例）北海道スイーツギフト' },
      { label: '説明',         key: 'description',  required: false, note: '自由記述' },
      { label: '開始日',       key: 'start_date',   required: false, note: 'YYYY-MM-DD 例）2026-01-01' },
      { label: '終了日',       key: 'end_date',     required: false, note: 'YYYY-MM-DD 例）2026-03-31' },
      { label: '投稿日',       key: 'post_date',    required: false, note: 'YYYY-MM-DD 例）2026-02-14' },
      { label: '予算',         key: 'budget',       required: false, note: '半角数字 例）300000' },
      { label: 'ステータス',   key: 'status',       required: false, note: '提案中 / 進行中 / 請求中 / 完了 / キャンセル' },
      { label: '担当者',       key: 'manager',      required: false, note: '例）鈴木 一郎' },
      { label: 'メモ',         key: 'notes',        required: false, note: '自由記述' },
    ],
  },

  /* ── サブスク/スポット ── */
  products: {
    label: 'サブスク/スポット',
    table: 'products',
    fields: [
      { label: '区分',           key: 'product_type',  required: true,  note: 'subscription（サブスク）/ spot（スポット）' },
      { label: 'サービス名',     key: 'product_name',  required: true,  note: '例）社外広報部プラン' },
      { label: 'クライアント名', key: 'client_name_ref', required: false, note: '会社名で自動マッチング（完全一致）' },
      { label: '固定費',         key: 'base_cost',     required: false, note: '半角数字 例）100000' },
      { label: '追加費用',       key: 'extra_cost',    required: false, note: '半角数字 例）20000' },
      { label: '合計金額',       key: 'total_amount',  required: false, note: '半角数字（固定費+追加費用）例）120000' },
      { label: '月額費用',       key: 'monthly_fee',   required: false, note: '半角数字（サブスクのみ）例）30000' },
      { label: '開始日',         key: 'start_date',    required: false, note: 'YYYY-MM-DD 例）2026-04-01' },
      { label: '終了日',         key: 'end_date',      required: false, note: 'YYYY-MM-DD 例）2027-03-31' },
      { label: 'ステータス',     key: 'status',        required: false, note: '提案中 / 契約中 / 完了 / キャンセル' },
      { label: '担当者',         key: 'manager',       required: false, note: '例）田中 太郎' },
      { label: 'メモ',           key: 'notes',         required: false, note: '自由記述' },
    ],
  },

  /* ── チケット販売管理 ── */
  tickets: {
    label: 'チケット販売管理',
    table: 'tickets',
    fields: [
      { label: 'チケット番号', key: 'ticket_number', required: false, note: '空欄の場合は自動採番' },
      { label: '件名',         key: 'title',         required: true,  note: '例）〇〇店 グルメチケット' },
      { label: 'クライアント名', key: 'client_name', required: false, note: '例）株式会社〇〇' },
      { label: 'カテゴリ名',   key: 'category_name', required: false, note: '例）グルメ' },
      { label: 'ステータス',   key: 'status',        required: false, note: '提案中 / 進行中 / 請求中 / 完了' },
      { label: '担当者',       key: 'assignee',      required: false, note: '例）山田 花子' },
      { label: '開始日',       key: 'start_date',    required: false, note: 'YYYY-MM-DD 例）2026-04-01' },
      { label: '終了日',       key: 'end_date',      required: false, note: 'YYYY-MM-DD 例）2026-06-30' },
      { label: 'メモ',         key: 'notes',         required: false, note: '自由記述' },
    ],
  },

  /* ── チケット商品管理 ── */
  ticket_products: {
    label: 'チケット商品管理',
    table: 'ticket_products',
    fields: [
      { label: '店舗名',       key: 'store_name',            required: true,  note: '例）〇〇レストラン 渋谷店' },
      { label: '店舗住所',     key: 'store_address',         required: false, note: '例）東京都渋谷区〇〇1-1-1' },
      { label: '店舗電話',     key: 'store_phone',           required: false, note: '例）03-0000-0000' },
      { label: '営業時間',     key: 'store_hours',           required: false, note: '例）11:00〜22:00（月曜定休）' },
      { label: '商品名',       key: 'product_name',          required: true,  note: '例）ランチコース2名様分' },
      { label: '商品詳細',     key: 'product_detail',        required: false, note: '自由記述' },
      { label: '販売価格',     key: 'sale_price',            required: false, note: '半角数字 例）6000' },
      { label: '手数料徴収',   key: 'commission_collection', required: false, note: '会社 / 店舗' },
      { label: '手数料率',     key: 'commissions',           required: false, note: '半角数字（%） 例）10' },
      { label: 'ステータス',   key: 'status',                required: false, note: '販売可 / 販売停止' },
      { label: 'メモ',         key: 'notes',                 required: false, note: '自由記述' },
    ],
  },
};

/* ================================================================
   ユーティリティ
================================================================ */

/** CSV の1セルをエスケープ（カンマ・改行・ダブルクォート含む場合はクォート） */
function csvEscapeCell(val) {
  const s = (val == null) ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** 行配列 → CSV文字列1行 */
function csvRow(arr) {
  return arr.map(csvEscapeCell).join(',');
}

/** UTF-8 BOM付きCSV文字列をダウンロード */
function downloadCsvBom(filename, csvText) {
  const bom  = '\uFEFF';
  const blob = new Blob([bom + csvText], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 日付文字列のフォーマット（今日） */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

/* ================================================================
   CSV フォーマット（テンプレート）ダウンロード
   1行目: ヘッダー（列名）
   2行目: ガイド行（# で始まるため取込時スキップ）
   3行目以降: ユーザーがデータを入力する空行
================================================================ */
function downloadCsvFormat(schemaKey) {
  const schema = CSV_SCHEMAS[schemaKey];
  if (!schema) return;

  const fields  = schema.fields;
  const headers = fields.map(f => f.label + (f.required ? '【必須】' : ''));
  const notes   = fields.map(f => f.note || '');

  // ヘッダー行 + ガイド行（#で始まる）のみ。サンプルデータ行は含めない
  const lines = [
    csvRow(headers),
    csvRow(notes.map(n => '# ' + n)),  // ガイド行（取込時スキップ）
  ];

  downloadCsvBom(
    `${schema.label}_取込フォーマット_${todayStr()}.csv`,
    lines.join('\r\n')
  );
}

/* ================================================================
   CSV 取込モーダルを開く
================================================================ */
function openCsvImportModal(schemaKey) {
  const schema = CSV_SCHEMAS[schemaKey];
  if (!schema) return;

  // モーダル要素取得
  const modal      = document.getElementById('csv-import-modal');
  const overlay    = document.getElementById('csv-modal-overlay');
  const titleEl    = document.getElementById('csv-modal-title');
  const fieldsEl   = document.getElementById('csv-modal-fields');
  const fileInput  = document.getElementById('csv-file-input');
  const previewEl  = document.getElementById('csv-preview-wrap');
  const importBtn  = document.getElementById('csv-import-btn');
  const msgEl      = document.getElementById('csv-import-msg');

  // 状態リセット
  fileInput.value  = '';
  previewEl.innerHTML = '';
  msgEl.innerHTML  = '';
  importBtn.disabled  = true;
  importBtn.innerHTML = '<i class="fas fa-file-import"></i> 取込実行';
  importBtn.dataset.schemaKey = schemaKey;

  // タイトル
  titleEl.textContent = `CSV取込 — ${schema.label}`;

  // フィールド一覧
  fieldsEl.innerHTML = schema.fields.map(f =>
    `<span class="csv-field-tag${f.required ? ' csv-field-required' : ''}">${f.label}</span>`
  ).join('');

  // オーバーレイ＋モーダル表示
  overlay.style.display = 'block';
  modal.classList.add('open');
}

/* ================================================================
   CSVテキスト → 行配列 のパース
   - BOM除去
   - #で始まる行（ガイド行）をスキップ
   - ダブルクォート内の改行・カンマに対応
================================================================ */
function parseCsvText(text) {
  // BOM除去
  text = text.replace(/^\uFEFF/, '');

  const rows = [];
  let cur = '', inQ = false, row = [];

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i+1];

    if (inQ) {
      if (c === '"' && next === '"') { cur += '"'; i++; }
      else if (c === '"')            { inQ = false; }
      else                           { cur += c; }
    } else {
      if      (c === '"')                          { inQ = true; }
      else if (c === ',')                          { row.push(cur); cur = ''; }
      else if (c === '\r' && next === '\n')        { row.push(cur); cur = ''; rows.push(row); row = []; i++; }
      else if (c === '\n' || c === '\r')           { row.push(cur); cur = ''; rows.push(row); row = []; }
      else                                         { cur += c; }
    }
  }
  if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row); }

  // ガイド行 (#で始まる) ・空行をスキップ
  return rows.filter(r => r.length > 0 && !(r[0] || '').trimStart().startsWith('#'));
}

/* ================================================================
   プレビュー生成
================================================================ */
function buildCsvPreview(rows, schema) {
  if (rows.length < 2) return '<p class="csv-preview-empty">データ行がありません。</p>';

  const headers = rows[0];
  const data    = rows.slice(1).filter(r => r.some(c => c.trim() !== ''));
  if (data.length === 0) return '<p class="csv-preview-empty">データ行がありません。</p>';

  const maxCols = Math.max(headers.length, ...data.map(r => r.length));

  let html = `<p class="csv-preview-count">${data.length}件 取込予定</p>`;
  html += '<div class="csv-preview-table-wrap"><table class="csv-preview-table"><thead><tr>';
  html += headers.map(h => `<th>${escHtmlCsv(h)}</th>`).join('');
  html += '</tr></thead><tbody>';

  const previewRows = data.slice(0, 5);
  previewRows.forEach(r => {
    html += '<tr>';
    for (let i = 0; i < maxCols; i++) {
      html += `<td>${escHtmlCsv(r[i] || '')}</td>`;
    }
    html += '</tr>';
  });
  if (data.length > 5) {
    html += `<tr><td colspan="${maxCols}" class="csv-preview-more">… 他 ${data.length - 5} 件</td></tr>`;
  }
  html += '</tbody></table></div>';
  return html;
}

function escHtmlCsv(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ================================================================
   CSV 取込実行
================================================================ */
async function executeCsvImport(schemaKey, rows) {
  const schema = CSV_SCHEMAS[schemaKey];
  if (!schema || rows.length < 2) return { ok: 0, err: 0, errors: [] };

  const headerRow  = rows[0];
  const dataRows   = rows.slice(1).filter(r => r.some(c => c.trim() !== ''));

  // ヘッダー → フィールドキー マッピング
  // ラベルの【必須】を除いて照合
  const colMap = headerRow.map(h => {
    const clean = h.replace(/【必須】/g, '').trim();
    const found = schema.fields.find(f => f.label === clean);
    return found ? found.key : null;
  });

  // クライアント名→IDの解決が必要なテーブル
  let clientMap = {};
  if (['projects', 'products'].includes(schemaKey)) {
    try {
      const res = await fetch('tables/clients?limit=500');
      const d   = await res.json();
      (d.data || []).forEach(c => { clientMap[c.company_name] = c.id; });
    } catch(e) {}
  }

  let ok = 0, errCount = 0;
  const errors = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const record = {};

    colMap.forEach((key, ci) => {
      if (!key) return;
      const val = (row[ci] || '').trim();
      if (val === '') return;

      // client_name_ref → client_id に変換
      if (key === 'client_name_ref') {
        const cid = clientMap[val];
        if (cid) { record['client_id'] = cid; record['client_name'] = val; }
        return;
      }
      // 適格事業者番号：TありでもなしでもT+数字に正規化
      if (key === 'qualified_number') {
        const digits = val.replace(/^[Tt]/, '').replace(/\D/g, '');
        if (digits) record[key] = 'T' + digits;
        return;
      }
      // 数値フィールド
      if (['followers','unit_price','base_cost','extra_cost','total_amount','monthly_fee','budget',
           'sale_price','commissions','sort_order'].includes(key)) {
        const n = Number(val.replace(/[,，¥￥]/g, ''));
        if (!isNaN(n)) record[key] = n;
        return;
      }
      record[key] = val;
    });

    // 必須チェック
    const missingRequired = schema.fields
      .filter(f => f.required && f.key !== 'client_name_ref')
      .filter(f => !record[f.key]);
    if (missingRequired.length > 0) {
      errors.push(`行${i+2}: 必須項目「${missingRequired.map(f=>f.label).join('・')}」が空です`);
      errCount++;
      continue;
    }

    try {
      const res = await fetch(`tables/${schema.table}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
      if (res.ok || res.status === 201) { ok++; }
      else {
        const msg = await res.text().catch(() => res.status);
        errors.push(`行${i+2}: 登録失敗 (${msg})`);
        errCount++;
      }
    } catch(e) {
      errors.push(`行${i+2}: 通信エラー (${e.message})`);
      errCount++;
    }
  }

  return { ok, err: errCount, errors };
}

/* ================================================================
   モーダルイベント初期化（DOMContentLoaded 後に1回呼ぶ）
================================================================ */
function initCsvModal() {
  const modal     = document.getElementById('csv-import-modal');
  const overlay   = document.getElementById('csv-modal-overlay');
  const closeBtn  = document.getElementById('csv-modal-close');
  const fileInput = document.getElementById('csv-file-input');
  const dropArea  = document.getElementById('csv-drop-area');
  const importBtn = document.getElementById('csv-import-btn');
  const previewEl = document.getElementById('csv-preview-wrap');
  const msgEl     = document.getElementById('csv-import-msg');

  function closeModal() {
    modal.classList.remove('open');
    overlay.style.display = 'none';
  }

  // モーダルが開かれるたびにドロップファイルをリセット（MutationObserverで監視）
  if (modal) {
    new MutationObserver(mutations => {
      mutations.forEach(m => {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          if (modal.classList.contains('open')) {
            _droppedFile = null;
            dragCounter  = 0;
            dropArea.classList.remove('drag-over');
          }
        }
      });
    }).observe(modal, { attributes: true });
  }

  overlay.addEventListener('click', closeModal);
  closeBtn.addEventListener('click', closeModal);

  // Esc キー
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });

  // ドラッグ&ドロップ
  let dragCounter = 0; // 子要素に入るたびにdragleaveが発火する問題を回避
  let _droppedFile = null; // ドロップされたファイルを保持

  dropArea.addEventListener('dragenter', e => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    dropArea.classList.add('drag-over');
  });
  dropArea.addEventListener('dragover', e => {
    e.preventDefault();
    e.stopPropagation();
    // dragoverでpreventDefaultしないとdropが発火しない
    e.dataTransfer.dropEffect = 'copy';
  });
  dropArea.addEventListener('dragleave', e => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dropArea.classList.remove('drag-over');
    }
  });
  dropArea.addEventListener('drop', e => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    dropArea.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.name.match(/\.(csv|txt)$/i)) {
      msgEl.innerHTML = '<span class="csv-msg-err">CSVファイル（.csv / .txt）をドロップしてください。</span>';
      return;
    }
    _droppedFile = file;
    loadCsvFile(file);
  });

  // ファイル読み込み共通処理
  function loadCsvFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      const schemaKey = importBtn.dataset.schemaKey;
      const schema    = CSV_SCHEMAS[schemaKey];
      const rows      = parseCsvText(e.target.result);
      previewEl.innerHTML = buildCsvPreview(rows, schema);
      importBtn.disabled  = false;
      msgEl.innerHTML = '';
    };
    reader.readAsText(file, 'UTF-8');
  }

  // ファイル選択 → プレビュー
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    _droppedFile = null; // ファイル選択時はドロップファイルをクリア
    loadCsvFile(file);
  });

  // 取込実行
  importBtn.addEventListener('click', async () => {
    // ドロップファイル優先、なければfileInputのファイルを使用
    const file = _droppedFile || fileInput.files[0];
    if (!file) { msgEl.innerHTML = '<span class="csv-msg-err">ファイルを選択してください。</span>'; return; }
    const schemaKey = importBtn.dataset.schemaKey;

    importBtn.disabled  = true;
    importBtn.textContent = '取込中...';
    msgEl.innerHTML = '';

    const reader = new FileReader();
    reader.onload = async ev => {
      const rows   = parseCsvText(ev.target.result);
      const result = await executeCsvImport(schemaKey, rows);

      importBtn.disabled  = false;
      importBtn.innerHTML = '<i class="fas fa-file-import"></i> 取込実行';

      let html = '';
      if (result.ok > 0) {
        html += `<span class="csv-msg-ok"><i class="fas fa-check-circle"></i> ${result.ok}件 登録しました。</span>`;
      }
      if (result.err > 0) {
        html += `<span class="csv-msg-err"><i class="fas fa-exclamation-circle"></i> ${result.err}件 エラー。</span>`;
        html += '<ul class="csv-err-list">' + result.errors.map(e => `<li>${escHtmlCsv(e)}</li>`).join('') + '</ul>';
      }
      msgEl.innerHTML = html;

      // 成功件数があればページをリロード
      if (result.ok > 0) {
        setTimeout(() => {
          closeModal();
          // 対応するload関数を呼ぶ
          const reloadMap = {
            clients:         () => typeof loadClients         === 'function' && loadClients(),
            influencers:     () => typeof loadInfluencers     === 'function' && loadInfluencers(),
            projects:        () => typeof loadProjects        === 'function' && loadProjects(),
            products:        () => typeof loadProducts        === 'function' && loadProducts(),
            tickets:         () => typeof loadTickets         === 'function' && loadTickets(),
            ticket_products: () => typeof loadTicketProducts  === 'function' && loadTicketProducts(),
          };
          if (reloadMap[schemaKey]) reloadMap[schemaKey]();
        }, 1800);
      }
    };
    reader.readAsText(file, 'UTF-8');
  });
}
