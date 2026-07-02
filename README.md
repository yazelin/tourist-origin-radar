# Tourist Origin Radar

即時旅客來源國家比例行銷工具原型，回應 wish-pool 的 `wish-20`。

- 線上 demo：https://tourist-origin-radar.vercel.app
- 原始碼：https://github.com/yazelin/tourist-origin-radar

這個站的定位是 **demo / starter kit**。公開 demo 可以讓行銷業者看資料視覺化與提醒工作流；正式使用時建議 fork 本 repo 後自行部署，並接上自己的資料源、快取策略和權限控管。

> **線上 demo 的近即時畫面是「快照」，不是真即時。** Vercel（以及 GitHub-hosted Actions）的雲端出口連不上移民署 APIS，所以線上 demo 的近即時模式顯示的是 repo 內建、從本機抓取後 commit 進來的快照資料，頁面上會標示「近即時快照」與擷取時間。要看真正的近即時資料，目前只能在可連線移民署 APIS 的網路（實測台灣本機網路可以）自行部署，見下方「快速開始」。

## 快速開始

### 只想看畫面

直接開線上 demo：https://tourist-origin-radar.vercel.app 。近即時模式顯示內建快照，年度模式（2002-2025 官方統計）則是每次載入即時抓官方 CSV，完全真實。

### 本機跑出「真即時」資料

前置需求：Node.js 20+、位於可連線移民署 APIS 的網路（台灣的家用/公司網路實測可以；海外雲端多半不行）。

```bash
git clone https://github.com/yazelin/tourist-origin-radar.git
cd tourist-origin-radar
npm install
npx vercel dev   # 第一次會問要不要 link 專案，選 no 也能跑
```

開 `http://127.0.0.1:3000`，狀態列顯示「近即時」（綠燈）就是當下直連移民署的真即時資料；`/api/arrivals/realtime` 每次會抓 18 個機場 endpoint，只有近 3 小時有入境且上游有發布的機場會出現在機場篩選列（多數時段只有 TPE/KHH，偶爾加 RMQ）。

注意：`npm run dev`（純 Vite）不會啟動 `/api` serverless function，畫面只會用內建樣本；要測完整資料流請用 `npx vercel dev`。

### 更新線上 demo 的快照

在可連線移民署 APIS 的機器上：

```bash
node scripts/update-realtime-snapshot.mjs   # 重抓上游、覆寫 api/arrivals/realtimeSnapshot.js
git commit -am "chore: refresh realtime snapshot" && git push
```

push 後 Vercel 自動重新部署，線上 demo 的快照時間就會更新。

### 部署自己的正式版

fork 後照下方「免費部署建議」上 Vercel 即可跑起來，但近即時一樣會退回快照。要讓公開站有真即時，需要其中一種：台灣主機/VM 直接跑本專案、台灣區資料 proxy 讓 Vercel 讀、或台灣的自架 runner 定時執行上面的快照更新腳本。細節見「部署注意」。

## 可行性判斷

能做，但「即時」要分層。這個 demo 目前採用最接近即時的公開資料：

- 近即時公開資料：內政部移民署「入境人次預報」OpenData，資料集說明為近 3 小時入境人次、每小時更新，欄位含國籍、性別、年齡、機場。
- 月級正式統計：交通部觀光署「來臺旅客居住地」月資料，適合校準正式旅遊統計。
- 年度背景資料：交通部觀光署「歷年來台旅客居住地統計」CSV，適合長期趨勢。
- 真正商用即時：若要接查驗系統、航班訂位、電信漫遊、支付或廣告平台資料，仍需自行取得授權或商業合作。

因此這個 repo 做成「移民署近即時 OpenData + 行銷決策 dashboard」，並把資料更新管線包成 Vercel serverless API，未來可替換成授權或商業 feed。

## 功能

- 資料視角切換：`自動`、`近即時`、`年度`。自動模式會優先顯示近即時資料，失敗時降級到年度資料。
- Vercel serverless API proxy：`/api/arrivals/realtime` 抓移民署入境人次預報，依國籍加總並設定 CDN 快取。
- 年度 API：`/api/residence/annual` 抓觀光署年度 CSV，現可取得 2002-2025。
- 內建備援樣本：保留主要市場 2002-2025，確保 API 不可用時 dashboard 不空白。
- 來源國比例排行、Top N 篩選、市場佔比、年度趨勢、機場涵蓋狀態。
- 近即時模式支援外籍客源 / 全部入境切換，預設排除 TWN 以符合行銷來源市場視角。
- 近即時模式支援機場篩選。
- 近即時 API 會嘗試多個台灣機場 endpoint；目前 demo 清單含 TPE/TSA/KHH/RMQ/TNN/CYI/HUN/MZG/PIF/TTT/KNH/LZN/MFK/WOT/CMJ/GNI/KYD/HCN。
- Vercel production 無法直連移民署 APIS 時，`/api/arrivals/realtime` 會回快照備援，讓公開 demo 仍能展示近即時資料形態；UI 會標示為「近即時快照」。
- 提醒規則：來源佔比達門檻或年增達門檻，顯示於關鍵指標。
- CSV / JSON 匯出。
- 官方 CSV 手動匯入，方便離線 demo 或資料格式驗證。
- 桌機版為一屏 dashboard；主頁不垂直捲動，市場明細在表格內部捲動。

