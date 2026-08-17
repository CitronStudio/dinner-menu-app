# 今夜なに作る？ - 夕食献立アシスタント

旬の食材・近所のスーパーの特売情報・家族のNG項目（苦手な食材や避けたい調理法）をもとに、Claude(AI)が今夜の献立を提案する家族用アプリ。

- フロントエンド: 静的サイト（GitHub Pages）
- バックエンド: Cloudflare Workers（外部サイト取得・Claude APIキーの秘匿）

## 構成

```
index.html, css/, js/     … フロントエンド（GitHub Pagesで配信）
data/seasonal_ingredients.json … 旬の食材データ（月ごと）
worker/                   … Cloudflare Worker（特売情報取得 + Claude API呼び出し）
```

## セットアップ

### 1. Cloudflare Worker のデプロイ

```
cd worker
npm install
npx wrangler login          # 初回のみ、ブラウザでCloudflareにログイン
npx wrangler secret put ANTHROPIC_API_KEY   # Claude APIキーを入力
npx wrangler secret put APP_SHARED_KEY      # 任意の乱数文字列（乱用防止用、後述）
npx wrangler deploy
```

デプロイ後に表示される `https://dinner-menu-app-worker.<サブドメイン>.workers.dev` を控えます。

`wrangler.toml` の `ALLOWED_ORIGIN` を、実際のGitHub Pages URL（例: `https://citronstudio.github.io`）に合わせて必要なら修正し、再度 `npx wrangler deploy` してください。

### 2. フロントエンドの設定

`js/config.js` を編集:

```js
const APP_CONFIG = {
  API_BASE: "https://dinner-menu-app-worker.<実際のサブドメイン>.workers.dev",
  APP_KEY: "<APP_SHARED_KEYと同じ文字列>"
};
```

### 3. GitHub Pages の有効化

リポジトリの Settings → Pages で、`main` ブランチ / ルートディレクトリを指定して公開。
公開後のURLを家族に共有すれば利用できます。

### 4. 対象スーパーの設定（特売情報取り込み）

`worker/src/stores.js` に、対象スーパーの名前とURL（トクバイの店舗ページ推奨）を追加し、再デプロイしてください。

```js
export const STORES = [
  { name: "〇〇店", url: "https://tokubai.co.jp/..." },
];
```

未設定の間は、特売情報なしで旬の食材とNG項目のみから提案します。

## 特売情報の取得方式について

各スーパーのページ構造は個別に変わりやすいため、専用スクレイパーは作らず「HTMLからタグを除去した生テキストをそのままClaudeに渡し、AI自身にセール品を読み取らせる」方式にしています。サイトによっては取得できない・ノイズが多いことがありますが、その場合は無理に反映せず旬の食材ベースの提案になります。

## 乱用防止について

`APP_SHARED_KEY` はフロントエンドのJS（公開リポジトリ）にも書き込むため、厳密な秘密にはなりません。無関係なbotが直接APIを叩くのを多少防ぐ程度の効果です。Claude APIの利用料が心配な場合は、Anthropic Consoleで使用上限（spending limit）を設定することを推奨します。

## ローカル開発

```
cd worker
npx wrangler dev
```

フロントエンドは `index.html` を直接ブラウザで開くか、簡易サーバーで配信してください（例: `npx serve .`）。
