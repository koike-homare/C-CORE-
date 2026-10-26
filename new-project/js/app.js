/* ============================================================
   C-CORE スタンドアロン版 — タスク管理 & 企業情報
   ============================================================ */

'use strict';

// ===== セッションキー =====
const SESSION_KEY = 'ccore_task_session';

// ===== APIヘルパー =====
const API = {
  async get(table, params = {}) {
    const qs = new URLSearchParams({ limit: 500, ...params }).toString();
    const res = await fetch(`tables/${table}?${qs}`);
    if (!res.ok) throw new Error(`GET ${table} failed: ${res.status}`);
    return res.json();
  },
  async getAll(table, params = {}) {
    let page = 1, all = [];
    const limit = 500;
    while (true) {
      const qs = new URLSearchParams({ ...params, limit, page }).toString();
      const res = await fetch(`tables/${table}?${qs}`);
      if (!res.ok) throw new Error(`GET ${table} failed: ${res.status}`);
      const d = await res.json();
      const rows = d.data || [];
      all = all.concat(rows);
      if (all.length >= (d.total || 0) || rows.length === 0) break;
      page++;
    }
    return { data: all, total: all.length };
  },
  async getOne(table, id) {
    const res = await fetch(`tables/${table}/${id}`);
    if (!res.ok) throw new Error(`GET ${table}/${id} failed`);
    return res.json();
  },
  async post(table, data) {
    const res = await fetch(`tables/${table}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`POST ${table} failed`);
    return res.json();
  },
  async put(table, id, data) {
    const res = await fetch(`tables/${table}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`PUT ${table}/${id} failed`);
    return res.json();
  },
  async delete(table, id) {
    const res = await fetch(`tables/${table}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`DELETE ${table}/${id} failed`);
  },
  async patch(table, id, data) {
    const res = await fetch(`tables/${table}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`PATCH ${table}/${id} failed`);
    return res.json();
  }
};

// ===== グローバルキャッシュ =====
const Cache = {
  _data: {},
  _ts: {},
  TTL: 30000,
  async get(key, fetchFn) {
    const now = Date.now();
    if (this._data[key] && (now - (this._ts[key] || 0)) < this.TTL) return this._data[key];
    this._data[key] = await fetchFn();
    this._ts[key] = now;
    return this._data[key];
  },
  invalidate(...keys) {
    keys.forEach(k => { this._data[k] = null; this._ts[k] = 0; });
  }
};

// ===== ユーティリティ =====
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escHtmlNl(str) {
  return escHtml(str).replace(/\n/g, '<br>');
}

function formatDate(str) {
  if (!str) return '—';
  return str.replace(/-/g, '/');
}

function formatMoney(val) {
  if (val == null || val === '') return '—';
  return '¥' + Number(val).toLocaleString();
}

function showToast(message, type = 'success') {
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastIn .3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ===== ページナビゲーション =====
const pages = ['tasks', 'company'];
const pageTitles = {
  tasks:   'タスク管理',
  company: '企業情報',
};
const addBtnLabels = {
  tasks: 'タスクを追加',
};

let currentPage = 'tasks';

function navigateTo(page) {
  currentPage = page;
  pages.forEach(p => {
    const el = document.getElementById(`page-${p}`);
    if (el) el.classList.toggle('active', p === page);
  });
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });
  const titleEl = document.getElementById('headerTitle');
  if (titleEl) titleEl.textContent = pageTitles[page] || page;

  const addBtn = document.getElementById('headerAddBtn');
  if (addBtn) {
    if (addBtnLabels[page]) {
      addBtn.style.display = '';
      const labelEl = document.getElementById('headerAddBtnText');
      if (labelEl) labelEl.textContent = addBtnLabels[page];
    } else {
      addBtn.style.display = 'none';
    }
  }

  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('open');

  if (page === 'tasks')   loadTasks();
  if (page === 'company') loadCompanyInfo();
}

// ナビアイテムクリック
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(item.dataset.page);
  });
});

// サイドバートグル
document.getElementById('sidebarToggle')?.addEventListener('click', () => {
  document.getElementById('sidebar')?.classList.toggle('open');
});

// ヘッダー追加ボタン
document.getElementById('headerAddBtn')?.addEventListener('click', () => {
  if (currentPage === 'tasks') openTaskModal();
});

// ログアウト
document.getElementById('btn-logout')?.addEventListener('click', () => {
  if (!confirm('ログアウトしますか？')) return;
  sessionStorage.removeItem(SESSION_KEY);
  location.replace('login.html');
});

// モーダルの閉じるボタン・オーバーレイクリック
document.querySelectorAll('[data-modal]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.modal));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

/* ============================================================
   企業情報
   ============================================================ */

let companyInfoRecord = null;

async function loadCompanyInfo() {
  try {
    const res = await API.get('company_info', { limit: 1 });
    companyInfoRecord = (res.data && res.data.length > 0) ? res.data[0] : null;
  } catch(e) {
    companyInfoRecord = null;
  }
  renderCompanyView();
  loadAccounts();
}

function renderCompanyView() {
  const d = companyInfoRecord || {};

  setText('cv-name',           d.company_name       || '—');
  setText('cv-name-kana',      d.company_name_kana  || '—');
  setText('cv-postal',         d.postal_code ? `〒${d.postal_code}` : '—');
  setText('cv-address',        d.address            || '—');
  setText('cv-phone',          d.phone              || '—');
  setText('cv-fax',            d.fax                || '—');
  setText('cv-email',          d.email              || '—');

  const websiteEl = document.getElementById('cv-website');
  if (websiteEl) {
    if (d.website) {
      websiteEl.innerHTML = `<a href="${escHtml(d.website)}" target="_blank" rel="noopener">${escHtml(d.website)}</a>`;
    } else {
      websiteEl.textContent = '—';
    }
  }
  setText('cv-representative', d.representative || '—');

  setText('cv-bank-name',   d.bank_name ? `${d.bank_name} ${d.bank_branch||''}`.trim() : '—');
  setText('cv-bank-branch', d.bank_branch || '—');
  setText('cv-bank-type',   d.bank_type   || '—');
  setText('cv-bank-number', d.bank_number || '—');
  setText('cv-bank-holder', d.bank_holder || '—');

  setText('cv-qualified-number', d.qualified_number ? `T${d.qualified_number}` : '—');

  const par = (d.profit_alert_rate !== undefined && d.profit_alert_rate !== null && d.profit_alert_rate !== '')
    ? `${Number(d.profit_alert_rate)}%` : '—（無効）';
  setText('cv-profit-alert-rate', par);

  updateLogoPreview(d.logo_data || '');

  const fm = d.fiscal_month ? Number(d.fiscal_month) : 1;
  const fmEnd = fm === 1 ? 12 : fm - 1;
  const fmLabel = fm === 1
    ? '1月始まり（1月〜12月）'
    : `${fm}月始まり（${fm}月〜翌${fmEnd}月）`;
  setText('cv-fiscal-month', fmLabel);

  showCompanyViewMode('basic');
  showCompanyViewMode('bank');
  showCompanyViewMode('invoice');
  showCompanyViewMode('profit');
  showCompanyViewMode('fiscal');
  renderPwView();
}

function updateLogoPreview(dataUrl) {
  const img    = document.getElementById('company-logo-img');
  const ph     = document.getElementById('company-logo-placeholder');
  const delBtn = document.getElementById('btn-company-logo-delete');
  if (!img) return;
  if (dataUrl) {
    img.src = dataUrl; img.style.display = '';
    if (ph)     ph.style.display = 'none';
    if (delBtn) delBtn.style.display = '';
  } else {
    img.src = ''; img.style.display = 'none';
    if (ph)     ph.style.display = '';
    if (delBtn) delBtn.style.display = 'none';
  }
}

function showCompanyViewMode(section) {
  const map = {
    basic:   ['company-view-mode',         'company-edit-mode'],
    bank:    ['company-bank-view-mode',     'company-bank-edit-mode'],
    invoice: ['company-invoice-view-mode',  'company-invoice-edit-mode'],
    profit:  ['company-profit-view-mode',   'company-profit-edit-mode'],
    fiscal:  ['company-fiscal-view-mode',   'company-fiscal-edit-mode'],
  };
  const ids = map[section];
  if (!ids) return;
  const view = document.getElementById(ids[0]);
  const edit = document.getElementById(ids[1]);
  if (view) view.style.display = '';
  if (edit) edit.style.display = 'none';
}

function showCompanyEditMode(section) {
  const d = companyInfoRecord || {};
  if (section === 'profit') {
    const v = document.getElementById('company-profit-view-mode');
    const e = document.getElementById('company-profit-edit-mode');
    if (v) v.style.display = 'none';
    if (e) e.style.display = '';
    const val = (d.profit_alert_rate != null && d.profit_alert_rate !== '') ? Number(d.profit_alert_rate) : '';
    const inp = document.getElementById('ci-profit-alert-rate');
    if (inp) inp.value = val;
  } else if (section === 'basic') {
    const v = document.getElementById('company-view-mode');
    const e = document.getElementById('company-edit-mode');
    if (v) v.style.display = 'none';
    if (e) e.style.display = '';
    ['name','name-kana','postal','address','phone','fax','email','website','representative'].forEach(k => {
      const field = k === 'name-kana' ? 'company_name_kana' : k === 'name' ? 'company_name'
        : k === 'postal' ? 'postal_code' : k;
      const el = document.getElementById('ci-' + k);
      if (el) el.value = d[field] || '';
    });
  } else if (section === 'bank') {
    const v = document.getElementById('company-bank-view-mode');
    const e = document.getElementById('company-bank-edit-mode');
    if (v) v.style.display = 'none';
    if (e) e.style.display = '';
    ['bank-name','bank-branch','bank-type','bank-number','bank-holder'].forEach(k => {
      const el = document.getElementById('ci-' + k);
      if (el) el.value = d[k.replace('-','_')] || '';
    });
  } else if (section === 'invoice') {
    const v = document.getElementById('company-invoice-view-mode');
    const e = document.getElementById('company-invoice-edit-mode');
    if (v) v.style.display = 'none';
    if (e) e.style.display = '';
    const qn = document.getElementById('ci-qualified-number');
    if (qn) qn.value = (d.qualified_number || '').replace(/^T/, '');
    const notes = document.getElementById('ci-notes');
    if (notes) notes.value = d.notes || '';
  } else if (section === 'fiscal') {
    const v = document.getElementById('company-fiscal-view-mode');
    const e = document.getElementById('company-fiscal-edit-mode');
    if (v) v.style.display = 'none';
    if (e) e.style.display = '';
    const sel = document.getElementById('ci-fiscal-month');
    if (sel) sel.value = d.fiscal_month ? String(d.fiscal_month) : '1';
  }
}

async function saveCompanyInfo(patch) {
  try {
    let updated;
    if (companyInfoRecord?.id) {
      updated = await API.patch('company_info', companyInfoRecord.id, patch);
    } else {
      updated = await API.post('company_info', patch);
    }
    companyInfoRecord = updated?.data ?? updated;
    renderCompanyView();
    showToast('企業情報を保存しました', 'success');
  } catch(e) {
    console.error(e);
    showToast('保存に失敗しました', 'error');
  }
}

async function getCompanyInfo() {
  if (!companyInfoRecord) {
    try {
      const res = await API.get('company_info', { limit: 1 });
      companyInfoRecord = (res.data && res.data.length > 0) ? res.data[0] : null;
    } catch(e) { companyInfoRecord = null; }
  }
  return companyInfoRecord || {};
}

// ── 企業情報イベントバインド ──
document.getElementById('btn-company-edit')?.addEventListener('click', () => showCompanyEditMode('basic'));
document.getElementById('btn-company-cancel')?.addEventListener('click', () => showCompanyViewMode('basic'));
document.getElementById('btn-company-save')?.addEventListener('click', async () => {
  const patch = {
    company_name:      document.getElementById('ci-name')?.value.trim() || '',
    company_name_kana: document.getElementById('ci-name-kana')?.value.trim() || '',
    postal_code:       document.getElementById('ci-postal')?.value.trim() || '',
    address:           document.getElementById('ci-address')?.value.trim() || '',
    phone:             document.getElementById('ci-phone')?.value.trim() || '',
    fax:               document.getElementById('ci-fax')?.value.trim() || '',
    email:             document.getElementById('ci-email')?.value.trim() || '',
    website:           document.getElementById('ci-website')?.value.trim() || '',
    representative:    document.getElementById('ci-representative')?.value.trim() || '',
  };
  if (!patch.company_name) { showToast('会社名は必須です', 'error'); return; }
  await saveCompanyInfo(patch);
});

document.getElementById('btn-company-bank-edit')?.addEventListener('click', () => showCompanyEditMode('bank'));
document.getElementById('btn-company-bank-cancel')?.addEventListener('click', () => showCompanyViewMode('bank'));
document.getElementById('btn-company-bank-save')?.addEventListener('click', async () => {
  await saveCompanyInfo({
    bank_name:   document.getElementById('ci-bank-name')?.value.trim() || '',
    bank_branch: document.getElementById('ci-bank-branch')?.value.trim() || '',
    bank_type:   document.getElementById('ci-bank-type')?.value || '',
    bank_number: document.getElementById('ci-bank-number')?.value.trim() || '',
    bank_holder: document.getElementById('ci-bank-holder')?.value.trim() || '',
  });
});

document.getElementById('btn-company-invoice-edit')?.addEventListener('click', () => showCompanyEditMode('invoice'));
document.getElementById('btn-company-invoice-cancel')?.addEventListener('click', () => showCompanyViewMode('invoice'));
document.getElementById('btn-company-invoice-save')?.addEventListener('click', async () => {
  await saveCompanyInfo({
    qualified_number: (document.getElementById('ci-qualified-number')?.value || '').replace(/^T/, '').trim(),
    notes:            document.getElementById('ci-notes')?.value.trim() || '',
  });
});

document.getElementById('btn-company-profit-edit')?.addEventListener('click', () => showCompanyEditMode('profit'));
document.getElementById('btn-company-profit-cancel')?.addEventListener('click', () => showCompanyViewMode('profit'));
document.getElementById('btn-company-profit-save')?.addEventListener('click', async () => {
  const raw = document.getElementById('ci-profit-alert-rate')?.value.trim() || '';
  let rate = null;
  if (raw !== '') {
    rate = parseFloat(raw);
    if (isNaN(rate) || rate < 0 || rate > 100) { showToast('利益率は0〜100の数値で入力してください', 'error'); return; }
  }
  await saveCompanyInfo({ profit_alert_rate: rate });
});

document.getElementById('btn-company-fiscal-edit')?.addEventListener('click', () => showCompanyEditMode('fiscal'));
document.getElementById('btn-company-fiscal-cancel')?.addEventListener('click', () => showCompanyViewMode('fiscal'));
document.getElementById('btn-company-fiscal-save')?.addEventListener('click', async () => {
  const sel = document.getElementById('ci-fiscal-month');
  const month = sel ? parseInt(sel.value, 10) : 1;
  await saveCompanyInfo({ fiscal_month: month });
});

// ── ロゴ ──
document.getElementById('company-logo-input')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  try {
    const base64 = await _resizeImageToBase64(file, { maxPx: 800, quality: 0.9, maxBytes: 200 * 1024 });
    updateLogoPreview(base64);
    await saveCompanyInfo({ logo_data: base64 });
  } catch(err) {
    showToast(err.message, 'error');
  }
});

