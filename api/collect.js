// api/collect.js
// Vercel Cron (vercel.json参照) から毎日1回(日本時間 朝6:00)呼ばれる収集バッチ。
// 手動実行したい場合は /api/collect?admin=doom&manual=1 にGETでアクセスする。

import { collectCandidates, hashUrl } from '../lib/sources.js';
import { analyzeArticle } from '../lib/openai.js';
import { articleExists, saveArticle } from '../lib/storage.js';

const MAX_ANALYZE_PER_RUN = 15; // OpenAI呼び出し数を1回の実行あたり制限(コスト管理)

export default async function handler(req, res) {
  // Vercel Cronからの呼び出しは自動的に許可。手動実行はadmin確認する。
  const isCron = req.headers['x-vercel-cron'] === '1' || req.headers['x-vercel-cron'] !== undefined;
  const isManualAdmin = req.query.admin === 'doom' && req.query.manual === '1';

  if (!isCron && !isManualAdmin) {
    return res.status(403).json({ error: 'このエンドポイントは手動アクセスできません' });
  }

  try {
    const candidates = await collectCandidates();

    const newCandidates = [];
    for (const c of candidates) {
      const id = hashUrl(c.link);
      if (await articleExists(id)) continue;
      newCandidates.push({ ...c, id });
    }

    const toAnalyze = newCandidates.slice(0, MAX_ANALYZE_PER_RUN);
    const saved = [];
    const failed = [];

    for (const candidate of toAnalyze) {
      try {
        const analysis = await analyzeArticle({
          title: candidate.title,
          body: candidate.body || '',
          sourceType: candidate.sourceType,
        });

        const article = {
          id: candidate.id,
          title: candidate.title,
          sourceUrl: candidate.link,
          sourceType: candidate.sourceType,
          sourceName: candidate.sourceName,
          category: analysis.category,
          legendScore: analysis.legendScore,
          summary: analysis.summary,
          tags: analysis.tags || [],
          status: 'draft', // 必ず下書きとして保存。公開は管理画面から手動で行う。
          originalLanguage: candidate.sourceType === 'reddit' ? 'en' : 'ja',
          createdAt: Date.now(),
          publishedAt: null,
        };

        await saveArticle(article);
        saved.push(article.id);
      } catch (err) {
        failed.push({ title: candidate.title, error: err.message });
      }
    }

    return res.status(200).json({
      scanned: candidates.length,
      newFound: newCandidates.length,
      analyzed: toAnalyze.length,
      saved: saved.length,
      failed,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
