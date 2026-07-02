# Tourist Origin Radar

即時旅客來源國家比例行銷工具原型，回應 wish-pool 的 `wish-20`。

這個站的定位是 **demo / starter kit**。公開 demo 可以讓行銷業者看資料視覺化與提醒工作流；正式使用時建議 fork 本 repo 後自行部署，並接上自己的資料源、快取策略和權限控管。

## 可行性判斷

能做，但「即時」要分層。這個 demo 目前採用最接近即時的公開資料：

- 近即時公開資料：內政部移民署「入境人次預報」OpenData，資料集說明為近 3 小時入境人次、每小時更新，欄位含國籍、性別、年齡、機場。
- 月級正式統計：交通部觀光署「來臺旅客居住地」月資料，適合校準正式旅遊統計。
- 年度背景資料：交通部觀光署「歷年來台旅客居住地統計」CSV，適合長期趨勢。
- 真正商用即時：若要接查驗系統、航班訂位、電信漫遊、支付或廣告平台資料，仍需自行取得授權或商業合作。

因此這個 repo 做成「移民署近即時 OpenData + 行銷決策 dashboard」，並把資料更新管線包成 Vercel serverless API，未來可替換成授權或商業 feed。

## 功能

- Vercel serverless API proxy：`/api/arrivals/realtime` 抓移民署入境人次預報，依國籍加總並設定 CDN 快取。
- 備援 API：`/api/residence/annual` 抓觀光署年度 CSV。
- 來源國比例排行、Top N 篩選、來源快照、機場涵蓋狀態。
- 提醒規則：來源佔比達門檻或年增達門檻，支援瀏覽器通知。
- CSV / JSON 匯出。
- 官方 CSV 手動匯入，方便離線 demo 或資料格式驗證。
- API 不可用時使用內建 2023-2025 樣本，確保 demo 不空白。

## 參考與整合

GitHub 上已有開發者使用移民署 APIS 做資料收集，但不是完整行銷產品：

- `eric7578/pax-graph`：抓移民署入出境 endpoint，依國籍與年齡分組保存 logs。
- `ianlkl11234s/gis-data-collectors`：整理移民署 APIS collector 與 endpoint 探勘結果。

本 repo 參考它們的公開 endpoint 使用方式與 group-by 思路，整合成可部署的產品 demo：即時比例圖表、提醒、匯出、資料來源狀態與自行部署說明。

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

可跑純前端 demo，但不能跑 serverless API。若要用 GitHub Pages，建議改成 GitHub Actions 定時抓資料並產生靜態 JSON，前端讀 `/data/residence.json`。這適合展示，不適合需要即時 proxy 或私有 token 的版本。

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