document.getElementById('btn-company-logo-delete')?.addEventListener('click', async () => {
  if (!confirm('ロゴを削除してもよいですか？')) return;
  updateLogoPreview('');
  await saveCompanyInfo({ logo_data: '' });
});

// ── 画像リサイズヘルパー ──
function _resizeImageToBase64(file, { maxPx = 1200, quality = 0.82, maxBytes = 350 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('画像ファイルを選択してください')); return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxPx || height > maxPx) {
          if (width >= height) { height = Math.round(height * maxPx / width); width = maxPx; }
          else { width = Math.round(width * maxPx / height); height = maxPx; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        const needsBg = (file.type === 'image/png' || file.type === 'image/gif');
        let outCanvas = canvas;
        if (needsBg) {
          const bg = document.createElement('canvas');
          bg.width = width; bg.height = height;
          const bctx = bg.getContext('2d');
          bctx.fillStyle = '#ffffff'; bctx.fillRect(0, 0, width, height);
          bctx.drawImage(canvas, 0, 0);
          outCanvas = bg;
        }
        let q = quality;
        let b64 = outCanvas.toDataURL('image/jpeg', q);
        while (b64.length * 0.75 > maxBytes && q > 0.15) {
          q = Math.max(q - 0.07, 0.15);
          b64 = outCanvas.toDataURL('image/jpeg', q);
        }
        resolve(b64);
      };
      img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
      img.src = ev.target.result;
    };
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
    reader.readAsDataURL(file);
  });
}

// ===== パスワード管理 =====
function renderPwView() {
  const d = companyInfoRecord || {};

  const masterEl  = document.getElementById('cv-master-pw');
  const masterBtn = document.getElementById('btn-toggle-master-pw');
  if (masterEl) {
    if (d.master_password) {
      masterEl.textContent = '●●●●●●●●';
      masterEl.classList.remove('is-unset');
      masterEl.dataset.pw = d.master_password;
      masterEl.dataset.masked = 'true';
      if (masterBtn) masterBtn.style.display = '';
    } else {
      masterEl.textContent = '未設定';
      masterEl.classList.add('is-unset');
      masterEl.dataset.pw = '';
      if (masterBtn) masterBtn.style.display = 'none';
    }
  }

  const loginEl  = document.getElementById('cv-login-pw');
  const loginBtn = document.getElementById('btn-toggle-login-pw');
  if (loginEl) {
    if (d.login_password) {
      loginEl.textContent = '●●●●●●●●';
      loginEl.classList.remove('is-unset');
      loginEl.dataset.pw = d.login_password;
      loginEl.dataset.masked = 'true';
      if (loginBtn) loginBtn.style.display = '';
    } else {
      loginEl.textContent = '未設定';
      loginEl.classList.add('is-unset');
      loginEl.dataset.pw = '';
      if (loginBtn) loginBtn.style.display = 'none';
    }
  }
}

function togglePwVisibility(spanId, iconId) {
  const span = document.getElementById(spanId);
  const icon = document.getElementById(iconId);
  if (!span || !span.dataset.pw) return;
  if (span.dataset.masked === 'true') {
    span.textContent = span.dataset.pw;
    span.dataset.masked = 'false';
    if (icon) { icon.classList.remove('fa-eye'); icon.classList.add('fa-eye-slash'); }
  } else {
    span.textContent = '●●●●●●●●';
    span.dataset.masked = 'true';
    if (icon) { icon.classList.remove('fa-eye-slash'); icon.classList.add('fa-eye'); }
  }
}

// ── パスワード編集モーダル ──
let _pwEditTarget = null;
document.getElementById('btn-master-pw-edit')?.addEventListener('click', () => {
  _pwEditTarget = 'master_password';
  document.getElementById('pw-edit-label').textContent = 'マスターパスワード';
  document.getElementById('pw-edit-input').value = companyInfoRecord?.master_password || '';
  document.getElementById('modal-pw-edit').classList.add('open');
});
document.getElementById('btn-login-pw-edit')?.addEventListener('click', () => {
  _pwEditTarget = 'login_password';
  document.getElementById('pw-edit-label').textContent = 'ログインパスワード';
  document.getElementById('pw-edit-input').value = companyInfoRecord?.login_password || '';
  document.getElementById('modal-pw-edit').classList.add('open');
});
document.getElementById('btn-pw-edit-save')?.addEventListener('click', async () => {
  if (!_pwEditTarget) return;
  const val = document.getElementById('pw-edit-input')?.value.trim() || '';
  await saveCompanyInfo({ [_pwEditTarget]: val });
  document.getElementById('modal-pw-edit').classList.remove('open');
});
document.getElementById('btn-pw-edit-cancel')?.addEventListener('click', () => {
  document.getElementById('modal-pw-edit')?.classList.remove('open');
});
document.getElementById('btn-toggle-master-pw')?.addEventListener('click', () => {
  togglePwVisibility('cv-master-pw', 'icon-toggle-master-pw');
});
document.getElementById('btn-toggle-login-pw')?.addEventListener('click', () => {
  togglePwVisibility('cv-login-pw', 'icon-toggle-login-pw');
});

/* ============================================================
   アカウント管理
   ============================================================ */

let _allAccounts = [];

function _activeAccounts() {
  return _allAccounts.filter(a => !a.is_deleted);
}

async function loadAccounts() {
  try {
    const res = await API.get('accounts', { limit: 200, sort: 'created_at' });
    _allAccounts = res.data || [];
    renderAccountTable();
  } catch(e) {
    console.error('loadAccounts error:', e);
  }
}

