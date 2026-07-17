// lib/sources.js
// Google News RSS と Reddit の公開JSONエンドポイントから記事候補を収集する。
// どちらも認証不要(Redditは適切なUser-Agentが必須)。

import { createHash } from 'node:crypto';

export const GOOGLE_NEWS_KEYWORDS = [
  '都市伝説',
  '陰謀論',
  'UFO 目撃',
  '未確認生物',
  'オカルト 事件',
  '心霊 現象',
  '心霊スポット',
  '謎の失踪',
  '呪いの噂',
  '怪奇現象',
  '未解決事件 謎',
  '廃墟 心霊',
];

export const REDDIT_SUBREDDITS = ['conspiracy', 'HighStrangeness', 'Paranormal'];

// Wikipedia日本語版の該当カテゴリ。ニュースと違い「今話題」ではなく
// 定番・古典的な都市伝説/陰謀論をアーカイブとして拾うためのソース。
export const WIKIPEDIA_CATEGORIES = ['都市伝説', '未確認動物', '陰謀論', '心霊スポット', '日本の未解決事件'];

// タイトルにこれらの語が含まれる場合、都市伝説そのものではなく「都市伝説を題材にした
// 映画/アニメ/アトラクション等」の可能性が高いため、AI分析にかける前の時点で除外する。
const JUNK_TITLE_KEYWORDS = [
  '映画', 'アニメ化', 'アニメ', 'ドラマ化', 'ドラマ', 'ゲーム化', 'ゲーム',
  '舞台化', '舞台', 'ミュージカル', '漫画化', 'コミカライズ', 'アトラクション',
  'テーマパーク', '遊園地', 'グッズ', 'コラボ', '声優', '主演', '公開決定',
  '放送開始', '配信決定', 'テレビ番組', '特番', 'Blu-ray', 'DVD',
  // イベント告知・グッズ販売・観光PR系(「怪異そのもの」ではなく「怪異を使った催し物」)
  '展示会', 'ポップアップ', 'POP-UP', 'イベント開催', '募集開始', '募集中',
  'クラウドファンディング', 'ゆるキャラ', 'バスボール', 'ツアー', '観光',
  'ワークショップ', 'スタンプラリー', 'フェア開催', 'キャンペーン',
];

function isLikelyJunkTitle(title) {
  return JUNK_TITLE_KEYWORDS.some((kw) => title.includes(kw));
}

// Wikipediaの「用語そのものの定義記事」(個別の怪異エピソードではなく、辞書的な
// 説明・一覧ページ)は読み物として弱いため除外する。
const GENERIC_TERM_TITLES = new Set([
  '陰謀論', '陰謀論の一覧', '都市伝説', '都市伝説の一覧', '未確認生物',
  '未確認生物一覧', '未確認動物', '未確認動物学', 'UMA', '心霊スポット',
  'オカルト',
]);

function isGenericTermTitle(title) {
  return GENERIC_TERM_TITLES.has(title.trim());
}

/**
 * 複数メディアが同じ出来事を報じている場合、タイトルの先頭部分(装飾記号や
 * 媒体名サフィックスを除いた部分)がほぼ一致することが多い。これを簡易的な
 * 重複判定シグネチャとして使い、同一事象の重複記事を1件にまとめる。
 */
function dedupeSimilarTitles(candidates) {
  const seenSignatures = new Set();
  const result = [];

  for (const c of candidates) {
    const signature = normalizeTitleForDedup(c.title);
    if (seenSignatures.has(signature)) continue;
    seenSignatures.add(signature);
    result.push(c);
  }
  return result;
}

function normalizeTitleForDedup(title) {
  return title
    .replace(/【[^】]*】/g, '')
    .replace(/「[^」]*」/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[［\[][^］\]]*[］\]]/g, '')
    .split(/\s*[-|｜]\s*/)[0] // 末尾の " - 媒体名" を除去
    .replace(/\s+/g, '')
    .trim()
    .slice(0, 16);
}

