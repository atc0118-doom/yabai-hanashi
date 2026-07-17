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
];

export const REDDIT_SUBREDDITS = ['conspiracy', 'HighStrangeness', 'Paranormal'];

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

  return results;
}
