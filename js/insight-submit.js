/* ═══════════════════════════════════════════════════
   インサイト提出依頼 モーダル  (insight-submit.js)
   v20260917b32
═══════════════════════════════════════════════════ */
'use strict';

/* ── sns_insights が提出済みかを安全に判定 ──
   判定基準：
   {"Instagram":{"reach":null}} のようにキーだけあって値がnullのケースは未提出。
   reach / likes / comments / saves のいずれかが null/undefined でない
   数値（0以上）であれば提出済みとみなす。
   ── */
function _hasInsightData(val) {
  if (val === null || val === undefined) return false;

  // オブジェクト or JSON文字列をパースしてオブジェクトにする
  let obj = val;
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s || s === '{}' || s === '[]' || s === 'null' || s === 'undefined') return false;
    try { obj = JSON.parse(s); } catch (e) { return s.length > 0; }
  }

  if (typeof obj !== 'object' || obj === null) return Boolean(obj);

  // 各SNSプラットフォームを走査
  const METRIC_KEYS = ['reach', 'likes', 'comments', 'saves'];
  for (const platform of Object.values(obj)) {
    if (typeof platform !== 'object' || platform === null) continue;
    for (const key of METRIC_KEYS) {
      const v = platform[key];
      // null/undefined 以外で数値として有効なら提出済み（0でもOK）
      if (v !== null && v !== undefined && v !== '' && !isNaN(Number(v))) return true;
    }
  }
  return false;
}

/* ── モーダル開閉 ── */
function openInsightSubmitModal() {
  const modal = document.getElementById('modal-insight-submit');
  if (!modal) return;
  modal.style.display = '';
  modal.classList.add('open');
  _resetInsightModal();
}
function closeInsightSubmitModal() {
  const modal = document.getElementById('modal-insight-submit');
  if (!modal) return;
  modal.classList.remove('open');
  modal.style.display = 'none';
}

/* ── モーダル全体をリセット ── */
function _resetInsightModal() {
  const q  = document.getElementById('insight-inf-search');
  const df = document.getElementById('insight-date-from');
  const dt = document.getElementById('insight-date-to');
  if (q)  q.value  = '';
  if (df) df.value = '';
  if (dt) dt.value = '';
  _showInsightStep('search');
  _setInsightResultsHtml(`
    <div class="insight-results-placeholder">
      <i class="fas fa-search"></i>
      <p>インフルエンサー名を入力して「検索」を押してください<br><small>未入力の場合はすべて表示</small></p>
    </div>`);
  const tmpl = document.getElementById('insight-template-area');
  if (tmpl) tmpl.style.display = 'none';
}

/* ── ステップ切り替え ── */
function _showInsightStep(step) {
  const stepSearch   = document.getElementById('insight-step-search');
  const stepProjects = document.getElementById('insight-step-projects');
  if (stepSearch)   stepSearch.style.display   = (step === 'search')   ? '' : 'none';
  if (stepProjects) stepProjects.style.display = (step === 'projects') ? '' : 'none';
}

/* ── 結果エリアにHTMLをセット ── */
function _setInsightResultsHtml(html) {
  const area = document.getElementById('insight-results-area');
  if (area) area.innerHTML = html;
}

