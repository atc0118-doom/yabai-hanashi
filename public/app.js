// public/app.js
// /api/articles から公開済み記事を取得し、ドシエ風カードとして描画する。

const state = {
  articles: [],
  activeCategory: '',
};

const grid = document.getElementById('file-grid');
const emptyState = document.getElementById('empty-state');
const countLabel = document.getElementById('article-count');
const filterRow = document.getElementById('category-filters');
const overlay = document.getElementById('detail-overlay');
const detailPanel = document.getElementById('detail-panel');

init();

async function init() {
  filterRow.addEventListener('click', onFilterClick);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeDetail();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetail();
  });

  await loadArticles();
}

async function loadArticles(category) {
  try {
    const url = category ? `/api/articles?category=${encodeURIComponent(category)}` : '/api/articles';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.articles = data.articles || [];
    render();
  } catch (err) {
    grid.innerHTML = '';
    emptyState.hidden = false;
    emptyState.querySelector('p').textContent = 'ファイルの取得中にエラーが発生しました。時間をおいて再度お試しください。';
    console.error(err);
  }
}

function onFilterClick(e) {
  const btn = e.target.closest('.filter-chip');
  if (!btn) return;
  [...filterRow.children].forEach((c) => c.classList.remove('is-active'));
  btn.classList.add('is-active');
  state.activeCategory = btn.dataset.category || '';
  loadArticles(state.activeCategory);
}

function render() {
  countLabel.textContent = state.articles.length;
  grid.innerHTML = '';

  if (state.articles.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  for (const article of state.articles) {
    grid.appendChild(buildCard(article));
  }
}

function classification(legendScore) {
  if (legendScore >= 76) return { label: 'TOP SECRET / 都市伝説', className: 'stamp-legend' };
  if (legendScore >= 51) return { label: '機密', className: 'stamp-classified' };
  if (legendScore >= 26) return { label: '未確定', className: 'stamp-unconfirmed' };
  return { label: '検証可能', className: 'stamp-verified' };
}

function buildCard(article) {
  const card = document.createElement('article');
  card.className = 'file-card';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `${article.title} の詳細を開く`);

  const stamp = classification(article.legendScore ?? 0);

  card.innerHTML = `
    <div class="card-top-row">
      <span class="card-category">${escapeHtml(article.category || '未分類')}</span>
      <span class="classification-stamp ${stamp.className}">${stamp.label}</span>
    </div>
    ${article.hook ? `<p class="card-hook">${escapeHtml(article.hook)}</p>` : ''}
    <h3 class="card-title">${escapeHtml(article.title)}</h3>
    <p class="card-summary">${escapeHtml(article.summary || '')}</p>
    <div class="card-tags">
      ${(article.tags || []).slice(0, 4).map((t) => `<span class="redact-tag">${escapeHtml(t)}</span>`).join('')}
    </div>
    <div class="card-source">出典: ${escapeHtml(article.sourceName || '不明')}</div>
  `;

  card.addEventListener('click', () => openDetail(article));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDetail(article);
    }
  });

  return card;
}

function openDetail(article) {
  const stamp = classification(article.legendScore ?? 0);
  detailPanel.innerHTML = `
    <button class="detail-close" aria-label="閉じる">✕ 閉じる</button>
    <span class="classification-stamp ${stamp.className}">${stamp.label}</span>
    ${article.hook ? `<p class="card-hook">${escapeHtml(article.hook)}</p>` : ''}
    <h2>${escapeHtml(article.title)}</h2>
    <div class="meta-line">
      カテゴリ: ${escapeHtml(article.category || '未分類')} ／
      都市伝説度: ${article.legendScore ?? '-'} ／
      出典: ${escapeHtml(article.sourceName || '不明')}
    </div>
    <p>${escapeHtml(article.summary || '')}</p>
    <div class="card-tags">
      ${(article.tags || []).map((t) => `<span class="redact-tag">${escapeHtml(t)}</span>`).join('')}
    </div>
    <a class="source-link" href="${escapeAttr(article.sourceUrl)}" target="_blank" rel="noopener noreferrer">
      → 元情報を確認する
    </a>
  `;
  detailPanel.querySelector('.detail-close').addEventListener('click', closeDetail);
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeDetail() {
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
