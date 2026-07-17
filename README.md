# ヤバイハナシ.com

都市伝説・陰謀論・未確認情報を自動収集し、AIでスコアリング&要約して掲載する
個人開発のエンタメ・ダッシュボード。ORACLE(World Risk Intelligence)の姉妹プロジェクト。

## ファイル構成

```
yabai-hanashi/
├── package.json
├── vercel.json          # cron設定(日次実行。Hobbyプランのcron制限に対応)
├── api/
│   ├── collect.js       # 収集→AI分析→下書き保存
│   └── articles.js      # 一覧/単体取得・管理者用の公開/編集/削除
├── lib/
│   ├── storage.js       # Vercel KVを使ったデータ永続化
│   ├── sources.js       # Google News RSS / Reddit / Wikipedia からの収集ロジック
│   └── openai.js        # OpenAI APIでの要約・スコアリング
└── public/
    ├── index.html
    ├── style.css
    └── app.js
```

GitHub Web UIでこの構成を作る場合、ファイル作成画面の「ファイル名」欄に
`api/collect.js` のようにスラッシュ込みで入力すると、自動でフォルダが作られます。

## セットアップ手順(GitHub Web UI + Vercelダッシュボードのみ、CLI不使用)

1. **新規GitHubリポジトリを作成**(例: `yabai-hanashi`)。上記ファイルを1つずつ
   Web UIでコピー&ペーストして追加。

2. **Vercelで新規プロジェクトとしてインポート**。ORACLEとは別プロジェクトにする。

3. **Storage(Upstash Redis)を接続**(重要・これがないと記事が保存されない):
   - Vercelダッシュボード → 対象プロジェクト → **Storage** タブ
   - **Browse Marketplace** → 検索窓で「Upstash」→ **Upstash for Redis** を選んで追加
   - 接続後、環境変数(`KV_REST_API_URL` / `KV_REST_API_TOKEN`、または
     `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`)が自動的に設定される。
   - どちらの変数名になっても`lib/storage.js`側で両対応しているので、コード変更は不要。

4. **環境変数を追加**(Vercelダッシュボード → Settings → Environment Variables):
   - `OPENAI_API_KEY` — OpenAI APIキー

5. **再デプロイ**すれば完了。`vercel.json` のcron設定により毎日1回(UTC 21:00 = 日本時間 朝6:00)
   `/api/collect` が自動実行され、新規記事が「下書き」として蓄積される。

## 管理画面(下書きレビュー・公開)

`https://your-site.vercel.app/admin.html?admin=doom`

にアクセスすると、下書き記事の一覧・編集(タイトル/カテゴリ/都市伝説度/要約/タグ)・
公開・下書きへの差し戻し・削除がブラウザ上でできます。
`?admin=doom`が付いていないとガード画面が出て操作できません
(サーバーサイド認証ではなくURLパラメータ方式なので、リンクの取り扱いには注意してください)。

手動で収集を1回走らせたい場合:
`https://your-site.vercel.app/api/collect?admin=doom&manual=1`

記事一覧をJSONで直接見たい場合:
`https://your-site.vercel.app/api/articles?admin=doom`

- 映画・アニメ・アトラクションなど「都市伝説を題材にした二次利用コンテンツ」は
  タイトルキーワードでの事前フィルタ + AI分析時の`isRelevant`判定の2段階で除外
  されます。除外された記事は`status: "rejected"`として保存され(再処理・再課金を
  防ぐため)、管理画面の下書き/公開どちらのタブにも表示されません。

## 文体・トーンについて

要約(summary)と煽り見出し(hook)は、以下を参照するようAIに指示しています。

- **ナオキマンショー / ウマヅラビデオ**(YouTube):劇的なナレーション調の引き込み方
- **月刊ムー**:大真面目にオカルト・陰謀論を調査報道するトーン
- **TOCANA(トカナ)**:攻めた見出し・トンデモ上等の勢い(hookフィールドで特に強め)

`lib/openai.js`の`SYSTEM_PROMPT`を編集すれば、トーンの強さやバランスを調整できます。

## 今後の拡張候補(未実装)

- 記事の手動投稿フォーム
- Xへの自動投稿連携(公開時に自動ポスト)
- 都市伝説度スコアの推移グラフ(ORACLEのリスク指数チャートを流用)

## 注意事項

- 本サイトは個人の趣味プロジェクトであり、掲載情報の正確性を保証するものでは
  ありません。トップページに明記の上、Xのbio等でも同様の位置づけを明示する
  ことを推奨します。
- Reddit APIは認証不要の公開JSONエンドポイントを利用していますが、
  User-Agentの設定や取得頻度によってはレート制限がかかる可能性があります。
  頻度が問題になる場合は `lib/sources.js` の `REDDIT_SUBREDDITS` や
  cronスケジュールを調整してください。
- Wikipedia(日本語版)は「都市伝説」「未確認動物」「陰謀論」カテゴリの記事を
  定番ネタとして収集します。ニュースと違い更新頻度が低いため、初回実行時は
  1回の分析上限(`MAX_ANALYZE_PER_RUN`)に引っかかって全件処理しきれないことが
  あります。その場合は手動実行(`/api/collect?admin=doom&manual=1`)を数回
  繰り返せば、未処理分から順に処理されます。
