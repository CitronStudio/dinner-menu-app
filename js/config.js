// Cloudflare Worker のデプロイ後、実際のURLに書き換えてください。
// 例: "https://dinner-menu-app-worker.<あなたのサブドメイン>.workers.dev"
//
// APP_KEY は worker 側の APP_SHARED_KEY と同じ文字列を入れてください（簡易的な乱用防止用。
// 公開リポジトリのJSに書くため厳密な秘密にはなりませんが、無関係なbotからの叩き合いを防ぐ程度の効果はあります）。
const APP_CONFIG = {
  API_BASE: "https://dinner-menu-app-worker.YOUR-SUBDOMAIN.workers.dev",
  APP_KEY: ""
};
