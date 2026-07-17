// lib/storage.js
// Vercel KV (Upstash Redis) を使ったシンプルな記事ストレージ層。
// Vercelダッシュボードで "KV Database" を作成しプロジェクトに接続するだけで
// 環境変数 (KV_REST_API_URL / KV_REST_API_TOKEN) が自動設定される。
// コード側での追加設定は不要。

import { kv } from '@vercel/kv';

const INDEX_KEY = 'articles:index'; // 全記事IDのソート済みセット (score = createdAt)

/**
 * 記事オブジェクトのスキーマ:
 * {
 *   id: string,              // URLのハッシュ (重複防止)
 *   title: string,
 *   sourceUrl: string,
 *   sourceType: 'google_news' | 'reddit',
 *   sourceName: string,       // 例: "Yahoo!ニュース" や "r/conspiracy"
 *   category: string,         // 'UFO' | '都市伝説' | '陰謀論' | 'オカルト' | 'ミステリー' 等
 *   legendScore: number,      // 0-100 の「都市伝説度」スコア
 *   summary: string,          // 日本語要約
 *   tags: string[],
 *   status: 'draft' | 'published',
 *   originalLanguage: 'ja' | 'en',
 *   createdAt: number,        // epoch ms
 *   publishedAt: number | null
 * }
 */

export async function articleExists(id) {
  const existing = await kv.get(`article:${id}`);
  return existing !== null && existing !== undefined;
}

export async function saveArticle(article) {
  await kv.set(`article:${article.id}`, article);
  await kv.zadd(INDEX_KEY, { score: article.createdAt, member: article.id });
  return article;
}

export async function getArticle(id) {
  return kv.get(`article:${id}`);
}

export async function updateArticle(id, patch) {
  const current = await kv.get(`article:${id}`);
  if (!current) return null;
  const updated = { ...current, ...patch };
  await kv.set(`article:${id}`, updated);
  return updated;
}

export async function deleteArticle(id) {
  await kv.del(`article:${id}`);
  await kv.zrem(INDEX_KEY, id);
}

/**
 * @param {object} opts
 * @param {'draft'|'published'|'all'} opts.status
 * @param {string} [opts.category]
 * @param {number} [opts.limit]
 * @param {number} [opts.offset]
 */
export async function listArticles({ status = 'published', category, limit = 50, offset = 0 } = {}) {
  // 新しい順に取得
  const ids = await kv.zrange(INDEX_KEY, offset, offset + limit - 1, { rev: true });
  if (!ids || ids.length === 0) return [];

  const articles = await Promise.all(ids.map((id) => kv.get(`article:${id}`)));
  return articles
    .filter(Boolean)
    .filter((a) => (status === 'all' ? true : a.status === status))
    .filter((a) => (category ? a.category === category : true));
}