function renderAccountTable() {
  const tbody = document.getElementById('account-table-body');
  if (!tbody) return;

  const visible = _activeAccounts();

  if (visible.length === 0) {
    tbody.innerHTML = `
      <tr id="account-empty-row">
        <td colspan="5">
          <div class="account-empty">
            <i class="fas fa-user-slash"></i>
            <span>アカウントが登録されていません</span>
          </div>
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = visible.map(acc => {
    const initials  = (acc.name || '?').trim().charAt(0).toUpperCase();
    const posLabel  = acc.position ? `<span class="account-position-badge">${escHtml(acc.position)}</span>` : '';
    const limitLabel = acc.daily_hour_limit != null
      ? `<span class="account-limit-badge"><i class="fas fa-clock"></i> ${acc.daily_hour_limit}h</span>`
      : '';
    const jurTags = Array.isArray(acc.jurisdiction) ? acc.jurisdiction
                  : (acc.jurisdiction ? (() => { try { return JSON.parse(acc.jurisdiction); } catch { return []; } })() : []);
    const jurCell = jurTags.length
      ? jurTags.map(j => `<span class="account-jur-badge">${escHtml(j)}</span>`).join('')
      : '<span class="acct-unset-label">—</span>';

    return `<tr>
      <td>
        <div class="account-name-cell">
          <div class="account-avatar">${escHtml(initials)}</div>
          <div>
            <span class="account-name-text">${escHtml(acc.name || '—')}</span>
            ${posLabel}
          </div>
        </div>
      </td>
      <td class="account-info-cell">${limitLabel}</td>
      <td class="acct-td-jur">${jurCell}</td>
      <td class="account-action-cell">
        <button class="btn-account-edit" onclick="openAccountModal('${acc.id}')">
          <i class="fas fa-edit"></i> 編集
        </button>
      </td>
      <td class="account-action-cell">
        <button class="btn-account-row-delete" onclick="deleteAccountRow('${acc.id}','${escHtml(acc.name || '')}')" title="削除">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    </tr>`;
  }).join('');
}

function _renderJurTags(tags) {
  const listEl = document.getElementById('jur-tag-list');
  if (!listEl) return;
  listEl.innerHTML = tags.map((t, i) =>
    `<span class="jur-tag">
      ${escHtml(t)}
      <button type="button" class="jur-tag-del" data-idx="${i}" title="削除">×</button>
    </span>`
  ).join('');
  listEl.querySelectorAll('.jur-tag-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const hidden = document.getElementById('account-jurisdiction');
      const cur = _jurTagsFromHidden();
      cur.splice(idx, 1);
      if (hidden) hidden.value = JSON.stringify(cur);
      _renderJurTags(cur);
    });
  });
}

function _jurTagsFromHidden() {
  try {
    const v = document.getElementById('account-jurisdiction')?.value || '[]';
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function _initJurTagInput() {
  const inp    = document.getElementById('jur-tag-input');
  const hidden = document.getElementById('account-jurisdiction');
  if (!inp || !hidden) return;
  const newInp = inp.cloneNode(true);
  inp.parentNode.replaceChild(newInp, inp);
  newInp.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = newInp.value.trim().replace(/,/g, '');
      if (!val) return;
      const cur = _jurTagsFromHidden();
      if (!cur.includes(val)) {
        cur.push(val);
        hidden.value = JSON.stringify(cur);
        _renderJurTags(cur);
      }
      newInp.value = '';
    }
    if (e.key === 'Backspace' && newInp.value === '') {
      const cur = _jurTagsFromHidden();
      if (cur.length) { cur.pop(); hidden.value = JSON.stringify(cur); _renderJurTags(cur); }
    }
  });
}

function openAccountModal(id = null) {
  const modal    = document.getElementById('modal-account');
  const title    = document.getElementById('modal-account-title');
  const editId   = document.getElementById('account-edit-id');
  const nameEl   = document.getElementById('account-name');
  const posEl    = document.getElementById('account-position');
  const limitEl  = document.getElementById('account-hour-limit');
  const delBtn   = document.getElementById('btn-account-delete');
  if (!modal) return;

  if (id) {
    const acc = _allAccounts.find(a => a.id === id);
    if (!acc) return;
    if (title) title.innerHTML = '<i class="fas fa-user-edit" style="color:var(--primary);"></i> アカウントを編集';
    if (editId) editId.value = acc.id;
    if (nameEl)  nameEl.value  = acc.name || '';
    if (posEl)   posEl.value   = acc.position  || '';
    if (limitEl) limitEl.value = acc.daily_hour_limit != null ? acc.daily_hour_limit : '';
    const jurHidden = document.getElementById('account-jurisdiction');
    const jurTags   = Array.isArray(acc.jurisdiction) ? acc.jurisdiction
                    : (acc.jurisdiction ? (() => { try { return JSON.parse(acc.jurisdiction); } catch { return []; } })() : []);
    if (jurHidden) jurHidden.value = JSON.stringify(jurTags);
    _renderJurTags(jurTags);
    if (delBtn) delBtn.style.display = 'inline-flex';
  } else {
    if (title) title.innerHTML = '<i class="fas fa-user-plus" style="color:var(--primary);"></i> アカウントを追加';
    if (editId) editId.value = '';
    if (nameEl)  nameEl.value  = '';
    if (posEl)   posEl.value   = '';
    if (limitEl) limitEl.value = '';
    const jurHidden = document.getElementById('account-jurisdiction');
    if (jurHidden) jurHidden.value = '[]';
    _renderJurTags([]);
    if (delBtn) delBtn.style.display = 'none';
  }
  _initJurTagInput();
  modal.classList.add('open');
  if (nameEl) nameEl.focus();
}

document.getElementById('btn-account-save')?.addEventListener('click', async () => {
  const id           = document.getElementById('account-edit-id')?.value.trim() || '';
  const name         = document.getElementById('account-name')?.value.trim() || '';
  const position     = document.getElementById('account-position')?.value.trim() || null;
  const limitRaw     = document.getElementById('account-hour-limit')?.value.trim() || '';
  const daily_hour_limit = limitRaw !== '' ? parseFloat(limitRaw) : null;
  const jurisdiction = _jurTagsFromHidden();

  if (!name) { showToast('氏名を入力してください', 'error'); return; }
  if (daily_hour_limit !== null && (isNaN(daily_hour_limit) || daily_hour_limit <= 0)) {
    showToast('想定実動時間は正の数値で入力してください', 'error'); return;
  }
  const payload = { name, position, daily_hour_limit, jurisdiction };
  try {
    if (id) {
      await API.patch('accounts', id, payload);
      showToast('アカウントを更新しました', 'success');
    } else {
      await API.post('accounts', payload);
      showToast('アカウントを登録しました', 'success');
    }
    document.getElementById('modal-account')?.classList.remove('open');
    await loadAccounts();
  } catch(e) { showToast('保存に失敗しました', 'error'); }
});

document.getElementById('btn-account-delete')?.addEventListener('click', async () => {
  const id   = document.getElementById('account-edit-id')?.value.trim() || '';
  const name = document.getElementById('account-name')?.value.trim() || '';
  if (!id) return;
  if (!confirm(`「${name}」を削除してよろしいですか？`)) return;
  try {
    await API.patch('accounts', id, { is_deleted: true });
    showToast(`「${name}」を削除しました`, 'success');
    document.getElementById('modal-account')?.classList.remove('open');
    await loadAccounts();
  } catch(e) { showToast('削除に失敗しました', 'error'); }
});

async function deleteAccountRow(id, name) {
  if (!confirm(`「${name}」を削除してよろしいですか？`)) return;
  try {
    await API.patch('accounts', id, { is_deleted: true });
    showToast(`「${name}」を削除しました`, 'success');
    await loadAccounts();
  } catch(e) { showToast('削除に失敗しました', 'error'); }
}

document.getElementById('btn-account-add')?.addEventListener('click', () => openAccountModal());

/* ============================================================
   クイックリンク機能
   ============================================================ */

let _qlLinks     = [];
let _qlInited    = false;
let _qlBarInited = false;

async function loadQuickLinks() {
  try {
    const res = await API.get('quick_links', { limit: 200, sort: 'sort_order' });
    _qlLinks = (res.data || []).filter(l => !l.is_deleted)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  } catch(e) {
    _qlLinks = [];
  }
  _renderQlBar();
}

function _renderQlBar() {
  const listEl = document.getElementById('ql-btn-list');
  if (!listEl) return;

  if (!_qlLinks.length) {
    listEl.innerHTML = '<span class="ql-empty-hint">リンクがありません（⚙ボタンで追加）</span>';
  } else {
    listEl.innerHTML = _qlLinks.map(l => {
      const col   = escHtml(l.color || '#6366f1');
      const icon  = escHtml(l.icon  || 'fas fa-link');
      const label = escHtml(l.label || '');
      const url   = escHtml(l.url   || '#');
      return `<button class="ql-link-btn" style="--ql-color:${col};" data-url="${url}" title="${label}">
                <i class="${icon} ql-link-icon"></i>
                <span class="ql-link-label">${label}</span>
              </button>`;
    }).join('');
    listEl.querySelectorAll('.ql-link-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        let url = btn.dataset.url || '';
        if (!url || url === '#') return;
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        window.open(url, '_blank', 'noopener,noreferrer');
      });
    });
  }

  if (!_qlBarInited) {
    _qlBarInited = true;
    document.getElementById('ql-manage-btn')?.addEventListener('click', () => _openQlModal());
  }
}

function _openQlModal() {
  _renderQlList();
  _initQlModalEvents();
  document.getElementById('modal-ql')?.classList.add('open');
}

function _initQlModalEvents() {
  if (_qlInited) return;
  _qlInited = true;

  document.querySelectorAll('#ql-color-presets .ql-color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      document.querySelectorAll('#ql-color-presets .ql-color-dot').forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
      const col = dot.dataset.color;
      const hiddenEl = document.getElementById('ql-inp-color');
      if (hiddenEl) hiddenEl.value = col;
      _updateQlPreview();
    });
  });
  document.querySelector('#ql-color-presets .ql-color-dot')?.classList.add('selected');

  ['ql-inp-label','ql-inp-icon'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', _updateQlPreview);
  });
  document.getElementById('ql-btn-add')?.addEventListener('click', _addQlLink);
  ['ql-inp-label','ql-inp-url','ql-inp-icon'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); _addQlLink(); }
    });
  });
}

function _updateQlPreview() {
  const label = document.getElementById('ql-inp-label')?.value || 'ラベル';
  const icon  = document.getElementById('ql-inp-icon')?.value  || 'fas fa-link';
  const color = document.getElementById('ql-inp-color')?.value || '#6366f1';
  const prev  = document.getElementById('ql-preview-btn');
  if (!prev) return;
  prev.style.setProperty('--ql-color', color);
  const iconEl  = prev.querySelector('.ql-link-icon');
  const labelEl = prev.querySelector('.ql-link-label');
  if (iconEl)  iconEl.className = `${icon} ql-link-icon`;
  if (labelEl) labelEl.textContent = label || 'ラベル';
}

async function _addQlLink() {
  const label = document.getElementById('ql-inp-label')?.value.trim() || '';
  const url   = document.getElementById('ql-inp-url')?.value.trim()   || '';
  const icon  = document.getElementById('ql-inp-icon')?.value.trim()  || 'fas fa-link';
  const color = document.getElementById('ql-inp-color')?.value        || '#6366f1';
  if (!label) { showToast('ラベルを入力してください', 'error'); return; }
  if (!url)   { showToast('URLを入力してください', 'error'); return; }
  const sort_order = _qlLinks.length ? Math.max(..._qlLinks.map(l => l.sort_order || 0)) + 1 : 0;
  const btn = document.getElementById('ql-btn-add');
  if (btn) btn.disabled = true;
  try {
    await API.post('quick_links', { label, url, icon, color, sort_order, is_deleted: false });
    showToast(`「${label}」を追加しました`, 'success');
    ['ql-inp-label','ql-inp-url'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const iconEl = document.getElementById('ql-inp-icon');
    if (iconEl) iconEl.value = 'fas fa-link';
    const colorEl = document.getElementById('ql-inp-color');
    if (colorEl) colorEl.value = '#6366f1';
    document.querySelectorAll('#ql-color-presets .ql-color-dot').forEach((d, i) => d.classList.toggle('selected', i === 0));
    _updateQlPreview();
    await loadQuickLinks();
    _renderQlList();
  } catch(e) {
    showToast('追加に失敗しました', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function _renderQlList() {
  const listEl = document.getElementById('ql-list-body');
  if (!listEl) return;
  if (!_qlLinks.length) {
    listEl.innerHTML = '<div class="ql-list-empty">まだリンクがありません</div>';
    return;
  }
  listEl.innerHTML = _qlLinks.map((l, idx) => `
    <div class="ql-list-row" data-id="${escHtml(l.id)}">
      <div class="ql-list-preview">
        <span class="ql-link-btn ql-link-btn--sm" style="--ql-color:${escHtml(l.color||'#6366f1')};">
          <i class="${escHtml(l.icon||'fas fa-link')} ql-link-icon"></i>
          <span class="ql-link-label">${escHtml(l.label||'')}</span>
        </span>
      </div>
      <span class="ql-list-url" title="${escHtml(l.url||'')}">${escHtml(l.url||'')}</span>
      <div class="ql-list-actions">
        <button class="ql-list-btn ql-list-btn--up" data-idx="${idx}" title="上へ" ${idx===0?'disabled':''}><i class="fas fa-chevron-up"></i></button>
        <button class="ql-list-btn ql-list-btn--down" data-idx="${idx}" title="下へ" ${idx===_qlLinks.length-1?'disabled':''}><i class="fas fa-chevron-down"></i></button>
        <button class="ql-list-btn ql-list-btn--del" data-id="${escHtml(l.id)}" title="削除"><i class="fas fa-trash"></i></button>
      </div>
    </div>`).join('');

  listEl.querySelectorAll('.ql-list-btn--up').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx, 10);
      if (idx === 0) return;
      await _swapQlOrder(idx, idx - 1);
    });
  });
  listEl.querySelectorAll('.ql-list-btn--down').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx, 10);
      if (idx >= _qlLinks.length - 1) return;
      await _swapQlOrder(idx, idx + 1);
    });
  });
  listEl.querySelectorAll('.ql-list-btn--del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const link = _qlLinks.find(l => l.id === id);
      if (!id || !confirm(`「${link?.label || 'このリンク'}」を削除しますか？`)) return;
      try {
        await API.patch('quick_links', id, { is_deleted: true });
        showToast('削除しました', 'success');
        await loadQuickLinks();
        _renderQlList();
      } catch(e) { showToast('削除に失敗しました', 'error'); }
    });
  });
}

async function _swapQlOrder(i, j) {
  const a = _qlLinks[i], b = _qlLinks[j];
  if (!a || !b) return;
  const so_a = a.sort_order, so_b = b.sort_order;
  try {
    await Promise.all([
      API.patch('quick_links', a.id, { sort_order: so_b }),
      API.patch('quick_links', b.id, { sort_order: so_a }),
    ]);
    await loadQuickLinks();
    _renderQlList();
  } catch(e) { showToast('並び替えに失敗しました', 'error'); }
}

/* ============================================================
   インフォメーション（announcements）
   ============================================================ */

let _annInited  = false;
let _annDragSrc = null;

function _initAnnouncementsOnce() {
  _renderAnnouncements();
  if (_annInited) return;
  _annInited = true;

  document.getElementById('ann-add-row-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('ann-add-row-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
      const res = await API.get('announcements', { limit: 500 });
      const existing = (res.data || []).filter(r => !r.deleted);
      await API.post('announcements', {
        title: '', body: '', level: '通常', author: '', url: '', period: '',
        sort_order: existing.length + 1, deleted: false,
      });
      await _renderAnnouncements();
      const rows = document.querySelectorAll('#ann-tbody tr[data-id]');
      if (rows.length) rows[rows.length - 1].querySelector('.ann-cell-inp')?.focus();
    } catch(e) {
      showToast('追加に失敗しました', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus"></i> 追加'; }
    }
  });

  const tbody = document.getElementById('ann-tbody');
  if (!tbody) return;

  tbody.addEventListener('click', async e => {
    const delBtn = e.target.closest('.ann-row-del-btn');
    if (!delBtn) return;
    const id = delBtn.dataset.id;
    if (!id) return;
    try {
      await API.patch('announcements', id, { deleted: true });
      showToast('削除しました', 'success');
      _renderAnnouncements();
    } catch(err) { showToast('削除に失敗しました', 'error'); }
  });

  tbody.addEventListener('click', e => {
    const openBtn = e.target.closest('.ann-url-open-btn');
    if (!openBtn) return;
    const row = openBtn.closest('tr[data-id]');
    const inp = row?.querySelector('.ann-url-inp');
    let url = inp?.value.trim() || '';
    if (!url) { showToast('URLを入力してください', 'error'); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  tbody.addEventListener('blur', async e => {
    const inp = e.target;
    if (!inp.dataset.field) return;
    const row = inp.closest('tr[data-id]');
    if (!row) return;
    const id    = row.dataset.id;
    const field = inp.dataset.field;
    const value = inp.value.trim();
    try { await API.patch('announcements', id, { [field]: value }); } catch(err) {}
  }, true);

  _annInitDnD();
}

async function _renderAnnouncements() {
  const tbody = document.getElementById('ann-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="ann-td-loading"><i class="fas fa-spinner fa-spin"></i></td></tr>';
  try {
    const res  = await API.get('announcements', { limit: 200, sort: 'sort_order' });
    const rows = (Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []))
      .filter(a => !a.deleted)
      .sort((a, b) => ((a.sort_order ?? 9999) - (b.sort_order ?? 9999)) || ((a.created_at||0) - (b.created_at||0)));

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="ann-td-empty">データがありません。「追加」ボタンで行を追加できます。</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(r => `
      <tr class="ann-row" data-id="${escHtml(r.id)}" draggable="true">
        <td class="ann-td ann-td--drag">
          <span class="ann-drag-handle" title="ドラッグで並び替え"><i class="fas fa-grip-vertical"></i></span>
        </td>
        <td class="ann-td ann-td--title">
          <input class="ann-cell-inp" data-field="title" value="${escHtml(r.title||'')}" placeholder="タイトル">
        </td>
        <td class="ann-td ann-td--period">
          <input class="ann-cell-inp" data-field="period" value="${escHtml(r.period||'')}" placeholder="例）7/1〜7/31">
        </td>
        <td class="ann-td ann-td--url">
          <div class="ann-url-cell">
            <input class="ann-cell-inp ann-url-inp" data-field="url" value="${escHtml(r.url||'')}" placeholder="https://...">
            <button class="ann-url-open-btn" title="別ウィンドウで開く">
              <i class="fas fa-external-link-alt"></i>
            </button>
          </div>
        </td>
        <td class="ann-td ann-td--act">
          <button class="ann-row-del-btn" data-id="${escHtml(r.id)}" title="削除">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>`).join('');

    _annBindDnD();
  } catch(e) {
    tbody.innerHTML = '<tr><td colspan="5" class="ann-td-empty">読み込みに失敗しました</td></tr>';
  }
}

function _annInitDnD() {
  const tbody = document.getElementById('ann-tbody');
  if (!tbody) return;
  new MutationObserver(() => _annBindDnD()).observe(tbody, { childList: true });
  _annBindDnD();
}

function _annBindDnD() {
  document.querySelectorAll('#ann-tbody tr[data-id]').forEach(row => {
    row.draggable = true;
    row.addEventListener('dragstart', _annDragStart);
    row.addEventListener('dragover',  _annDragOver);
    row.addEventListener('dragleave', _annDragLeave);
    row.addEventListener('drop',      _annDrop);
    row.addEventListener('dragend',   _annDragEnd);
  });
}

function _annDragStart(e) {
  _annDragSrc = this;
  this.classList.add('ann-drag-source');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.dataset.id);
}
function _annDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('#ann-tbody tr.ann-drag-over').forEach(r => r.classList.remove('ann-drag-over'));
  if (this !== _annDragSrc) this.classList.add('ann-drag-over');
}
function _annDragLeave() { this.classList.remove('ann-drag-over'); }
async function _annDrop(e) {
  e.preventDefault(); e.stopPropagation();
  this.classList.remove('ann-drag-over');
  if (!_annDragSrc || _annDragSrc === this) return;
  const tbody = document.getElementById('ann-tbody');
  if (!tbody) return;
  const rows = Array.from(tbody.querySelectorAll('tr[data-id]'));
  const si = rows.indexOf(_annDragSrc), di = rows.indexOf(this);
  if (si < 0 || di < 0) return;
  if (si < di) tbody.insertBefore(_annDragSrc, this.nextSibling);
  else         tbody.insertBefore(_annDragSrc, this);
  try {
    await Promise.all(
      Array.from(tbody.querySelectorAll('tr[data-id]')).map((r, i) =>
        API.patch('announcements', r.dataset.id, { sort_order: i + 1 })
      )
    );
  } catch(err) { console.error('ann sort error', err); }
}
function _annDragEnd() {
  document.querySelectorAll('#ann-tbody tr').forEach(r =>
    r.classList.remove('ann-drag-source', 'ann-drag-over')
  );
  _annDragSrc = null;
}

/* ============================================================
   タスク管理
   ============================================================ */

let _allTasks          = [];
let _allSchedules      = [];
let _taskCurrentStaff  = 'dashboard';
let _taskProgressFilter = '';
let _taskPriorityFilter = '';
let _taskSearchText    = '';
let _taskStaffInited   = false;

const PROGRESS_CFG = {
  '未着手':   { cls: 'tpg-todo',    label: '未着手'   },
  '進行中':   { cls: 'tpg-doing',   label: '進行中'   },
  '確認待ち': { cls: 'tpg-waiting', label: '確認待ち' },
  '完了':     { cls: 'tpg-done',    label: '完了'     },
};
const PRIORITY_CFG = {
  '高': { cls: 'tpr-high', label: '高' },
  '中': { cls: 'tpr-mid',  label: '中' },
  '低': { cls: 'tpr-low',  label: '低' },
};

// ── 今日の日付文字列（YYYY-MM-DD）──
function _todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _dateStrOffset(baseStr, offsetDays) {
  const d = new Date(baseStr + 'T00:00:00');
  d.setDate(d.getDate() - offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── スタッフ並び順管理 ──
const STAFF_ORDER_KEY = 'taskStaffOrder_v1';
function _loadStaffOrder() {
  try { return JSON.parse(localStorage.getItem(STAFF_ORDER_KEY) || '[]'); }
  catch { return []; }
}
function _saveStaffOrder(names) {
  localStorage.setItem(STAFF_ORDER_KEY, JSON.stringify(names));
}
function _orderedStaffList() {
  const all   = _activeAccounts();
  const saved = _loadStaffOrder();
  const ordered = [];
  saved.forEach(name => { const a = all.find(x => x.name === name); if (a) ordered.push(a); });
  all.forEach(a => { if (!ordered.find(x => x.name === a.name)) ordered.push(a); });
  return ordered;
}

// ── 時間管理 ──
const DEFAULT_HOUR_LIMIT = 8;
function _staffHourLimit(staffName) {
  const acc = _allAccounts.find(a => a.name === staffName);
  if (acc && acc.daily_hour_limit != null && parseFloat(acc.daily_hour_limit) > 0) {
    return parseFloat(acc.daily_hour_limit);
  }
  return DEFAULT_HOUR_LIMIT;
}

function _schIsToday(s, todayStr) {
  if (s.date === todayStr) return true;
  if (!s.date && s.created_at) {
    const d = new Date(s.created_at);
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return ds === todayStr;
  }
  return false;
}

function _schIsBeforeToday(s, todayStr) {
  const dateStr = s.date || (s.created_at
    ? (() => { const d = new Date(s.created_at); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })()
    : null);
  if (!dateStr) return false;
  return dateStr < todayStr;
}

// 稼働ログ
let _allWorkLogs = [];

async function _loadWorkLogs() {
  try {
    const res = await API.get('daily_work_logs', { limit: 2000 });
    const rows = Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
    _allWorkLogs = rows.filter(r => !r.deleted);
  } catch(e) {
    _allWorkLogs = [];
  }
}

async function _upsertTodayWorkLog(staffName) {
  const today = _todayStr();
  const acct  = _allAccounts.find(a => a.name === staffName);
  const isHoliday = !!(acct?.is_holiday);
  const lim   = _staffHourLimit(staffName);
  const _msToDateStr = ms => {
    if (!ms) return null;
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const _isTodayTask = t => {
    if (t.progress === '完了') return t.today_date ? t.today_date === today : _msToDateStr(t.updated_at) === today;
    return !!t.is_today;
  };
  const taskH =
    _allTasks
      .filter(t => t.assignee === staffName && _isTodayTask(t) && (!t.handover || t.handover === staffName))
      .reduce((s, t) => s + (parseFloat(t.today_hours) || 0), 0)
    + _allTasks
      .filter(t => _isTodayTask(t) && t.handover === staffName && t.assignee !== staffName)
      .reduce((s, t) => s + (parseFloat(t.today_hours) || 0), 0);
  const schedH = _allSchedules
    .filter(s => s.assignee === staffName && _schIsToday(s, today))
    .reduce((s, r) => s + (parseFloat(r.duration_hours) || 0), 0);
  const totalH = isHoliday ? 0 : (taskH + schedH);
  let status;
  if (isHoliday)        status = 'holiday';
  else if (totalH <= 0) status = 'none';
  else {
    const pct = lim > 0 ? (totalH / lim) * 100 : 0;
    if (pct > 110)      status = 'over2';
    else if (pct > 100) status = 'over1';
    else                status = 'ok';
  }
  const existing = _allWorkLogs.find(r => r.date === today && r.staff_name === staffName);
  try {
    if (existing) {
      await API.patch('daily_work_logs', existing.id, {
        total_hours: totalH, limit_hours: lim, is_holiday: isHoliday, status,
      });
      existing.total_hours = totalH; existing.limit_hours = lim;
      existing.is_holiday  = isHoliday; existing.status = status;
    } else {
      const created = await API.post('daily_work_logs', {
        date: today, staff_name: staffName,
        total_hours: totalH, limit_hours: lim, is_holiday: isHoliday, status,
      });
      if (created && created.id) _allWorkLogs.push(created);
    }
  } catch(e) {}
}

async function _upsertAllTodayWorkLogs() {
  const staffList = _orderedStaffList();
  if (!staffList.length) return;
  await Promise.allSettled(staffList.map(a => _upsertTodayWorkLog(a.name)));
}

// ── スタッフ稼働計算 ──
function _calcStaffHoursOnDate(staffName, dateStr) {
  const today = _todayStr();
  const _msToDateStr = ms => {
    if (!ms) return null;
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const _isOnDate = t => {
    if (dateStr === today) {
      if (t.progress === '完了') return t.today_date ? t.today_date === today : _msToDateStr(t.updated_at) === today;
      return !!t.is_today;
    }
    return t.progress === '完了'
      ? (t.today_date === dateStr || _msToDateStr(t.updated_at) === dateStr)
      : _schIsBeforeToday({ date: t.today_date || _msToDateStr(t.updated_at) }, dateStr + 'Z') === false
        && (t.today_date === dateStr);
  };
  const taskH = _allTasks
    .filter(t => (t.assignee === staffName || t.handover === staffName) && _isOnDate(t))
    .reduce((s, t) => s + (parseFloat(t.today_hours) || 0), 0);
  const schedH = _allSchedules
    .filter(s => s.assignee === staffName && (dateStr === today ? _schIsToday(s, dateStr) : s.date === dateStr))
    .reduce((s, r) => s + (parseFloat(r.duration_hours) || 0), 0);
  return taskH + schedH;
}

function _calcStaffHours(staffName) {
  const today    = _todayStr();
  const acct     = _allAccounts.find(a => a.name === staffName);
  const isHoliday = !!(acct?.is_holiday);
  const limit    = _staffHourLimit(staffName);
  const _msToDateStr = ms => {
    if (!ms) return null;
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const _isTodayTask = t => {
    if (t.progress === '完了') return t.today_date ? t.today_date === today : _msToDateStr(t.updated_at) === today;
    return !!t.is_today;
  };
  const myTasks = _allTasks.filter(t =>
    t.assignee === staffName && _isTodayTask(t) && (!t.handover || t.handover === staffName)
  );
  const handTasks = _allTasks.filter(t =>
    _isTodayTask(t) && t.handover === staffName && t.assignee !== staffName
  );
  const taskH = [...myTasks, ...handTasks].reduce((s, t) => s + (parseFloat(t.today_hours) || 0), 0);
  const schedH = _allSchedules
    .filter(s => s.assignee === staffName && _schIsToday(s, today))
    .reduce((s, r) => s + (parseFloat(r.duration_hours) || 0), 0);
  const todayH  = isHoliday ? 0 : (taskH + schedH);
  const openCnt = _allTasks.filter(t => t.assignee === staffName && t.progress !== '完了').length;
  const now = new Date(); now.setHours(0,0,0,0);
  const overdue = _allTasks.filter(t => t.assignee === staffName && t.progress !== '完了' && t.due_date && new Date(t.due_date + 'T00:00:00') < now).length;
  const estH = _allTasks.filter(t => t.assignee === staffName && t.progress !== '完了').reduce((s, t) => s + (parseFloat(t.estimated_hours) || 0), 0);
  return { todayH, taskH, schedH, limit, isHoliday, openCnt, overdue, estH };
}

// ── スタッフタブ ──
function _staffId(name) {
  return 'staff_' + name.replace(/[^a-zA-Z0-9\u3040-\u9FFF]/g, '_');
}

function _buildStaffTabs() {
  const wrap = document.getElementById('task-staff-tabs');
  if (wrap) wrap.innerHTML = _staffTabsHTML();

  const panels = document.getElementById('task-staff-panels');
  if (panels) {
    const orderedNames = _orderedStaffList().map(a => a.name);
    orderedNames.forEach(name => {
      const id = `task-panel-${_staffId(name)}`;
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'task-panel'; el.id = id; el.style.display = 'none';
      }
      panels.appendChild(el);
    });
  }

  if (_taskStaffInited) return;
  _taskStaffInited = true;
  document.getElementById('task-staff-bar')?.addEventListener('click', e => {
    const btn = e.target.closest('.task-staff-tab');
    if (!btn) return;
    _taskCurrentStaff = btn.dataset.staff;
    document.querySelectorAll('.task-staff-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _renderTaskPage();
  });
}

function _staffTabsHTML() {
  return _orderedStaffList().map(a => `
    <button class="task-staff-tab${_taskCurrentStaff === a.name ? ' active' : ''}" data-staff="${escHtml(a.name)}">
      <i class="fas fa-user"></i> ${escHtml(a.name)}
    </button>`).join('');
}

// ── ロード ──
async function loadTasks() {
  try {
    if (!_qlBarInited) loadQuickLinks();

    const [taskRes, accRes] = await Promise.all([
      API.get('tasks',    { limit: 500 }),
      API.get('accounts', { limit: 200 }),
    ]);
    _allTasks    = (Array.isArray(taskRes.data) ? taskRes.data : (Array.isArray(taskRes) ? taskRes : [])).filter(t => !t.deleted);
    _allAccounts = (Array.isArray(accRes.data)  ? accRes.data  : (Array.isArray(accRes)  ? accRes  : [])).filter(a => !a.is_deleted);

    try {
      const schedRes = await API.get('schedules', { limit: 500 });
      const schedRows = Array.isArray(schedRes.data) ? schedRes.data : (Array.isArray(schedRes) ? schedRes : []);
      _allSchedules = schedRows.filter(s => s.deleted !== true);
    } catch(se) { _allSchedules = []; }

    try {
      await _loadWorkLogs();
      await _upsertAllTodayWorkLogs();
    } catch(se) { _allWorkLogs = []; }

    // 完了タスクの自動削除（1週間経過）
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const expired = _allTasks.filter(t =>
      t.progress === '完了' && t.updated_at && (now - t.updated_at) >= ONE_WEEK_MS
    );
    if (expired.length > 0) {
      await Promise.allSettled(expired.map(t => API.delete('tasks', t.id)));
      const expiredIds = new Set(expired.map(t => t.id));
      _allTasks = _allTasks.filter(t => !expiredIds.has(t.id));
    }

    try { _buildStaffTabs(); } catch(e) { console.error('_buildStaffTabs error', e); }
    try { _renderTaskPage(); } catch(e) { console.error('_renderTaskPage error', e); }
    try { updateTaskNavBadge(); } catch(e) {}
  } catch(e) {
    console.error('loadTasks error', e);
    showToast('タスクの読み込みに失敗しました', 'error');
  }
}

function updateTaskNavBadge() {
  const badge = document.getElementById('nav-badge-tasks');
  if (badge) badge.style.display = 'none';
}

// ── タスクページ描画 ──
function _renderTaskPage() {
  document.querySelectorAll('.task-panel').forEach(p => p.style.display = 'none');
  if (_taskCurrentStaff === 'dashboard') {
    const dash = document.getElementById('task-panel-dashboard');
    if (dash) { dash.style.display = ''; _renderDashboard(); }
  } else {
    const panelId = `task-panel-${_staffId(_taskCurrentStaff)}`;
    const panel   = document.getElementById(panelId);
    if (panel) { panel.style.display = ''; _renderStaffTable(panel, _taskCurrentStaff); }
  }
}

// ── ダッシュボード描画 ──
function _renderDashboard() {
  _initAnnouncementsOnce();
  _initShopInfoOnce();

  const active    = _allTasks.filter(t => t.progress !== '完了');
  const today     = new Date(); today.setHours(0,0,0,0);
  const staffList = _orderedStaffList();

  const totalTodayH = staffList.reduce((sum, a) => {
    const { todayH } = _calcStaffHours(a.name);
    return sum + todayH;
  }, 0);
  const totalLimitH = staffList.reduce((sum, a) => sum + _staffHourLimit(a.name), 0);
  const totalEstH   = active.reduce((s, t) => s + (parseFloat(t.estimated_hours) || 0), 0);
  const overworkStaff = staffList.filter(a => {
    const { todayH, limit } = _calcStaffHours(a.name);
    return todayH >= limit;
  }).length;
  const overdue = active.filter(t => t.due_date && new Date(t.due_date + 'T00:00:00') < today).length;

  const summaryEl = document.getElementById('task-summary-cards');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="task-summary-card task-summary-card--hours">
        <div class="task-summary-num">${totalTodayH.toFixed(1)}<span style="font-size:14px;font-weight:500;margin-left:2px;">h</span></div>
        <div class="task-summary-lbl">今日の総作業時間</div>
      </div>
      <div class="task-summary-card task-summary-card--today">
        <div class="task-summary-num">${totalLimitH.toFixed(1)}<span style="font-size:14px;font-weight:500;margin-left:2px;">h</span></div>
        <div class="task-summary-lbl">今日の想定総稼働時間</div>
      </div>
      <div class="task-summary-card task-summary-card--overwork">
        <div class="task-summary-num">${overworkStaff}</div>
        <div class="task-summary-lbl">オーバーワーク中のスタッフ</div>
      </div>
      <div class="task-summary-card task-summary-card--over" id="dash-overdue-card" style="cursor:pointer;" title="クリックして期限超過タスクを表示">
        <div class="task-summary-num">${overdue}</div>
        <div class="task-summary-lbl">期限超過タスク</div>
        ${overdue > 0 ? '<div class="task-summary-action"><i class="fas fa-list"></i> 案件を表示</div>' : ''}
      </div>`;
  }

  const overviewEl = document.getElementById('task-staff-overview');
  if (overviewEl) {
    if (!staffList.length) {
      overviewEl.innerHTML = '<p style="color:var(--gray-400);font-size:13px;">スタッフが登録されていません</p>';
    } else {
      const todayStr_ = _todayStr();
      const DAYS      = 7;
      const _ovwDays  = 7;
      const DOW = ['日','月','火','水','木','金','土'];
      const _ovwDateLabels = Array.from({length: _ovwDays}, (_, i) => i === 0 ? '今日' : `${i}日前`);
      const _ovwDates      = Array.from({length: _ovwDays}, (_, i) => _dateStrOffset(todayStr_, i));
      overviewEl.innerHTML = `
        <table class="task-overview-table" id="task-overview-table">
          <thead><tr>
            <th class="task-overview-drag-col"></th>
            <th>スタッフ</th>
            <th class="task-overview-position-col">ポジション</th>
            <th class="task-overview-jur-col">管轄</th>
            <th class="r">今日 (h)</th>
            <th class="r" style="color:var(--gray-400);">想定稼働</th>
            <th class="r">稼働率</th>
            ${_ovwDateLabels.map((l, i) => `<th class="c ovw-face-th"${i===0?' data-today="1"':''}>${l}</th>`).join('')}
          </tr></thead>
          <tbody id="task-overview-tbody">
          ${staffList.map(a => {
            const { todayH, limit: lim, isHoliday } = _calcStaffHours(a.name);
            const isOver = !isHoliday && todayH >= lim;
            const todayDisp = isHoliday
              ? '<span style="color:#9ca3af;">公休</span>'
              : todayH > 0
                ? (isOver ? `<span class="task-time-warn"><i class="fas fa-exclamation-triangle"></i>${todayH.toFixed(1)}h</span>` : `${todayH.toFixed(1)}h`)
                : '—';
            const overPct = !isHoliday && lim > 0 && todayH > 0 ? (todayH / lim * 100) : null;
            const overPctDisp = overPct !== null
              ? `<span class="ovw-pct${overPct > 110 ? ' ovw-pct--over2' : overPct > 100 ? ' ovw-pct--over1' : ' ovw-pct--ok'}">${overPct.toFixed(1)}%</span>`
              : '<span style="color:var(--gray-300);">—</span>';
            const jurTags = Array.isArray(a.jurisdiction) ? a.jurisdiction
                          : (a.jurisdiction ? (() => { try { return JSON.parse(a.jurisdiction); } catch { return []; } })() : []);
            const jurCell = jurTags.length
              ? `<div class="ovw-jur-cell">${jurTags.map(j => `<span class="ovw-jur-badge">${escHtml(j)}</span>`).join('')}</div>`
              : '<span class="task-overview-position-empty">—</span>';
            const faceCells = _ovwDates.map((dateStr, i) => {
              const log = i === 0
                ? null
                : _allWorkLogs.find(r => r.date === dateStr && r.staff_name === a.name);
              if (log) {
                const st = log.status || 'none';
                const ic = st === 'holiday' ? '🏖️' : st === 'over2' ? '🔴' : st === 'over1' ? '🟠' : st === 'ok' ? '🟢' : '⚪';
                return `<td class="c ovw-face-cell">${ic}</td>`;
              } else if (i === 0) {
                const ic = isHoliday ? '🏖️' : isOver ? '🔴' : todayH > 0 ? '🟢' : '⚪';
                return `<td class="c ovw-face-cell" data-today="1">${ic}</td>`;
              }
              return `<td class="c ovw-face-cell">⚪</td>`;
            }).join('');
            return `<tr class="task-overview-row${isOver ? ' task-overview-row--overwork' : ''}" data-staff="${escHtml(a.name)}">
              <td class="task-overview-drag-col"><span class="task-drag-handle" title="ドラッグして並び替え"><i class="fas fa-grip-vertical"></i></span></td>
              <td><button class="task-staff-link" data-staff="${escHtml(a.name)}">${escHtml(a.name)}</button></td>
              <td class="task-overview-position-col">${a.position ? `<span class="task-overview-position-badge">${escHtml(a.position)}</span>` : '<span class="task-overview-position-empty">—</span>'}</td>
              <td class="task-overview-jur-col">${jurCell}</td>
              <td class="r">${todayDisp}</td>
              <td class="r" style="color:var(--gray-400);font-size:11px;">${lim}h</td>
              <td class="r">${overPctDisp}</td>
              ${faceCells}
            </tr>`;
          }).join('')}
          </tbody>
        </table>`;

      overviewEl.querySelectorAll('.task-staff-link').forEach(btn => {
        btn.addEventListener('click', () => {
          _taskCurrentStaff = btn.dataset.staff;
          document.querySelectorAll('.task-staff-tab').forEach(b => b.classList.toggle('active', b.dataset.staff === _taskCurrentStaff));
          _renderTaskPage();
        });
      });

      // スタッフ並び替えD&D
      _initStaffTableDnD(document.getElementById('task-overview-tbody'));
    }
  }

  const overdueCard = document.getElementById('dash-overdue-card');
  if (overdueCard && overdue > 0) {
    overdueCard.addEventListener('click', () => _showOverduePopup());
  }
}

