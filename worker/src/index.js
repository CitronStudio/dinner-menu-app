import { STORES } from "./stores.js";
import { htmlToPlainText } from "./htmlText.js";
import { callClaude } from "./claude.js";

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type,x-app-key",
  };
}

function jsonResponse(body, env, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders(env) },
  });
}

function checkAppKey(request, env) {
  if (!env.APP_SHARED_KEY) return true; // 未設定なら簡易ガードをスキップ（ローカル開発用）
  return request.headers.get("x-app-key") === env.APP_SHARED_KEY;
}

async function fetchStoreText(store) {
  try {
    const res = await fetch(store.url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; dinner-menu-app/1.0)" },
    });
    if (!res.ok) {
      return { name: store.name, url: store.url, error: `HTTP ${res.status}` };
    }
    const html = await res.text();
    return { name: store.name, url: store.url, text: htmlToPlainText(html) };
  } catch (e) {
    return { name: store.name, url: store.url, error: String(e) };
  }
}

async function handleSales(request, env) {
  if (STORES.length === 0) {
    return jsonResponse({ stores: [], note: "対象スーパーが未設定です（worker/src/stores.js）" }, env);
  }
  const results = await Promise.all(STORES.map(fetchStoreText));
  return jsonResponse({ stores: results }, env);
}

function buildSuggestPrompt({ month, seasonalPicks, ngText, extraText, sales }) {
  const seasonalLine = seasonalPicks && seasonalPicks.length
    ? seasonalPicks.join("、")
    : "（特に指定なし。一般的な今の季節の食材から選んでください）";

  const salesSection = (sales && sales.length)
    ? sales.map((s) => {
        if (s.error) return `【${s.name}】取得失敗（${s.error}）`;
        return `【${s.name}】(${s.url})\n${s.text}`;
      }).join("\n\n")
    : "（特売情報の取得対象スーパーが未設定、または取得なし）";

  const userMessage = `あなたは家庭料理の献立アドバイザーです。以下の条件を踏まえて、今夜の夕食の献立を2〜3案、日本語で提案してください。

# 今月
${month}月

# 使いたい旬の食材（指定があれば優先的に使う）
${seasonalLine}

# 近所のスーパーの特売情報（HTMLから抽出した生テキストです。ノイズが混ざっていますが、その中からセール中の食材・食品を読み取り、使えそうなものがあれば献立に活かしてください。読み取れない場合は無理に使わなくて構いません）
${salesSection}

# NG項目（必ず避けること）
${ngText || "（特になし）"}

# 今日の追加条件
${extraText || "（特になし）"}

# 出力形式
必ず次のJSON形式のみを出力してください（前後に説明文やコードフェンスを付けないこと）。

{
  "recipes": [
    {
      "title": "料理名",
      "summary": "1〜2文の説明",
      "main_ingredients": ["主な材料"],
      "uses_sale_item": "特売品を使った場合はその品名、使っていなければ空文字",
      "uses_seasonal": "旬の食材を使った場合はその品名、使っていなければ空文字",
      "time_minutes": 30
    }
  ],
  "notes": "NG項目への配慮など、補足があれば一言（無ければ空文字）"
}`;

  return userMessage;
}

async function handleSuggest(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid JSON body" }, env, 400);
  }

  const month = body.month || new Date().getMonth() + 1;
  const seasonalPicks = Array.isArray(body.seasonalPicks) ? body.seasonalPicks : [];
  const ngText = typeof body.ngText === "string" ? body.ngText : "";
  const extraText = typeof body.extraText === "string" ? body.extraText : "";

  let sales = Array.isArray(body.sales) ? body.sales : null;
  if (!sales && STORES.length > 0) {
    sales = await Promise.all(STORES.map(fetchStoreText));
  }

  const userMessage = buildSuggestPrompt({ month, seasonalPicks, ngText, extraText, sales });

  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse({ error: "ANTHROPIC_API_KEY is not configured on the worker" }, env, 500);
  }

  try {
    const raw = await callClaude(env.ANTHROPIC_API_KEY, {
      system: "あなたは親切で実践的な家庭料理アドバイザーです。指示された出力形式（JSONのみ）を厳密に守ってください。",
      userMessage,
      maxTokens: 1800,
    });

    let cleaned = raw.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) cleaned = fenceMatch[1].trim();

    try {
      const parsed = JSON.parse(cleaned);
      return jsonResponse({ result: parsed }, env);
    } catch {
      return jsonResponse({ result: null, raw }, env);
    }
  } catch (e) {
    return jsonResponse({ error: String(e) }, env, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }

    if (!checkAppKey(request, env)) {
      return jsonResponse({ error: "unauthorized" }, env, 401);
    }

    if (url.pathname === "/api/sales" && request.method === "GET") {
      return handleSales(request, env);
    }

    if (url.pathname === "/api/suggest" && request.method === "POST") {
      return handleSuggest(request, env);
    }

    return jsonResponse({ error: "not found" }, env, 404);
  },
};
