# LNPRJ10「今日のごはん」

附近吃什麼決策工具。LINE LIFF app，掛在 LINE Login channel（一般 LIFF，免審核）。
用戶在 LINE 內開啟 → 定位 → 看附近餐廳（依「評價 + 距離」加權排序）→ 分享到聊天室。

- 部署：Cloudflare Workers → `https://lnprj10-gohan.neillin-lct.workers.dev`
- Repo：`fineneillin/lnprj10-gohan`
- LIFF：`https://liff.line.me/2010604898-QOamS041`

## 技術棧

Hono.js + TypeScript + Cloudflare Workers；前端 Vanilla JS 單頁；LIFF SDK 由 CDN 載入。
`GOOGLE_MAPS_API_KEY` 只存在 Worker 端（secret），前端永不接觸。

## 架構

```
src/
├─ index.ts   # Hono 路由：GET /、/api/nearby、/api/geocode、/api/photo
├─ places.ts  # Places searchNearby / Geocoding、field mask、Haversine、加權排序
└─ types.ts   # 共用型別
public/
├─ index.html # SPA 骨架 + LIFF SDK + 共用導覽
├─ app.js     # 定位、查詢、渲染、篩選、換一批、shareTargetPicker 分享
└─ styles.css # 設計系統（日式歐風 × 赭紅）
```

## API

| Endpoint | 說明 |
|---|---|
| `GET /api/nearby?lat&lng&radius&type&openNow` | 代打 Places searchNearby，回加權排序後最多 20 筆候選 |
| `GET /api/geocode?q=` | 地址/景點 → 經緯度 |
| `GET /api/photo?name=&w=` | 串流 Google 店家照片（隱藏 key），快取 1 天 |

排序：`finalScore = bayesianRating × distanceDecay`（C=50, G=3.8，decay=1/(1+d_km)）。
快取：nearby 以「經緯度~100m + radius + type + openNow」為 key，Workers Cache 5 分鐘。
「換一批」不重打 API，前端從 20 筆候選依 score 加權隨機抽 10 筆。

## 本地開發

```bash
npm install
npm run type-check
echo 'GOOGLE_MAPS_API_KEY = "your-key"' > .dev.vars   # 本地測試用，勿進 git
npm run dev            # http://localhost:8787
```

## 部署

```bash
wrangler secret put GOOGLE_MAPS_API_KEY    # 只需一次
wrangler deploy
```

## Neil 需手動完成的前置（程式已預留對應設定）

1. ✅ LINE Login channel + LIFF app 已建，LIFF ID = `2010604898-QOamS041`
2. **回填 Endpoint URL**：`wrangler deploy` 後，回 LINE Console 該 LIFF app，
   把 Endpoint URL 改成 `https://lnprj10-gohan.neillin-lct.workers.dev`
3. **開啟 shareTargetPicker 同意**：該 channel 的 LIFF 分頁 → shareTargetPicker →
   同意「Agreement Regarding Use of Information」→ Enable（每 channel 一次）
4. **Google Cloud `lnprj-daily`**：確認已啟用 Places API (New) + Geocoding API；
   **設每日費用上限**（防被分享爆量）；API key 視需要收緊限制
5. `wrangler secret put GOOGLE_MAPS_API_KEY`
6. 帳單信箱維持 `neillin.lct@gmail.com`
7. 部署後更新主 index 的 `projects.json` / `lnprj-nav.js` 加入 LNPRJ10

## 成本

Google 2026 各 SKU 免費層；含評分/評論數屬最貴層，免費額約每月 1000 次。
個人自用遠低於此。唯一風險是被公開分享爆量 → 已用 5 分鐘快取 + 每日費用上限雙重防護。