// ── スタッフ並び替えD&D ──
let _staffDragSrc = null;
function _initStaffTableDnD(tbody) {
  if (!tbody) return;
  tbody.querySelectorAll('tr[data-staff]').forEach(row => {
    row.setAttribute('draggable', 'true');
    row.addEventListener('dragstart', e => {
      _staffDragSrc = row;
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragover', e => { e.preventDefault(); });
    row.addEventListener('drop', e => {
      e.preventDefault();
      if (!_staffDragSrc || _staffDragSrc === row) return;
      const rows = Array.from(tbody.querySelectorAll('tr[data-staff]'));
      const si = rows.indexOf(_staffDragSrc);
      const di = rows.indexOf(row);
      if (si < di) tbody.insertBefore(_staffDragSrc, row.nextSibling);
      else         tbody.insertBefore(_staffDragSrc, row);
      const newOrder = Array.from(tbody.querySelectorAll('tr[data-staff]')).map(r => r.dataset.staff);
      _saveStaffOrder(newOrder);
    });
    row.addEventListener('dragend', () => { _staffDragSrc = null; });
  });
}

// ── スタッフ個別テーブル描画 ──
function _renderStaffTable(panel, staffName) {
  const q = _taskSearchText.toLowerCase();
  const matchSearch = t => !q || [t.title, t.store_name, t.handover, t.notes].some(v => v && v.toLowerCase().includes(q));
  const po = { '高': 0, '中': 1, '低': 2 };
  const byPriority = (a, b) => (po[a.priority] ?? 1) - (po[b.priority] ?? 1) || ((a.start_date || '') < (b.start_date || '') ? -1 : 1);

  let myTasks = _allTasks.filter(t =>
    t.progress !== '完了' &&
    (t.task_category || 'タスク管理') !== 'PR管理' &&
    (t.task_category || 'タスク管理') !== '定期タスク' &&
    matchSearch(t) && (
      (t.assignee === staffName && (!t.handover || t.handover === staffName)) ||
      (t.handover === staffName && t.assignee !== staffName)
    )
  );
  myTasks.sort(byPriority);

  let todayTasks = myTasks.filter(t => t.is_today);
  let otherTasks = myTasks.filter(t => !t.is_today);

  const buildRow = (t, showToday = false) => {
    const today = _todayStr();
    const pCfg  = PROGRESS_CFG[t.progress] || PROGRESS_CFG['未着手'];
    const prCfg = PRIORITY_CFG[t.priority]  || PRIORITY_CFG['中'];
    const isTodayTask = !!t.is_today;
    const now = new Date(); now.setHours(0,0,0,0);
    const isOverdue = t.due_date && new Date(t.due_date + 'T00:00:00') < now;
    const dueLbl = t.due_date
      ? `<span class="task-tbl-due ${isOverdue ? 'task-tbl-due--over' : ''}">${t.due_date.replace(/-/g, '/')}</span>`
      : '<span class="task-tbl-due-empty">—</span>';
    const handoverLbl = (t.handover && t.handover !== staffName)
      ? `<span class="task-tbl-handover"><i class="fas fa-arrow-right"></i>${escHtml(t.handover)}</span>` : '';
    const todayToggle = `
      <button class="task-today-toggle ${isTodayTask ? 'active' : ''}" data-id="${escHtml(t.id)}" data-is-today="${isTodayTask}" title="今日のタスクに設定">
        <i class="fas fa-sun"></i>
      </button>`;
    const todayHoursCell = isTodayTask
      ? `<span class="task-today-h-disp" data-id="${escHtml(t.id)}">${t.today_hours != null ? t.today_hours + 'h' : '—'}</span>
         <button class="task-today-h-edit-btn" data-id="${escHtml(t.id)}" title="今日の時間を編集"><i class="fas fa-pen"></i></button>`
      : '<span class="task-today-h-empty">—</span>';
    return `<tr class="task-tbl-row${isOverdue ? ' task-tbl-row--overdue' : ''}" data-id="${escHtml(t.id)}">
      <td class="task-tbl-td task-tbl-td--today">${todayToggle}</td>
      <td class="task-tbl-td task-tbl-td--title">
        <span class="task-tbl-title">${escHtml(t.title || '（無題）')}</span>
        ${t.store_name ? `<span class="task-tbl-store"><i class="fas fa-store"></i>${escHtml(t.store_name)}</span>` : ''}
        ${handoverLbl}
      </td>
      <td class="task-tbl-td task-tbl-td--progress">
        <button class="task-progress-cycle task-tbl-${pCfg.cls}" data-id="${escHtml(t.id)}" data-progress="${escHtml(t.progress || '未着手')}" title="クリックで進捗変更">${pCfg.label}</button>
      </td>
      <td class="task-tbl-td task-tbl-td--priority">
        <span class="task-tbl-${prCfg.cls}">${prCfg.label}</span>
      </td>
      <td class="task-tbl-td task-tbl-td--due">${dueLbl}</td>
      <td class="task-tbl-td task-tbl-td--today-h">${todayHoursCell}</td>
      <td class="task-tbl-td task-tbl-td--act">
        <button class="task-tbl-edit-btn" data-id="${escHtml(t.id)}" title="編集"><i class="fas fa-pen"></i></button>
      </td>
    </tr>`;
  };

  const buildSection = (title, tasks) => {
    if (!tasks.length) return '';
    return `<div class="task-section">
      <div class="task-section-header">${title} <span class="task-section-count">${tasks.length}</span></div>
      <table class="task-tbl">
        <thead><tr>
          <th class="task-tbl-th task-tbl-th--today">今日</th>
          <th class="task-tbl-th task-tbl-th--title">タスク名</th>
          <th class="task-tbl-th task-tbl-th--progress">進捗</th>
          <th class="task-tbl-th task-tbl-th--priority">優先度</th>
          <th class="task-tbl-th task-tbl-th--due">完了予定日</th>
          <th class="task-tbl-th task-tbl-th--today-h">今日 (h)</th>
          <th class="task-tbl-th"></th>
        </tr></thead>
        <tbody>${tasks.map(t => buildRow(t)).join('')}</tbody>
      </table>
    </div>`;
  };

  panel.innerHTML = `
    <div class="task-staff-header-bar">
      <h3 class="task-staff-title"><i class="fas fa-user"></i> ${escHtml(staffName)}</h3>
      <div class="task-search-wrap">
        <input type="text" id="task-search-${_staffId(staffName)}" class="task-search" placeholder="タスク検索..." value="${escHtml(_taskSearchText)}">
      </div>
      <button class="btn btn-primary btn-sm task-add-btn" data-staff="${escHtml(staffName)}">
        <i class="fas fa-plus"></i> タスクを追加
      </button>
    </div>
    ${buildSection('今日のタスク', todayTasks)}
    ${buildSection('タスク管理', otherTasks)}
    ${!myTasks.length ? '<div class="task-empty-msg"><i class="fas fa-check-circle"></i> タスクはありません</div>' : ''}
  `;

  // イベント
  panel.querySelector(`.task-search`)?.addEventListener('input', e => {
    _taskSearchText = e.target.value;
    _renderStaffTable(panel, staffName);
  });

  panel.querySelector('.task-add-btn')?.addEventListener('click', () => {
    openTaskModal(null, staffName);
  });

  panel.querySelectorAll('.task-tbl-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openTaskModal(btn.dataset.id));
  });

  panel.querySelectorAll('.task-tbl-row').forEach(row => {
    row.addEventListener('dblclick', () => openTaskModal(row.dataset.id));
  });

  panel.querySelectorAll('.task-progress-cycle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id  = btn.dataset.id;
      const cur = btn.dataset.progress || '未着手';
      const order = ['未着手', '進行中', '確認待ち', '完了'];
      const nextProg = order[(order.indexOf(cur) + 1) % order.length];
      try {
        const payload = { progress: nextProg };
        if (nextProg === '完了') {
          payload.is_today = true;
          payload.today_date = _todayStr();
        }
        await API.patch('tasks', id, payload);
        const t = _allTasks.find(x => x.id === id);
        if (t) { t.progress = nextProg; if (nextProg === '完了') { t.is_today = true; t.today_date = _todayStr(); } }
        _renderStaffTable(panel, staffName);
        await _upsertAllTodayWorkLogs();
      } catch(e) { showToast('更新に失敗しました', 'error'); }
    });
  });

  panel.querySelectorAll('.task-today-toggle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id      = btn.dataset.id;
      const isToday = btn.dataset.isToday === 'true';
      try {
        await API.patch('tasks', id, { is_today: !isToday, today_date: !isToday ? _todayStr() : null });
        const t = _allTasks.find(x => x.id === id);
        if (t) { t.is_today = !isToday; t.today_date = !isToday ? _todayStr() : null; }
        _renderStaffTable(panel, staffName);
        await _upsertAllTodayWorkLogs();
      } catch(e) { showToast('更新に失敗しました', 'error'); }
    });
  });

  panel.querySelectorAll('.task-today-h-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id  = btn.dataset.id;
      const t   = _allTasks.find(x => x.id === id);
      const cur = t?.today_hours != null ? t.today_hours : '';
      const val = prompt('今日の作業時間（h）:', cur);
      if (val === null) return;
      const h = val === '' ? null : parseFloat(val);
      if (val !== '' && (isNaN(h) || h < 0)) { showToast('正の数値を入力してください', 'error'); return; }
      API.patch('tasks', id, { today_hours: h }).then(() => {
        if (t) t.today_hours = h;
        _renderStaffTable(panel, staffName);
        _upsertAllTodayWorkLogs();
      }).catch(() => showToast('更新に失敗しました', 'error'));
    });
  });
}

