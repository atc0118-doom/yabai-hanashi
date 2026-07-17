// api/articles.js
// GET  /api/articles                        -> 公開済み記事一覧
// GET  /api/articles?category=UFO           -> カテゴリ絞り込み
// GET  /api/articles?id=xxxx                -> 単体記事取得(公開済みのみ)
// GET  /api/articles?admin=doom              -> 下書き含む全件(管理用。ORACLEと同じURLパラメータ方式)
// GET  /api/articles?admin=doom&id=xxxx      -> 下書きも含めて単体取得
// PATCH /api/articles?admin=doom             -> body: {id, status?, title?, summary?, category?, legendScore?, tags?}
// DELETE /api/articles?admin=doom            -> body: {id}
//
// 注意: ORACLEと同様にサーバーサイド認証は行わず、URLパラメータ方式(?admin=doom)を踏襲。
// 公開範囲は最小限にし、本格運用する場合は簡易パスワード等の追加を検討すること。

import {
  listArticles,
  getArticle,
  updateArticle,
  deleteArticle,
} from '../lib/storage.js';

export default async function handler(req, res) {
  const isAdmin = req.query.admin === 'doom';

  if (req.method === 'GET') {
    const { id, category } = req.query;

    if (id) {
      const article = await getArticle(id);
      if (!article) return res.status(404).json({ error: '記事が見つかりません' });
      if (article.status !== 'published' && !isAdmin) {
        return res.status(404).json({ error: '記事が見つかりません' });
      }
      return res.status(200).json(article);
    }

    const articles = await listArticles({
      status: isAdmin ? 'all' : 'published',
      category: category || undefined,
      limit: 100,
    });
    return res.status(200).json({ articles, count: articles.length });
  }

  if (req.method === 'PATCH') {
    if (!isAdmin) return res.status(403).json({ error: '権限がありません' });
    const { id, ...patch } = req.body || {};
    if (!id) return res.status(400).json({ error: 'idが必要です' });

    if (patch.status === 'published' && !patch.publishedAt) {
      patch.publishedAt = Date.now();
    }

    const updated = await updateArticle(id, patch);
    if (!updated) return res.status(404).json({ error: '記事が見つかりません' });
    return res.status(200).json(updated);
  }

  if (req.method === 'DELETE') {
    if (!isAdmin) return res.status(403).json({ error: '権限がありません' });
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'idが必要です' });
    await deleteArticle(id);
    return res.status(200).json({ deleted: id });
  }

  return res.status(405).json({ error: 'サポートされていないメソッドです' });
}
