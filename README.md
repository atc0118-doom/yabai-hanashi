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
│   ├── sources.js       # Google News RSS / Reddit からの収集ロジック
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

3. **Vercel KVを接続**(重要・これがないと記事が保存されない):
   - Vercelダッシュボード → 対象プロジェクト → Storage タブ → 「Create Database」→ KV を選択
   - 作成後そのままプロジェクトに接続すると、環境変数
     (`KV_REST_API_URL` / `KV_REST_API_TOKEN` など)が自動的に設定される。
   - コード側の追加設定は不要。

4. **環境変数を追加**(Vercelダッシュボード → Settings → Environment Variables):
   - `OPENAI_API_KEY` — OpenAI APIキー

5. **再デプロイ**すれば完了。`vercel.json` のcron設定により毎日1回(UTC 21:00 = 日本時間 朝6:00)
   `/api/collect` が自動実行され、新規記事が「下書き」として蓄積される。

## 管理画面(ORACLEと同じ ?admin=doom 方式)

- `https://your-site.vercel.app/api/articles?admin=doom`
  → 下書き含む全記事をJSONで確認できる。

- 手動で収集を1回走らせたい場合:
  `https://your-site.vercel.app/api/collect?admin=doom&manual=1`

- 記事を公開するには、PATCHリクエストで `status: "published"` を送る
  (現時点では専用の管理UIはなし。curlやPostman、または簡易な管理画面を
  今後追加する想定)。

  ```
  PATCH /api/articles?admin=doom
  Body: { "id": "記事のID", "status": "published" }
  ```

## 今後の拡張候補(未実装)

- 管理画面のUI化(下書き一覧を見て、ワンクリックで公開/編集できる画面)
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