// ── 期限超過ポップアップ ──
function _showOverduePopup() {
  const today = new Date(); today.setHours(0,0,0,0);
  const fmtDate = d => {
    if (!d) return '—';
    const dt = new Date(d + 'T00:00:00');
    return `${dt.getFullYear()}/${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')}`;
  };
  const diffDays = d => Math.floor((today - new Date(d + 'T00:00:00')) / (1000 * 60 * 60 * 24));
  const overdueTasks = _allTasks
    .filter(t => t.progress !== '完了' && t.due_date && new Date(t.due_date + 'T00:00:00') < today)
    .sort((a, b) => (a.due_date || '') < (b.due_date || '') ? -1 : 1);

  const byStaff = new Map();
  overdueTasks.forEach(t => {
    const name = t.assignee || '未割当';
    if (!byStaff.has(name)) byStaff.set(name, []);
    byStaff.get(name).push(t);
  });

  const staffSections = [...byStaff.entries()].map(([name, tasks]) => {
    const rows = tasks.map(t => {
      const days = diffDays(t.due_date);
      const progColors = { '未着手': '#f3f4f6', '進行中': '#fee2e2', '確認待ち': '#fef9c3' };
      const progColor  = progColors[t.progress] || '#f3f4f6';
      return `<tr>
        <td style="padding:6px 8px;">${escHtml(t.store_name || '—')}</td>
        <td style="padding:6px 8px;">${escHtml(t.title || '（無題）')}</td>
        <td style="padding:6px 8px;color:#ef4444;font-weight:600;">${fmtDate(t.due_date)}<br><small>+${days}日超過</small></td>
        <td style="padding:6px 8px;"><span style="background:${progColor};padding:2px 8px;border-radius:4px;font-size:12px;">${escHtml(t.progress || '未着手')}</span></td>
      </tr>`;
    }).join('');
    return `<div style="margin-bottom:20px;">
      <div style="font-weight:700;color:#374151;margin-bottom:8px;"><i class="fas fa-user"></i> ${escHtml(name)} (${tasks.length}件)</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#f9fafb;">
          <th style="padding:6px 8px;text-align:left;">店舗名</th>
          <th style="padding:6px 8px;text-align:left;">タスク名</th>
          <th style="padding:6px 8px;text-align:left;">完了予定日</th>
          <th style="padding:6px 8px;text-align:left;">進捗</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join('');

  const existing = document.getElementById('odp-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'odp-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;width:min(90vw,700px);max-height:80vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.25);">
      <div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:12px;">
        <h2 style="margin:0;font-size:18px;font-weight:700;color:#111827;"><i class="fas fa-exclamation-triangle" style="color:#ef4444;"></i> 期限超過タスク (${overdueTasks.length}件)</h2>
        <button id="odp-close-btn" style="margin-left:auto;background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;">×</button>
      </div>
      <div style="padding:20px 24px;">
        ${staffSections || '<p style="color:#9ca3af;text-align:center;">超過タスクはありません</p>'}
      </div>
    </div>`;

  document.body.appendChild(modal);
  document.getElementById('odp-close-btn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// ── タスクモーダル ──
function openTaskModal(id = null, defaultAssignee = '') {
  const isNew = !id;
  const titleEl = document.getElementById('task-modal-title');
  if (titleEl) titleEl.textContent = isNew ? 'タスクを追加' : 'タスクを編集';

  const idEl = document.getElementById('task-id');
  if (idEl) idEl.value = id || '';

  const delBtn = document.getElementById('task-delete-btn');
  if (delBtn) delBtn.style.display = isNew ? 'none' : '';

  // 担当者セレクト
  const assigneeEl  = document.getElementById('task-assignee');
  const handoverEl  = document.getElementById('task-handover');
  const staffOpts   = ['<option value="">— 未設定 —</option>',
    ..._activeAccounts().map(a => `<option value="${escHtml(a.name)}">${escHtml(a.name)}</option>`)].join('');
  if (assigneeEl) assigneeEl.innerHTML = staffOpts;
  if (handoverEl) handoverEl.innerHTML = '<option value="">— なし —</option>' +
    _activeAccounts().map(a => `<option value="${escHtml(a.name)}">${escHtml(a.name)}</option>`).join('');

  if (isNew) {
    const fields = {
      'task-title': '', 'task-store-name': '', 'task-priority': '',
      'task-start-date': '', 'task-due-date': '', 'task-estimated-hours': '',
      'task-progress': '未着手', 'task-today-hours': '', 'task-notes': '', 'task-task-category': 'タスク管理',
    };
    Object.entries(fields).forEach(([id_, val]) => {
      const el = document.getElementById(id_);
      if (el) el.value = val;
    });
    const isTodayEl = document.getElementById('task-is-today');
    if (isTodayEl) isTodayEl.checked = false;
    if (assigneeEl) assigneeEl.value = defaultAssignee || (_taskCurrentStaff !== 'dashboard' ? _taskCurrentStaff : '');
  } else {
    const t = _allTasks.find(x => x.id === id);
    if (!t) return;
    const setVal = (eid, val) => { const el = document.getElementById(eid); if (el) el.value = val || ''; };
    setVal('task-title', t.title);
    setVal('task-assignee', t.assignee);
    setVal('task-handover', t.handover);
    setVal('task-store-name', t.store_name);
    setVal('task-priority', t.priority);
    setVal('task-start-date', t.start_date);
    setVal('task-due-date', t.due_date);
    const estEl = document.getElementById('task-estimated-hours');
    if (estEl) estEl.value = t.estimated_hours != null ? t.estimated_hours : '';
    setVal('task-progress', t.progress || '未着手');
    const isTodayEl = document.getElementById('task-is-today');
    if (isTodayEl) isTodayEl.checked = !!t.is_today;
    const thEl = document.getElementById('task-today-hours');
    if (thEl) thEl.value = t.today_hours != null ? t.today_hours : '';
    setVal('task-notes', t.notes);
    setVal('task-task-category', t.task_category || 'タスク管理');
  }

  const modal = document.getElementById('modal-task');
  if (modal) modal.style.display = 'flex';
  document.getElementById('task-title')?.focus();
}

async function saveTask() {
  const title = document.getElementById('task-title')?.value.trim() || '';
  if (!title) { showToast('タスク名を入力してください', 'error'); return; }
  const id      = document.getElementById('task-id')?.value || '';
  const estH    = document.getElementById('task-estimated-hours')?.value || '';
  const todayH  = document.getElementById('task-today-hours')?.value || '';
  const isToday = document.getElementById('task-is-today')?.checked || false;
  const payload = {
    title,
    assignee:        document.getElementById('task-assignee')?.value || '',
    handover:        document.getElementById('task-handover')?.value || '',
    store_name:      document.getElementById('task-store-name')?.value.trim() || '',
    priority:        document.getElementById('task-priority')?.value || '',
    start_date:      document.getElementById('task-start-date')?.value || '',
    due_date:        document.getElementById('task-due-date')?.value || '',
    estimated_hours: estH !== '' ? parseFloat(estH) : null,
    progress:        document.getElementById('task-progress')?.value || '未着手',
    is_today:        isToday,
    today_date:      isToday ? _todayStr() : null,
    today_hours:     todayH !== '' ? parseFloat(todayH) : null,
    notes:           document.getElementById('task-notes')?.value.trim() || '',
    task_category:   document.getElementById('task-task-category')?.value || 'タスク管理',
  };
  try {
    id ? await API.patch('tasks', id, payload) : await API.post('tasks', payload);
    const modal = document.getElementById('modal-task');
    if (modal) modal.style.display = 'none';
    showToast(id ? 'タスクを更新しました' : 'タスクを追加しました', 'success');
    await loadTasks();
  } catch(e) { showToast('保存に失敗しました', 'error'); }
}

async function deleteTask() {
  const id = document.getElementById('task-id')?.value || '';
  if (!id || !confirm('このタスクを削除しますか？')) return;
  try {
    await API.delete('tasks', id);
    const modal = document.getElementById('modal-task');
    if (modal) modal.style.display = 'none';
    showToast('タスクを削除しました', 'success');
    await loadTasks();
  } catch(e) { showToast('削除に失敗しました', 'error'); }
}

document.getElementById('headerAddBtn')?.addEventListener('click', () => {
  if (currentPage === 'tasks') openTaskModal();
});
document.getElementById('task-save-btn')?.addEventListener('click', saveTask);
document.getElementById('task-delete-btn')?.addEventListener('click', deleteTask);

/* ============================================================
   新店情報（Shop Information）
   ============================================================ */

let _siInited    = false;
let _siEditId    = null;
let _siCalTarget = null;
let _siCalYear   = null;
let _siCalMonth  = null;
let _siCalStartStr = '';
let _siCalEndStr   = '';

function _initShopInfoOnce() {
  if (_siInited) return;
  _siInited = true;
  _renderShopInfoTable();

  // 追加ボタン
  document.getElementById('si-add-btn')?.addEventListener('click', () => {
    _siEditId = null; _siCalStartStr = ''; _siCalEndStr = '';
    _siClearForm(); _siOpenModal();
  });

  // イベント委譲：編集・削除
  const tbody = document.getElementById('si-tbody');
  if (!tbody) return;
  tbody.addEventListener('click', async e => {
    const editBtn = e.target.closest('.si-btn-edit');
    if (editBtn) { await _siOpenEdit(editBtn.dataset.id); return; }
    const delBtn = e.target.closest('.si-btn-del');
    if (delBtn) {
      if (!confirm('この新店情報を削除しますか？')) return;
      try {
        await API.delete('shop_info', delBtn.dataset.id);
        showToast('削除しました');
        _renderShopInfoTable();
      } catch(e) { showToast('削除に失敗しました', 'error'); }
    }
  });

  // モーダル保存
  document.getElementById('si-modal-save-btn')?.addEventListener('click', async () => {
    const storeName = document.getElementById('si-store-name')?.value.trim() || '';
    if (!storeName) { showToast('店舗名を入力してください', 'error'); return; }
    const payload = {
      store_name:            storeName,
      construction_period:   _siFormatRange(),
      open_date:             document.getElementById('si-open-date')?.value.trim() || '',
      reception:             document.getElementById('si-reception')?.value.trim() || '',
      sponsor:               document.getElementById('si-sponsor')?.value.trim() || '',
      notes:                 document.getElementById('si-notes')?.value.trim() || '',
    };
    try {
      if (_siEditId) {
        await API.patch('shop_info', _siEditId, payload);
        showToast('更新しました');
      } else {
        await API.post('shop_info', payload);
        showToast('登録しました');
      }
      document.getElementById('modal-shop-info')?.classList.remove('open');
      _renderShopInfoTable();
    } catch(e) { showToast('保存に失敗しました', 'error'); }
  });
}

async function _siOpenEdit(id) {
  try {
    const res = await API.getOne('shop_info', id);
    const r   = res?.data ?? res ?? {};
    _siEditId = id;
    const period = r.construction_period || '';
    const parts  = period.split('〜');
    _siCalStartStr = _siDateParse(parts[0] || '');
    _siCalEndStr   = _siDateParse(parts[1] || '');
    _siClearForm();
    const setV = (eid, v) => { const el = document.getElementById(eid); if (el) el.value = v || ''; };
    setV('si-store-name', r.store_name);
    _siUpdateDateInputs();
    setV('si-open-date',   r.open_date);
    setV('si-reception',   r.reception);
    setV('si-sponsor',     r.sponsor);
    setV('si-notes',       r.notes);
    _siOpenModal();
  } catch(e) { showToast('読み込みに失敗しました', 'error'); }
}

function _siOpenModal() {
  document.getElementById('modal-shop-info')?.classList.add('open');
}

function _siClearForm() {
  ['si-store-name','si-con-start','si-con-end','si-open-date','si-reception','si-sponsor','si-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function _siUpdateDateInputs() {
  const startEl = document.getElementById('si-con-start');
  const endEl   = document.getElementById('si-con-end');
  if (startEl) startEl.value = _siCalStartStr ? _siDateFmt(_siCalStartStr) : '';
  if (endEl)   endEl.value   = _siCalEndStr   ? _siDateFmt(_siCalEndStr)   : '';
}

function _siFormatRange() {
  const s = _siCalStartStr ? _siDateFmt(_siCalStartStr) : '';
  const e = _siCalEndStr   ? _siDateFmt(_siCalEndStr)   : '';
  return s && e ? `${s}〜${e}` : s || e;
}

function _siDateFmt(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  return `${y}年${String(m).padStart(2,'0')}月${String(d).padStart(2,'0')}日`;
}

function _siDateParse(disp) {
  if (!disp) return '';
  const m = disp.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!m) return '';
  return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
}

async function _renderShopInfoTable() {
  const tbody = document.getElementById('si-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="si-empty"><i class="fas fa-spinner fa-spin"></i> 読み込み中...</td></tr>';
  try {
    const res  = await API.get('shop_info', { limit: 200, sort: 'sort_order' });
    const rows = (Array.isArray(res.data) ? res.data : []).filter(r => !r.deleted)
      .sort((a, b) => ((a.sort_order || 0) - (b.sort_order || 0)) || ((a.created_at || 0) - (b.created_at || 0)));

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="si-empty">新店情報がありません</td></tr>';
      return;
    }

    const parseOpenDate = str => {
      if (!str) return null;
      const m = str.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
      if (m) return new Date(`${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`);
      const d = new Date(str + 'T00:00:00');
      return isNaN(d.getTime()) ? null : d;
    };

    const now    = new Date(); now.setHours(0,0,0,0);
    const MS_1M  = 30 * 24 * 60 * 60 * 1000;
    const MS_2M  = 60 * 24 * 60 * 60 * 1000;
    const rowCls = r => {
      const d = parseOpenDate(r.open_date);
      if (!d) return '';
      const diff = d - now;
      if (diff < 0) return '';
      if (diff <= MS_1M) return 'si-row--open-soon2';
      if (diff <= MS_2M) return 'si-row--open-soon1';
      return '';
    };

    tbody.innerHTML = rows.map(r => `
      <tr data-id="${escHtml(r.id)}" class="si-row ${rowCls(r)}">
        <td class="si-cell si-cell--name">
          <span class="si-drag-handle" title="ドラッグで並び替え"><i class="fas fa-grip-vertical"></i></span>
          ${escHtml(r.store_name || '—')}
        </td>
        <td class="si-cell">${escHtml(r.construction_period || '—')}</td>
        <td class="si-cell">${escHtml(r.open_date || '—')}</td>
        <td class="si-cell">${escHtml(r.reception || '—')}</td>
        <td class="si-cell si-cell--sponsor">${escHtml(r.sponsor || '—')}</td>
        <td class="si-cell si-act-cell">
          <button class="si-btn-edit" data-id="${escHtml(r.id)}" title="編集"><i class="fas fa-pen"></i></button>
          <button class="si-btn-del"  data-id="${escHtml(r.id)}" title="削除"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`).join('');
  } catch(e) {
    tbody.innerHTML = '<tr><td colspan="6" class="si-empty">読み込みに失敗しました</td></tr>';
  }
}

/* ============================================================
   DB バックアップ
   ============================================================ */

const BACKUP_TABLES = [
  'tasks', 'accounts', 'company_info', 'quick_links', 'announcements', 'shop_info', 'daily_work_logs',
];

async function fetchAllRecords(tableName) {
  const PAGE = 500;
  let page = 1, all = [];
  while (true) {
    const res = await fetch(`tables/${tableName}?limit=${PAGE}&page=${page}`);
    if (!res.ok) throw new Error(`${tableName}: HTTP ${res.status}`);
    const json = await res.json();
    const rows = json.data || [];
    all = all.concat(rows);
    if (all.length >= (json.total || 0) || rows.length < PAGE) break;
    page++;
  }
  return all;
}

function openBackupModal() {
  const modal = document.getElementById('backupModal');
  if (!modal) return;
  const listEl = document.getElementById('backupTableList');
  if (listEl) {
    listEl.innerHTML = BACKUP_TABLES.map(t =>
      `<div class="backup-table-row" id="btr-${t}">
        <i class="fas fa-circle backup-table-icon backup-table-icon--idle"></i>
        <span class="backup-table-name">${t}</span>
        <span class="backup-table-count" id="btc-${t}">—</span>
      </div>`
    ).join('');
  }
  const progressW = document.getElementById('backupProgressWrap');
  const fillEl    = document.getElementById('backupProgressFill');
  const labelEl   = document.getElementById('backupProgressLabel');
  const startBtn  = document.getElementById('backupStartBtn');
  if (progressW) progressW.style.display = 'none';
  if (fillEl)    fillEl.style.width = '0%';
  if (labelEl)   labelEl.textContent = '準備中...';
  if (startBtn)  { startBtn.disabled = false; startBtn.innerHTML = '<i class="fas fa-download"></i> バックアップ開始'; }
  modal.style.display = 'flex';
}

async function runBackup() {
  const startBtn  = document.getElementById('backupStartBtn');
  const fillEl    = document.getElementById('backupProgressFill');
  const labelEl   = document.getElementById('backupProgressLabel');
  const progressW = document.getElementById('backupProgressWrap');
  if (startBtn) { startBtn.disabled = true; startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 取得中...'; }
  if (progressW) progressW.style.display = 'block';

  const backup = { version: '2.0', app: 'C-CORE Standalone', created_at: new Date().toISOString(), tables: {} };
  const total = BACKUP_TABLES.length;
  let done = 0;

  for (const tableName of BACKUP_TABLES) {
    const iconEl  = document.getElementById(`btr-${tableName}`)?.querySelector('.backup-table-icon');
    const countEl = document.getElementById(`btc-${tableName}`);
    if (iconEl)  iconEl.className = 'fas fa-spinner fa-spin backup-table-icon backup-table-icon--loading';
    if (labelEl) labelEl.textContent = `取得中: ${tableName} (${done + 1}/${total})`;
    try {
      const rows = await fetchAllRecords(tableName);
      backup.tables[tableName] = rows;
      if (iconEl)  iconEl.className = 'fas fa-check-circle backup-table-icon backup-table-icon--done';
      if (countEl) countEl.textContent = `${rows.length} 件`;
    } catch(e) {
      backup.tables[tableName] = [];
      if (iconEl)  iconEl.className = 'fas fa-exclamation-circle backup-table-icon backup-table-icon--error';
      if (countEl) countEl.textContent = 'エラー';
    }
    done++;
    if (fillEl) fillEl.style.width = `${Math.round((done / total) * 100)}%`;
  }

  if (labelEl) labelEl.textContent = 'ファイルを生成中...';
  const now   = new Date();
  const pad   = n => String(n).padStart(2, '0');
  const fname = `ccore_standalone_backup_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.json`;
  const blob  = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  if (fillEl)  fillEl.style.width = '100%';
  if (labelEl) labelEl.textContent = `✅ 完了 — ${fname}`;
  if (startBtn) { startBtn.disabled = false; startBtn.innerHTML = '<i class="fas fa-check"></i> 完了'; }
  showToast(`バックアップを保存しました：${fname}`, 'success');
}

document.getElementById('navBackupBtn')?.addEventListener('click', openBackupModal);
document.getElementById('backupModalClose')?.addEventListener('click', () => {
  document.getElementById('backupModal').style.display = 'none';
});
document.getElementById('backupCancelBtn')?.addEventListener('click', () => {
  document.getElementById('backupModal').style.display = 'none';
});
document.getElementById('backupStartBtn')?.addEventListener('click', runBackup);
document.getElementById('backupModal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('backupModal')) {
    document.getElementById('backupModal').style.display = 'none';
  }
});

/* ============================================================
   初期化
   ============================================================ */
navigateTo('tasks');
