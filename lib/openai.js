// lib/openai.js
// 収集した記事候補をOpenAI APIに渡し、日本語要約・都市伝説度スコア・カテゴリ・タグを
// 構造化JSONで受け取るヘルパー。

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini'; // コスト重視。必要に応じて変更可能。

const SYSTEM_PROMPT = `あなたは都市伝説・陰謀論専門メディア「ヤバイハナシ.com」の編集アシスタントです。
与えられたニュース記事やSNS投稿の原文(英語または日本語)を分析し、以下のJSON形式で**のみ**出力してください。
前置き・Markdown装飾・コードブロックは一切不要です。

まず最初に、この内容が「都市伝説・未確認現象・陰謀論そのものについての話」か、それとも
「それらを題材にした映画・アニメ・ドラマ・ゲーム・アトラクション・グッズ・芸能人のトーク」
などの**二次利用・エンタメ消費の話**かを判定してください。後者の場合は isRelevant を false にし、
他のフィールドは適当な値で構いません(falseの場合は保存されず捨てられます)。

{
  "isRelevant": true または false (二次利用・エンタメコンテンツの紹介記事ならfalse),
  "summary": "日本語で3〜4文の要約(原文が英語の場合は日本語に翻訳しつつ要約)",
  "category": "UFO" | "都市伝説" | "陰謀論" | "オカルト" | "ミステリー" | "未確認生物",
  "legendScore": 0から100の整数 (100に近いほど荒唐無稽/娯楽的、0に近いほど実話・検証可能な事件に近い),
  "tags": ["タグ1", "タグ2", "タグ3"]
}`;

export async function analyzeArticle({ title, body, sourceType }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY が設定されていません');
  }

  const userContent = `タイトル: ${title}\n出典種別: ${sourceType}\n本文/抜粋:\n${body || '(本文なし。タイトルのみで判断)'}`;

  const res = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.4,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API エラー: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('OpenAIからの応答が空です');

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI応答のJSONパースに失敗: ${raw}`);
  }
}