### 圖表資料邏輯

排行長條圖、佔比圓圖與市場明細使用「目前資料視角」：

- `近即時`：移民署近 3 小時入境預報，依國籍彙總。
- `年度`：觀光署年度 CSV，依指定年份顯示。
- `自動`：近即時可用時等同近即時，不可用時等同年度。

多年來源趨勢圖固定使用年度資料，範圍為 2002-2025。當目前視角是近即時時，趨勢圖會拿近即時 Top 來源去對照它們的年度歷史；當目前視角是年度時，則對照年度 Top 來源的長期趨勢。

### 多年來源趨勢更新方式

多年來源趨勢不是由近即時 APIS 累積而來，而是直接讀交通部觀光署年度 CSV：

- 前端載入時會呼叫 `/api/residence/annual`。
- `/api/residence/annual` 會抓 `https://stat.taiwan.net.tw/data/opendata/7` 並解析所有年份欄位。
- 目前官方 CSV 可解析到 2002-2025，因此趨勢圖顯示 2002-2025。
- Vercel serverless 回應設定 `Cache-Control: s-maxage=43200, stale-while-revalidate=86400`，也就是 CDN 正常快取 12 小時，過期後可用舊資料並背景更新 24 小時。
- 如果官方年度 CSV 暫時不可用，前端會使用 repo 內建的 `src/data/fallbackResidence.js`，目前內建主要市場 2002-2025。
- 官方未來發布新年度欄位時，不需要改圖表邏輯；`/api/residence/annual` 會自動把新的年份欄位納入。只有在需要更新離線備援樣本時，才要同步更新 `fallbackResidence.js`。

換句話說：近即時資料負責「短期來源比例」，多年來源圖負責「長期背景脈絡」。兩者圖表樣式相近，但資料來源與更新節奏不同。

## 參考與整合

GitHub 上已有開發者使用移民署 APIS 做資料收集，但不是完整行銷產品：

- `eric7578/pax-graph`：抓移民署入出境 endpoint，依國籍與年齡分組保存 logs。
- `ianlkl11234s/gis-data-collectors`：整理移民署 APIS collector 與 endpoint 探勘結果。

本 repo 參考它們的公開 endpoint 使用方式與 group-by 思路，整合成可部署的產品 demo：即時比例圖表、提醒、匯出、資料來源狀態與自行部署說明。

### 部署注意

移民署 APIS 對請求來源比較挑剔；實測本機與部分台灣網路可正常抓取，但 Vercel 等國際雲端環境可能遇到上游封鎖或回空。`/api/arrivals/realtime` 會把「完全沒有可用入境資料」視為上游不可用，並回傳 repo 內建的快照備援；前端會標示為「近即時快照」。正式使用建議：

- 部署在可連線移民署 APIS 的台灣 VM / 主機。
- 或自建台灣區資料 proxy，再讓 Vercel demo 讀該 proxy。
- 或從能連線 APIS 的本機 / 自架 runner 更新近即時快照，避免每次頁面載入都直接打上游。

### 2026-07-02 實測紀錄

本 repo 已針對近即時 API 做過本機、Vercel 與 GitHub-hosted Actions 實測：

- 本機直接執行 `api/arrivals/realtime.js`：成功回 200，能抓到近 3 小時總入境與外籍來源市場。
- 本機 `vercel dev`：`http://127.0.0.1:3000/api/arrivals/realtime` 成功回 200，前端狀態為 live。
- Vercel production 直連移民署 APIS 會遇到上游連線逾時：`curl: (28) Connection timed out after 12000 milliseconds`。
- 已嘗試把 Vercel function region 指到 `hkg1`，仍 timeout。
- GitHub-hosted Actions 也不可行。2026-07-02 手動觸發 `Update realtime snapshot` run `28587249485`，runner 位於 Azure `eastus`；TPE1/TSA1/KHH1/RMQ1/TNN1/CYI1/HUN1/MZG1/PIF1/TTT1/KNH1/LZN1/MFK1/WOT1/CMJ1/GNI1/KYD1/HCN1 全部是 `curl: (28) Connection timed out after 12002 milliseconds`。
- 因此 repo 不保留 hourly GitHub Actions。`scripts/update-realtime-snapshot.mjs` 只作為手動更新或自架 runner 使用；自架 runner 必須位於可連線移民署 APIS 的網路。
- 為了讓公開 demo 可展示近即時畫面，API 目前在 Vercel 直連失敗時回快照備援，response header 會帶 `X-Data-Fallback: snapshot`，`source.snapshot` 會是 `true`。
- `https://tourist-origin-radar.vercel.app/api/residence/annual` 正常回 200，年度資料 2002-2025 可用。

