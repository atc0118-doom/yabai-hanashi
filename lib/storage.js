// lib/storage.js
// 記事データの保存・取得ロジック。
//
// 【重要】Vercel KV製品は廃止されたため、Vercel MarketplaceのUpstash Redis統合を使う。
// 統合方法によって環境変数名が KV_REST_API_URL/TOKEN だったり
// UPSTASH_REDIS_REST_URL/TOKEN だったりするため、両方に対応する。

import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  throw new Error(
    'Redis接続情報が見つかりません。VercelのStorageタブでUpstash(Redis)を作成し、プロジェクトに接続してください。'
  );
}

const redis = new Redis({ url, token });

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
 *   hook: string,             // カード見出し上に出す20文字前後の煽り一言(トカナ/ムー/YouTube風)
 *   summary: string,          // 日本語要約(ナオキマン/ムー風の語り口)
 *   tags: string[],
 *   status: 'draft' | 'published',
 *   originalLanguage: 'ja' | 'en',
 *   createdAt: number,        // epoch ms
 *   publishedAt: number | null
 * }
 */

export async function articleExists(id) {
  const existing = await redis.get(`article:${id}`);
  return existing !== null && existing !== undefined;
}

export async function saveArticle(article) {
  await redis.set(`article:${article.id}`, article);
  await redis.zadd(INDEX_KEY, { score: article.createdAt, member: article.id });
  return article;
}

export async function getArticle(id) {
  return redis.get(`article:${id}`);
}

export async function updateArticle(id, patch) {
  const current = await redis.get(`article:${id}`);
  if (!current) return null;
  const updated = { ...current, ...patch };
  await redis.set(`article:${id}`, updated);
  return updated;
}

export async function deleteArticle(id) {
  await redis.del(`article:${id}`);
  await redis.zrem(INDEX_KEY, id);
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
  const ids = await redis.zrange(INDEX_KEY, offset, offset + limit - 1, { rev: true });
  if (!ids || ids.length === 0) return [];

  const articles = await Promise.all(ids.map((id) => redis.get(`article:${id}`)));
  return articles
    .filter(Boolean)
    .filter((a) => (status === 'all' ? true : a.status === status))
    .filter((a) => (category ? a.category === category : true));
}