/* ════════════════════════════════════════════════════
   STEP 1: インフルエンサー一覧を検索・表示
   ※「確認」ボタンなし → 行クリックのみでSTEP2へ
════════════════════════════════════════════════════ */
async function _searchInsightInfluencers() {
  const q    = (document.getElementById('insight-inf-search')?.value || '').trim().toLowerCase();
  const area = document.getElementById('insight-results-area');
  if (!area) return;

  _setInsightResultsHtml('<div class="insight-loading"><i class="fas fa-spinner"></i> 検索中...</div>');

  try {
    const [infRes, piRes] = await Promise.all([
      Cache.get('influencers',        () => API.getAll('influencers')),
      Cache.get('projectInfluencers', () => API.getAll('project_influencers')),
    ]);
    const allInfs = infRes.data || [];
    const pis     = piRes.data  || [];

    /* 名前フィルター */
    let matched = q
      ? allInfs.filter(inf =>
          (inf.name      || '').toLowerCase().includes(q) ||
          (inf.sub_name  || '').toLowerCase().includes(q) ||
          (inf.real_name || '').toLowerCase().includes(q)
        )
      : allInfs;

    /* 来店済みアサインが1件以上あるインフルエンサーのみ */
    const infIdsWithVisit = new Set(
      pis.filter(pi => pi.visit_datetime).map(pi => pi.influencer_id)
    );
    matched = matched.filter(inf => infIdsWithVisit.has(inf.id));

    if (matched.length === 0) {
      _setInsightResultsHtml('<div class="insight-no-results"><i class="fas fa-user-slash"></i> 来店済みの案件があるインフルエンサーが見つかりません</div>');
      return;
    }

    const escH = _escH();
    let html = '<div class="insight-inf-select-list">';
    for (const inf of matched) {
      const initial    = (inf.name || '?').slice(0, 1);
      const avatarHtml = inf.avatar_image
        ? `<img src="${escH(inf.avatar_image)}" alt="${escH(initial)}">`
        : escH(initial);
      const visitCount = pis.filter(pi => pi.influencer_id === inf.id && pi.visit_datetime).length;
      const noInsightCount = pis.filter(pi =>
        pi.influencer_id === inf.id &&
        pi.visit_datetime &&
        !_hasInsightData(pi.sns_insights)
      ).length;
      const badge = noInsightCount > 0
        ? `<span class="insight-count-badge insight-count-badge--warn">${noInsightCount}件 未提出</span>`
        : `<span class="insight-count-badge insight-count-badge--ok">提出済</span>`;

      /* 「確認」ボタンなし・行全体をクリック可能に */
      html += `<div class="insight-inf-select-item" data-inf-id="${escH(inf.id)}" role="button" tabindex="0">
        <div class="insight-inf-avatar">${avatarHtml}</div>
        <div class="insight-inf-select-info">
          <div class="insight-inf-name">${escH(inf.name || '—')}</div>
          ${inf.sub_name ? `<div class="insight-inf-sub">${escH(inf.sub_name)}</div>` : ''}
        </div>
        <div class="insight-inf-select-meta">
          <span class="insight-visit-count">${visitCount}件 来店</span>
          ${badge}
        </div>
        <i class="fas fa-chevron-right insight-row-arrow"></i>
      </div>`;
    }
    html += '</div>';
    _setInsightResultsHtml(html);

    /* 行クリック（またはEnterキー）でSTEP2へ */
    area.querySelectorAll('.insight-inf-select-item').forEach(row => {
      const go = () => {
        const infId = row.getAttribute('data-inf-id');
        const inf   = matched.find(i => i.id === infId);
        if (inf) _showInsightProjects(inf, pis);
      };
      row.addEventListener('click', go);
      row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') go(); });
    });

  } catch (err) {
    _setInsightResultsHtml(`<div class="insight-no-results"><i class="fas fa-exclamation-triangle"></i> 取得エラー: ${_escH()(String(err))}</div>`);
  }
}

