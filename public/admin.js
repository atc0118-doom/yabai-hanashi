// public/admin.js
// ORACLEと同じ ?admin=doom 方式(サーバーサイド認証なし)の管理画面。
// URLに ?admin=doom が付いていない場合はガード表示のみ行う(あくまで簡易的な目隠し)。

const params = new URLSearchParams(location.search);
const isAdmin = params.get('admin') === 'doom';

const CATEGORIES = ['UFO', '都市伝説', '陰謀論', 'オカルト', 'ミステリー', '未確認生物'];

const state = {
  status: 'draft',
  articles: [],
};

const guard = document.getElementById('admin-guard');
const content = document.getElementById('admin-content');
const list = document.getElementById('admin-list');
const emptyState = document.getElementById('admin-empty');
const tabs = document.querySelectorAll('.admin-tab');
const refreshBtn = document.getElementById('refresh-btn');
const statusMsg = document.getElementById('admin-status-msg');
const draftCountEl = document.getElementById('draft-count');
const publishedCountEl = document.getElementById('published-count');
const overlay = document.getElementById('edit-overlay');
const panel = document.getElementById('edit-panel');

init();

function init() {
  if (!isAdmin) {
    guard.hidden = false;
    content.hidden = true;
    return;
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      state.status = tab.dataset.status;
      renderList();
    });
  });

  refreshBtn.addEventListener('click', loadAll);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeEdit();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeEdit();
  });

  loadAll();
}

async function loadAll() {
  setStatusMsg('読み込み中…');
  try {
    const res = await fetch('/api/articles?admin=doom');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.articles = data.articles || [];
    updateCounts();
    renderList();
    setStatusMsg('');
  } catch (err) {
    setStatusMsg('読み込みに失敗しました');
    console.error(err);
  }
}

function updateCounts() {
  draftCountEl.textContent = state.articles.filter((a) => a.status === 'draft').length;
  publishedCountEl.textContent = state.articles.filter((a) => a.status === 'published').length;
}

function setStatusMsg(msg) {
  statusMsg.textContent = msg;
}

function renderList() {
  const filtered = state.articles.filter((a) => a.status === state.status);
  list.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  // 新しい順
  filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  for (const article of filtered) {
    list.appendChild(buildItem(article));
  }
}

function buildItem(article) {
  const item = document.createElement('div');
  item.className = 'admin-item';

  const dateStr = article.createdAt ? new Date(article.createdAt).toLocaleString('ja-JP') : '-';

  item.innerHTML = `
    <div class="admin-item-top">
      <span class="admin-item-meta">${escapeHtml(article.category || '未分類')} ／ 都市伝説度 ${article.legendScore ?? '-'}</span>
    </div>
    ${article.hook ? `<p class="card-hook">${escapeHtml(article.hook)}</p>` : ''}
    <h3 class="admin-item-title">${escapeHtml(article.title)}</h3>
    <div class="admin-item-meta">出典: ${escapeHtml(article.sourceName || '不明')} ／ 収集日時: ${dateStr}</div>
    <p class="admin-item-summary">${escapeHtml(article.summary || '')}</p>
    <div class="admin-item-actions"></div>
  `;

  const actions = item.querySelector('.admin-item-actions');

  const editBtn = makeButton('編集', 'admin-btn-ghost', () => openEdit(article));
  actions.appendChild(editBtn);

  const sourceLink = document.createElement('a');
  sourceLink.href = article.sourceUrl;
  sourceLink.target = '_blank';
  sourceLink.rel = 'noopener noreferrer';
  sourceLink.className = 'admin-btn admin-btn-ghost';
  sourceLink.textContent = '元記事を見る';
  actions.appendChild(sourceLink);

  if (article.status === 'draft') {
    actions.appendChild(makeButton('公開する', 'admin-btn', () => publish(article.id)));
  } else {
    actions.appendChild(makeButton('下書きに戻す', 'admin-btn-ghost', () => unpublish(article.id)));
  }

  actions.appendChild(makeButton('削除', 'admin-btn-danger', () => remove(article.id, article.title)));

  return item;
}

function makeButton(label, cls, onClick) {
  const btn = document.createElement('button');
  btn.className = `admin-btn ${cls}`;
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

async function publish(id) {
  await patchArticle(id, { status: 'published' });
}

async function unpublish(id) {
  await patchArticle(id, { status: 'draft' });
}

async function patchArticle(id, patch) {
  setStatusMsg('更新中…');
  try {
    const res = await fetch('/api/articles?admin=doom', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await loadAll();
  } catch (err) {
    setStatusMsg('更新に失敗しました');
    console.error(err);
  }
}

async function remove(id, title) {
  if (!confirm(`「${title}」を完全に削除します。よろしいですか?`)) return;
  setStatusMsg('削除中…');
  try {
    const res = await fetch('/api/articles?admin=doom', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await loadAll();
  } catch (err) {
    setStatusMsg('削除に失敗しました');
    console.error(err);
  }
}

function openEdit(article) {
  panel.innerHTML = `
    <button class="detail-close" aria-label="閉じる">✕ 閉じる</button>
    <h2>記事を編集</h2>
    <div class="edit-form">
      <label for="edit-title">タイトル</label>
      <input id="edit-title" type="text" value="${escapeAttr(article.title)}">

      <label for="edit-hook">煽り見出し(hook・20文字前後)</label>
      <input id="edit-hook" type="text" value="${escapeAttr(article.hook || '')}">

      <label for="edit-category">カテゴリ</label>
      <select id="edit-category">
        ${CATEGORIES.map((c) => `<option value="${c}" ${c === article.category ? 'selected' : ''}>${c}</option>`).join('')}
      </select>

      <label for="edit-score">都市伝説度 (0-100)</label>
      <input id="edit-score" type="number" min="0" max="100" value="${article.legendScore ?? 50}">

      <label for="edit-summary">要約</label>
      <textarea id="edit-summary">${escapeHtml(article.summary || '')}</textarea>

      <label for="edit-tags">タグ(カンマ区切り)</label>
      <input id="edit-tags" type="text" value="${escapeAttr((article.tags || []).join(', '))}">

      <div class="edit-form-actions">
        <button class="admin-btn" id="edit-save-btn">保存</button>
        <button class="admin-btn admin-btn-ghost" id="edit-cancel-btn">キャンセル</button>
      </div>
    </div>
  `;

  panel.querySelector('.detail-close').addEventListener('click', closeEdit);
  panel.querySelector('#edit-cancel-btn').addEventListener('click', closeEdit);
  panel.querySelector('#edit-save-btn').addEventListener('click', async () => {
    const patch = {
      title: panel.querySelector('#edit-title').value.trim(),
      hook: panel.querySelector('#edit-hook').value.trim(),
      category: panel.querySelector('#edit-category').value,
      legendScore: Number(panel.querySelector('#edit-score').value),
      summary: panel.querySelector('#edit-summary').value.trim(),
      tags: panel.querySelector('#edit-tags').value.split(',').map((t) => t.trim()).filter(Boolean),
    };
    closeEdit();
    await patchArticle(article.id, patch);
  });

  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeEdit() {
  overlay.hidden = true;
  document.body.style.overflow = '';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, '&#39;');
}
