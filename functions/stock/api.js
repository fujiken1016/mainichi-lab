// TCG BOX 定価在庫チェッカーの API（Cloudflare Pages Functions）。
// 楽天市場商品検索APIを呼び、定価以下・在庫ありの出品だけを返す。**何も保存しない**（応答を短時間キャッシュするだけ）。
// 鍵は context.env（Cloudflare の環境変数）からだけ読む。リポジトリに鍵は無い。
// 定価の根拠＝副業/在庫チェッカー_実装ログ_2026-10-16.md §3。ここを変えたら tools/stock_checker/build.py も揃える。
const EP = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";
const ORIGIN = "https://mainichi-lab.com";
const OK = ["BOX", "ボックス"];
const PRODUCTS = [
  ["poke-30th", "30th CELEBRATION", "ポケカ MEGA 拡張パック", 7200, "ポケモンカード 30th CELEBRATION BOX", ["30th", "CELEBRATION"]],
  ["poke-storm", "ストームエメラルダ", "ポケカ MEGA 拡張パック", 6000, "ポケモンカード ストームエメラルダ BOX", ["ストームエメラルダ"]],
  ["poke-brave", "メガブレイブ", "ポケカ MEGA 拡張パック", 5400, "ポケモンカード メガブレイブ BOX", ["メガブレイブ"]],
  ["poke-symph", "メガシンフォニア", "ポケカ MEGA 拡張パック", 5400, "ポケモンカード メガシンフォニア BOX", ["メガシンフォニア"]],
  ["op17", "OP-17 世界最強の戦士", "ワンピカ ブースターパック", 5760, "ワンピースカード 世界最強の戦士 OP-17 BOX", ["世界最強の戦士"]],
  ["eb05", "EB-05 Heroines vol.2", "ワンピカ エクストラブースター", 5760, "ワンピースカード EB-05 Heroines Edition BOX", ["Heroines"]],
  ["fb11", "FB-11 BRIGHTNESS OF HOPE", "ドラゴンボール フュージョンワールド", 5760, "フュージョンワールド BRIGHTNESS OF HOPE FB-11 BOX", ["BRIGHTNESS"]],
];
const BAD = ["カードセット", "デッキセット", "FUTURISTIC", "プレミアム", "ハイクラス", "ミニ", "スターター", "ばら売り", "バラ売り", "パック販売", "シングル", "ケース", "スリーブ", "ローダー", "ホルダー", "収納", "中古", "開封済", "傷", "凹み", "難あり", "カートン", "抽選", "応募", "くじ", "オリパ", "福袋", "未開封パック", "1パック", "6パック", "12パック", "18パック", "プレ値", "転売", "並行", "海外"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (obj, status, cc) => new Response(JSON.stringify(obj), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": cc, "x-robots-tag": "noindex" },
});

async function fetchOne(env, kw, lo, hi) {
  const q = new URLSearchParams({
    applicationId: env.RAKUTEN_APP_ID, accessKey: env.RAKUTEN_ACCESS_KEY, affiliateId: env.RAKUTEN_AFFILIATE_ID,
    keyword: kw, availability: "1", hits: "30", sort: "+itemPrice", format: "json", imageFlag: "0",
    minPrice: String(lo), maxPrice: String(hi),
  });
  let err = "";
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(EP + "?" + q, { headers: { Origin: ORIGIN, Referer: ORIGIN + "/", "User-Agent": "mainichi-lab-stock-checker/1.0" } });
      if (r.ok) { const d = await r.json(); if (d && Array.isArray(d.Items)) return d.Items; err = "no Items"; }
      else err = "HTTP " + r.status;
    } catch (e) { err = String(e && e.name || e); }
    await sleep(1500 * (i + 1));
  }
  throw new Error(err);
}

export async function onRequestGet(context) {
  const { env, request } = context;
  if (!env.RAKUTEN_APP_ID || !env.RAKUTEN_ACCESS_KEY || !env.RAKUTEN_AFFILIATE_ID) {
    return json({ error: "取得失敗：サーバー設定が未完了です" }, 503, "no-store");
  }
  const cache = caches.default;
  const key = new Request(new URL("/stock/api", request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  const products = [];
  try {
    for (const [id, name, cat, msrp, kw, must] of PRODUCTS) {
      const items = await fetchOne(env, kw, Math.floor(msrp * 0.85), msrp);
      const stock = [];
      for (const it of items) {
        const i = it.Item || it, n = i.itemName || "", p = Number(i.itemPrice);
        if (!must.every((m) => n.toLowerCase().includes(m.toLowerCase())) || !OK.some((a) => n.toLowerCase().includes(a.toLowerCase()))) continue;
        if (BAD.some((b) => n.includes(b))) continue;
        if (!(p <= msrp) || p < msrp * 0.85 || i.availability !== 1) continue; // プレ値は出さない
        stock.push({ name: n.slice(0, 90), price: p, shop: i.shopName, url: i.affiliateUrl || i.itemUrl, postage: i.postageFlag === 0 ? "込" : "別", reserve: n.includes("予約") });
      }
      stock.sort((a, b) => a.price - b.price);
      products.push({ id, name, cat, msrp, stock: stock.slice(0, 5) });
      await sleep(1100); // 楽天APIは1秒1リクエスト
    }
  } catch (e) {
    // 取得に失敗した回は「在庫なし」を返さない
    return json({ error: "取得失敗：" + String(e.message || e) }, 502, "no-store");
  }
  const res = json({ fetchedAt: new Date().toISOString(), products }, 200, "public, max-age=300");
  context.waitUntil(cache.put(key, res.clone()));
  return res;
}