/* ════════════════════════════════════════════════════
   STEP 2: 未提出案件のみ一覧表示 ＋ チェックボックス
════════════════════════════════════════════════════ */
async function _showInsightProjects(inf, allPis) {
  const dateFrom  = document.getElementById('insight-date-from')?.value || '';
  const dateTo    = document.getElementById('insight-date-to')?.value   || '';
  const projPanel = document.getElementById('insight-step-projects');
  if (!projPanel) return;

  _showInsightStep('projects');

  /* 選択インフルエンサー名表示 */
  const nameEl = document.getElementById('insight-selected-inf-name');
  if (nameEl) {
    const escH = _escH();
    const initial    = (inf.name || '?').slice(0, 1);
    const avatarHtml = inf.avatar_image
      ? `<img src="${escH(inf.avatar_image)}" alt="${escH(initial)}">`
      : escH(initial);
    nameEl.innerHTML = `
      <div class="insight-inf-avatar" style="width:28px;height:28px;font-size:11px;">${avatarHtml}</div>
      <span>${escH(inf.name || '—')}</span>
      ${inf.sub_name ? `<span class="insight-inf-sub" style="font-size:11px;">${escH(inf.sub_name)}</span>` : ''}`;
  }

  /* テンプレートエリアを隠す */
  const tmplArea = document.getElementById('insight-template-area');
  if (tmplArea) tmplArea.style.display = 'none';

  const projListEl = document.getElementById('insight-proj-list');
  if (!projListEl) return;
  projListEl.innerHTML = '<div class="insight-loading"><i class="fas fa-spinner"></i> 読み込み中...</div>';

  try {
    const projRes = await Cache.get('projects', () => API.getAll('projects'));
    const projs   = projRes.data || [];
    const projMap = {};
    projs.forEach(p => { projMap[p.id] = p; });

    /* このインフルエンサーの来店済みアサインを取得 → 未提出のみ */
    let assigns = allPis.filter(pi =>
      pi.influencer_id === inf.id &&
      pi.visit_datetime &&
      !_hasInsightData(pi.sns_insights)
    );

    /* 期間フィルター */
    if (dateFrom) assigns = assigns.filter(pi => (pi.visit_datetime || '').slice(0, 10) >= dateFrom);
    if (dateTo)   assigns = assigns.filter(pi => (pi.visit_datetime || '').slice(0, 10) <= dateTo);

    if (assigns.length === 0) {
      projListEl.innerHTML = '<div class="insight-no-results"><i class="fas fa-check-circle" style="color:#16a34a;"></i> 未提出のインサイトはありません</div>';
      /* 提出依頼ボタンを無効化 */
      const requestBtn = document.getElementById('insight-proj-request-btn');
      if (requestBtn) requestBtn.disabled = true;
      return;
    }

    /* 提出依頼ボタンを有効化 */
    const requestBtn = document.getElementById('insight-proj-request-btn');
    if (requestBtn) requestBtn.disabled = false;

    const escH = _escH();

    /* 全選択チェックボックス付きヘッダー */
    let html = `
      <div class="insight-check-header">
        <label class="insight-check-all-label">
          <input type="checkbox" id="insight-check-all" checked>
          <span>すべて選択</span>
        </label>
        <span class="insight-check-count" id="insight-check-count">${assigns.length}件選択中</span>
      </div>
      <table class="insight-proj-table">
        <thead>
          <tr>
            <th class="insight-th-check"></th>
            <th>案件名</th>
            <th>来店日</th>
            <th>投稿日</th>
          </tr>
        </thead>
        <tbody>`;

    assigns.forEach((a, idx) => {
      const proj      = projMap[a.project_id] || {};
      const projName  = proj.product_name || proj.project_name || '—';
      const visitDate = a.visit_datetime ? a.visit_datetime.slice(0, 10).replace(/-/g, '/') : '—';
      const postDate  = a.post_date ? String(a.post_date).replace(/-/g, '/') : '—';
      html += `<tr class="insight-proj-row" data-assign-idx="${idx}">
        <td class="insight-td-check">
          <input type="checkbox" class="insight-proj-chk" data-assign-idx="${idx}" checked>
        </td>
        <td>${escH(projName)}</td>
        <td>${escH(visitDate)}</td>
        <td>${escH(postDate)}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    projListEl.innerHTML = html;

    /* 全選択チェックボックスの動作 */
    const checkAll = document.getElementById('insight-check-all');
    const updateCount = () => {
      const checked = projListEl.querySelectorAll('.insight-proj-chk:checked').length;
      const countEl = document.getElementById('insight-check-count');
      if (countEl) countEl.textContent = `${checked}件選択中`;
      if (requestBtn) requestBtn.disabled = (checked === 0);
    };
    if (checkAll) {
      checkAll.addEventListener('change', () => {
        projListEl.querySelectorAll('.insight-proj-chk').forEach(chk => {
          chk.checked = checkAll.checked;
        });
        updateCount();
      });
    }
    projListEl.querySelectorAll('.insight-proj-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        const total   = projListEl.querySelectorAll('.insight-proj-chk').length;
        const checked = projListEl.querySelectorAll('.insight-proj-chk:checked').length;
        if (checkAll) checkAll.checked = (checked === total);
        updateCount();
      });
    });

    /* 「提出依頼」ボタン → チェック済み案件のみテンプレート生成 */
    if (requestBtn) {
      requestBtn.onclick = () => {
        const checkedIdxs = new Set(
          Array.from(projListEl.querySelectorAll('.insight-proj-chk:checked'))
               .map(chk => parseInt(chk.getAttribute('data-assign-idx'), 10))
        );
        const selectedAssigns = assigns.filter((_, i) => checkedIdxs.has(i));
        _showInsightTemplateFromAssigns(inf.name || '', selectedAssigns, projMap);
      };
    }

  } catch (err) {
    projListEl.innerHTML = `<div class="insight-no-results"><i class="fas fa-exclamation-triangle"></i> エラー: ${_escH()(String(err))}</div>`;
  }
}

/* ════════════════════════════════════════════════════
   STEP 3: テンプレート生成・表示
════════════════════════════════════════════════════ */
function _showInsightTemplateFromAssigns(infName, noInsightAssigns, projMap) {
  const templateArea = document.getElementById('insight-template-area');
  const textarea     = document.getElementById('insight-template-text');
  if (!templateArea || !textarea) return;

  let projectLines = '';
  if (noInsightAssigns.length > 0) {
    noInsightAssigns.forEach((a, i) => {
      const proj      = projMap[a.project_id] || {};
      const projName  = proj.product_name || proj.project_name || '—';
      const visitDate = a.visit_datetime ? a.visit_datetime.slice(0, 10).replace(/-/g, '/') : '—';
      projectLines += `\n【案件${i + 1}】\n  案件名  : ${projName}\n  来店日  : ${visitDate}\n`;
    });
  } else {
    projectLines = '\n（対象案件はすべて提出済みです）\n';
  }

  textarea.value =
`${infName} 様

いつもお世話になっております。
この度はPRのご依頼をお引き受けいただき、誠にありがとうございます。

下記の案件につきまして、インサイトがまだご提出いただけていない状況でございます。
お手数をおかけしますが、インサイトのご提出をお願いいたします。
${projectLines}
なお、既にご提出済みの場合はご連絡が行き違いとなっておりますこと、誠に申し訳ございません。
ご多忙のところ大変恐れ入りますが、何卒よろしくお願いいたします。`;

  templateArea.style.display = 'block';
  const copyBtn = document.getElementById('insight-copy-btn');
  if (copyBtn) {
    copyBtn.innerHTML = '<i class="fas fa-copy"></i> コピー';
    copyBtn.classList.remove('copied');
  }
  templateArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ── escHtml ヘルパー ── */
function _escH() {
  return typeof escHtml === 'function'
    ? escHtml
    : (s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
}

/* ════════════════════════════════════════════════════
   初期化
════════════════════════════════════════════════════ */
function initInsightSubmitModal() {
  /* 開く */
  document.getElementById('btn-insight-submit')?.addEventListener('click', openInsightSubmitModal);
  /* 閉じる */
  document.getElementById('insight-modal-close')?.addEventListener('click', closeInsightSubmitModal);
  document.getElementById('modal-insight-submit')?.addEventListener('click', e => {
    if (e.target.id === 'modal-insight-submit') closeInsightSubmitModal();
  });

  /* 検索ボタン（STEP1） */
  document.getElementById('insight-search-btn')?.addEventListener('click', _searchInsightInfluencers);
  document.getElementById('insight-inf-search')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') _searchInsightInfluencers();
  });

  /* リセット */
  document.getElementById('insight-reset-btn')?.addEventListener('click', _resetInsightModal);

  /* STEP2 → STEP1 に戻る */
  document.getElementById('insight-back-to-search')?.addEventListener('click', () => {
    _showInsightStep('search');
    const tmpl = document.getElementById('insight-template-area');
    if (tmpl) tmpl.style.display = 'none';
  });

  /* コピーボタン */
  document.getElementById('insight-copy-btn')?.addEventListener('click', () => {
    const txt = document.getElementById('insight-template-text')?.value;
    if (!txt) return;
    navigator.clipboard.writeText(txt).then(() => {
      const btn = document.getElementById('insight-copy-btn');
      if (!btn) return;
      btn.innerHTML = '<i class="fas fa-check"></i> コピー済み';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.innerHTML = '<i class="fas fa-copy"></i> コピー';
        btn.classList.remove('copied');
      }, 2000);
    }).catch(() => {
      const ta = document.getElementById('insight-template-text');
      if (ta) { ta.select(); document.execCommand('copy'); }
      if (typeof showToast === 'function') showToast('コピーしました');
    });
  });

  /* テンプレートから案件一覧に戻る */
  document.getElementById('insight-back-btn')?.addEventListener('click', () => {
    const tmpl = document.getElementById('insight-template-area');
    if (tmpl) tmpl.style.display = 'none';
    document.getElementById('insight-step-projects')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initInsightSubmitModal);
} else {
  initInsightSubmitModal();
}