export function hashUrl(url) {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

/**
 * Google News RSSは軽量なXMLなので、依存ライブラリを増やさず正規表現で
 * <item> ブロックを抜き出す。壊れにくいよう最低限のタグのみ対象。
 */
export async function fetchGoogleNews(keyword) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}&hl=ja&gl=JP&ceid=JP:ja`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CaseXFilesBot/1.0)' },
  });
  if (!res.ok) return [];
  const xml = await res.text();

  const items = [];
  const itemBlocks = xml.split('<item>').slice(1);
  for (const block of itemBlocks.slice(0, 10)) {
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    const pubDate = extractTag(block, 'pubDate');
    const source = extractTag(block, 'source');
    if (!title || !link) continue;
    items.push({
      title: decodeXmlEntities(title),
      link: link.trim(),
      pubDate,
      sourceName: source ? decodeXmlEntities(source) : 'Google News',
      sourceType: 'google_news',
      keyword,
    });
  }
  return items;
}

function extractTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  if (!match) return null;
  return match[1].replace('<![CDATA[', '').replace(']]>', '').trim();
}

function decodeXmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Redditの公開JSON ( /top.json ) を取得。OAuth不要だが、User-Agent必須。
 */
export async function fetchReddit(subreddit) {
  const url = `https://www.reddit.com/r/${subreddit}/top.json?limit=15&t=day`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CaseXFilesBot/1.0 (personal hobby project)' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const posts = data?.data?.children || [];

  return posts
    .map((p) => p.data)
    .filter((d) => d && !d.stickied && d.title)
    .map((d) => ({
      title: d.title,
      link: `https://reddit.com${d.permalink}`,
      pubDate: new Date(d.created_utc * 1000).toISOString(),
      sourceName: `r/${subreddit}`,
      sourceType: 'reddit',
      body: d.selftext?.slice(0, 1500) || '',
      keyword: subreddit,
    }));
}

/**
 * Wikipedia日本語版のカテゴリメンバー一覧を取得し、各記事の冒頭抜粋(extract)を
 * 並列取得する。ニュースと違い更新頻度が低い定番ネタなので、1カテゴリあたり
 * 取得件数を絞り(8件)、レスポンスを軽く保つ。
 */
async function fetchWikipediaCategory(category) {
  const listUrl = `https://ja.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(`Category:${category}`)}&cmlimit=20&format=json&origin=*`;
  const res = await fetch(listUrl, {
    headers: { 'User-Agent': 'CaseXFilesBot/1.0 (personal hobby project)' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const members = (data?.query?.categorymembers || []).filter((m) => m.ns === 0); // 通常記事のみ(サブカテゴリ等を除外)
  const targetPages = members.slice(0, 8);

  const extracts = await Promise.allSettled(targetPages.map((p) => fetchWikipediaExtract(p.title)));

  const results = [];
  targetPages.forEach((page, i) => {
    const r = extracts[i];
    if (r.status !== 'fulfilled' || !r.value) return;
    results.push({
      title: page.title,
      link: `https://ja.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
      pubDate: null,
      sourceName: 'Wikipedia',
      sourceType: 'wikipedia',
      body: r.value.slice(0, 1500),
      keyword: category,
    });
  });
  return results;
}

async function fetchWikipediaExtract(title) {
  const url = `https://ja.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&titles=${encodeURIComponent(title)}&format=json&origin=*`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CaseXFilesBot/1.0 (personal hobby project)' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data?.query?.pages || {};
  const page = Object.values(pages)[0];
  return page?.extract || null;
}

export async function collectCandidates() {
  const results = [];

  const newsResults = await Promise.allSettled(GOOGLE_NEWS_KEYWORDS.map(fetchGoogleNews));
  for (const r of newsResults) {
    if (r.status === 'fulfilled') results.push(...r.value);
  }

  const redditResults = await Promise.allSettled(REDDIT_SUBREDDITS.map(fetchReddit));
  for (const r of redditResults) {
    if (r.status === 'fulfilled') results.push(...r.value);
  }

  const wikipediaResults = await Promise.allSettled(WIKIPEDIA_CATEGORIES.map(fetchWikipediaCategory));
  for (const r of wikipediaResults) {
    if (r.status === 'fulfilled') results.push(...r.value);
  }

  const filtered = results.filter((c) => !isLikelyJunkTitle(c.title) && !isGenericTermTitle(c.title));
  return dedupeSimilarTitles(filtered);
}