判斷：程式邏輯可用，問題在 Vercel / GitHub-hosted Actions 的雲端出口到移民署 APIS 不通或被上游阻擋。公開 demo 的近即時畫面若顯示「近即時快照」，代表它正在展示 repo 內建快照，而不是 Vercel 當下直連上游。

### AI agent 能不能在願望池協作

可以，但權限分讀取與寫入：

- 讀取願望、缺口、進度與既有實作不需要 token；其他 AI agent 可以透過 wish-pool 公開 API、`llms.txt`、`AGENTS.md` 或 `skills/wish-pool/SKILL.md` 了解要做什麼。
- 寫入認領、進度、卡關或提交 repo 需要 `WISHPOOL_AGENT_TOKEN`，也就是 wish-pool Cloudflare Worker 的 `AGENT_TOKEN`。
- `claim` 不是鎖定機制；它只是留下「我在做」的 work log。多個人或 AI agent 可以並行做不同版本，最後用 `answer` 交 repo。
- `github_handle` 只是純文字署名，未驗證；正式採用仍由站長在願望池後台接受某個 answer。

本專案已在 README 和 `AGENTS.md` 記錄資料來源、部署限制、快照更新方式與驗證指令，其他能讀 repo 的 AI agent 可依這些資訊接手。

### 願望池回報 token

如果要讓 headless agent 直接回報願望池進度，需要 `WISHPOOL_AGENT_TOKEN`。它必須等於 wish-pool Cloudflare Worker 的 `AGENT_TOKEN` secret。

Cloudflare secret 不能讀回，只能由站長設定或重設：

```bash
cd /home/ct/wish-pool/worker
openssl rand -hex 32
wrangler secret put AGENT_TOKEN
```

然後在本機 agent shell 設定同一串：

```bash
export WISHPOOL_AGENT_TOKEN=<剛設定的 token>
export WISHPOOL_HANDLE=yazelin
cd /home/ct/wish-pool
node wish.mjs progress 20 "進度內容"
```

注意：重設 `AGENT_TOKEN` 會讓舊 token 失效。

## 免費部署建議

### Vercel

推薦。Vercel 可以同時跑 React 靜態前端和 `/api` serverless function。

1. Fork 這個 repo。
2. 到 Vercel 建立新專案，Import Git Repository。
3. Framework Preset 選 `Vite`。
4. Build Command 使用 `npm run build`。
5. Output Directory 使用 `dist`。
6. 部署完成後開啟網站。

本專案不需要環境變數即可運作。若要接私有資料源，可自行新增：

- `DATA_SOURCE_URL`
- `DATA_SOURCE_TOKEN`
- `CACHE_TTL_SECONDS`

再修改 `api/arrivals/realtime.js` 或新增自己的 adapter。

### GitHub Pages

可跑純前端 demo，但不能跑 serverless API。若要用 GitHub Pages，可改成讀靜態 JSON。注意：GitHub-hosted Actions 已實測無法連移民署 APIS，因此不能靠它定時更新近即時入境資料；只有年度資料或其他 Actions 可連線的資料源適合這種做法。

### Render

也能跑，但免費 web service 會 idle 休眠，首次喚醒較慢。這個專案目前以 Vercel serverless 形態為主，若要上 Render，建議另外加一個 Express server。

## 本機開發

```bash
npm install
npm run dev
```

開啟 `http://localhost:5173`。純 Vite dev server 不會啟動 Vercel API，因此畫面會使用內建樣本。

若要完整測試 Vercel API：

```bash
npm install -g vercel
vercel dev
```

本機 API 快速檢查：

```bash
node --input-type=module - <<'NODE'
import handler from './api/arrivals/realtime.js'
let body
let statusCode = 200
await handler({}, {
  setHeader() {},
  status(code) {
    statusCode = code
    return { json(payload) { body = payload } }
  },
})
console.log({ statusCode, totalAll: body?.source?.totalAll, totalForeign: body?.source?.totalForeign, markets: body?.rows?.length })
NODE
```

`statusCode: 200` 代表本機可連移民署 APIS；如果 Vercel production 仍 502，就是雲端出口問題。

## 生產 build

```bash
npm run build
npm run preview
```

## 資料來源

- 移民署桃園機場入境人次預報：https://data.gov.tw/dataset/88851
- 移民署 OpenData API docs：https://opendata.immigration.gov.tw/v2/api-docs
- 交通部觀光署開放資料：https://stat.taiwan.net.tw/data/opendata/7
- 來臺旅客居住地月資料頁：https://admin.taiwan.net.tw/businessinfo/IssuePage?a=12124
- 國家統計發布規則：https://www.stat.gov.tw/News_NoticeCalendar_Content.aspx?MetaI_D=732

## License

MIT
