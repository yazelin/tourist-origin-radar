import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Bell,
  Download,
  FileUp,
  Globe2,
  RefreshCcw,
  Search,
  Share2,
  TrendingUp,
} from 'lucide-react'
import Papa from 'papaparse'
import { fallbackResidence } from './data/fallbackResidence'
import './App.css'

const palette = ['#1f7a8c', '#e4572e', '#f3a712', '#5b6c8f', '#2d936c', '#8d5a97', '#d1495b', '#61764b']
const officialMonthlyUrl = 'https://admin.taiwan.net.tw/businessinfo/IssuePage?a=12124'
const releaseCalendarUrl = 'https://www.stat.gov.tw/News_NoticeCalendar_Content.aspx?MetaI_D=732'

function formatNumber(value) {
  return new Intl.NumberFormat('zh-TW').format(Math.round(value || 0))
}

function formatPercent(value, digits = 1) {
  return `${Number(value || 0).toFixed(digits)}%`
}

function formatAxisNumber(value) {
  if (Math.abs(value) >= 10000) return `${value / 10000}萬`
  return formatNumber(value)
}

function splitMarketName(rawName) {
  const normalized = String(rawName || '').replace(/\s+/g, ' ').trim()
  const match = normalized.match(/^(.+?)\s+([A-Za-z][A-Za-z .'-]+)$/)
  return {
    zh: match ? match[1].trim() : normalized,
    en: match ? match[2].replace(/\s+\./g, '.').trim() : normalized,
  }
}

function numberFromCell(value) {
  const cleaned = String(value ?? '').replaceAll(',', '').trim()
  if (!cleaned || cleaned === '-') return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function parseResidenceCsv(csv) {
  const result = Papa.parse(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  })
  if (result.errors.length) throw new Error(result.errors[0].message)

  const years = Object.keys(result.data[0] || {})
    .filter((key) => /^\d{4}$/.test(key))
    .sort()
  const rows = result.data
    .filter((row) => !/Total|Sub-Total|Grand Total/i.test(String(row['細分'] || '')))
    .map((row) => {
      const market = splitMarketName(row['細分'])
      return {
        region: row['居住地區'],
        marketZh: market.zh,
        marketEn: market.en,
        values: Object.fromEntries(years.map((item) => [item, numberFromCell(row[item])])),
      }
    })
  const totals = result.data
    .filter((row) => /Grand Total/i.test(String(row['細分'] || '')))
    .map((row) => Object.fromEntries(years.map((item) => [item, numberFromCell(row[item])])))[0]
  return { years, rows, totals, source: { title: '使用者匯入 CSV', fetchedAt: new Date().toISOString() } }
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function App() {
  const [dataset, setDataset] = useState(fallbackResidence)
  const [status, setStatus] = useState('loading')
  const [statusText, setStatusText] = useState('正在讀取官方開放資料')
  const [year, setYear] = useState(fallbackResidence.years.at(-1))
  const [query, setQuery] = useState('')
  const [topN, setTopN] = useState(10)
  const [threshold, setThreshold] = useState(8)
  const [noticeEnabled, setNoticeEnabled] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await fetch('/api/arrivals/realtime')
        if (!response.ok) throw new Error(`API ${response.status}`)
        const contentType = response.headers.get('content-type') || ''
        if (!contentType.includes('application/json')) {
          throw new Error('本機 Vite 未啟動 Vercel API')
        }
        const payload = await response.json()
        if (cancelled) return
        setDataset(payload)
        setYear(payload.years.at(-1))
        setStatus('live')
        setStatusText(`已讀取移民署近即時 OpenData，外籍來源 ${formatNumber(payload.source?.totalForeign)} 人次`)
      } catch (error) {
        if (cancelled) return
        setDataset(fallbackResidence)
        setYear(fallbackResidence.years.at(-1))
        setStatus('fallback')
        setStatusText(`使用年度備援樣本。部署到 Vercel 或執行 vercel dev 後會啟用近即時 API: ${error.message}`)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedYear = dataset.years.includes(year) ? year : dataset.years.at(-1)
  const previousYear = String(Number(selectedYear) - 1)
  const total = dataset.totals?.[selectedYear] || dataset.rows.reduce((sum, row) => sum + (row.values[selectedYear] || 0), 0)
  const previousTotal = dataset.totals?.[previousYear]
  const isRealtime = dataset.source?.mode === 'realtime'

  const marketRows = useMemo(() => {
    return dataset.rows
      .map((row) => {
        const arrivals = row.values[selectedYear] || 0
        const previous = row.values[previousYear] || 0
        const share = total ? (arrivals / total) * 100 : 0
        const yoy = previous ? ((arrivals - previous) / previous) * 100 : null
        return { ...row, arrivals, previous, share, yoy }
      })
      .filter((row) => row.arrivals > 0)
      .filter((row) => `${row.marketZh} ${row.marketEn} ${row.region}`.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => b.arrivals - a.arrivals)
  }, [dataset.rows, previousYear, query, selectedYear, total])

  const topRows = marketRows.slice(0, topN)
  const topMarket = marketRows[0]
  const asiaShare = marketRows
    .filter((row) => row.region?.includes('亞洲'))
    .reduce((sum, row) => sum + row.share, 0)
  const totalYoy = previousTotal ? ((total - previousTotal) / previousTotal) * 100 : null
  const alertRows = marketRows.filter((row) => row.share >= threshold || (row.yoy != null && row.yoy >= threshold * 2)).slice(0, 6)
  const activeEndpoints = dataset.source?.endpoints?.filter((endpoint) => endpoint.ok && endpoint.rows > 1).length
  const totalAll = dataset.source?.totalAll

  const trendData = dataset.years.map((item) => {
    const point = { year: item }
    marketRows.slice(0, 5).forEach((row) => {
      point[row.marketZh] = row.values[item] || 0
    })
    return point
  })

  function handleExportCsv() {
    const header = ['period', 'region', 'market_zh', 'market_en', 'nationality', 'arrivals', 'share_percent', 'yoy_percent']
    const rows = marketRows.map((row) => [
      selectedYear,
      row.region,
      row.marketZh,
      row.marketEn,
      row.nationality || '',
      row.arrivals,
      row.share.toFixed(3),
      row.yoy == null ? '' : row.yoy.toFixed(3),
    ])
    const csv = [header, ...rows].map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
    downloadFile(`tourist-origin-${selectedYear}.csv`, csv, 'text/csv;charset=utf-8')
  }

  function handleExportJson() {
    downloadFile(
      `tourist-origin-${selectedYear}.json`,
      JSON.stringify({ year: selectedYear, total, rows: marketRows, source: dataset.source }, null, 2),
      'application/json;charset=utf-8',
    )
  }

  async function handleFileUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const csv = await file.text()
      const parsed = parseResidenceCsv(csv)
      setDataset(parsed)
      setYear(parsed.years.at(-1))
      setStatus('imported')
      setStatusText(`已匯入 ${file.name}`)
    } catch (error) {
      setStatus('fallback')
      setStatusText(`CSV 匯入失敗: ${error.message}`)
    }
  }

  async function handleEnableNotice() {
    setNoticeEnabled(true)
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
    if ('Notification' in window && Notification.permission === 'granted' && alertRows[0]) {
      new Notification('旅客來源比例提醒', {
        body: `${alertRows[0].marketZh} 佔比 ${formatPercent(alertRows[0].share)}，已達提醒門檻。`,
      })
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow"><Globe2 size={16} /> Taiwan inbound market radar</p>
          <h1>即時旅客來源國家比例行銷工具</h1>
        </div>
        <div className={`status-pill ${status}`}>
          <span></span>
          {statusText}
        </div>
      </header>

      <section className="control-band" aria-label="資料與篩選">
        <label>
          資料期間
          <select value={selectedYear} onChange={(event) => setYear(event.target.value)}>
            {dataset.years.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="search-field">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋國家、地區或市場" />
        </label>
        <label>
          Top N
          <input type="range" min="5" max="20" value={topN} onChange={(event) => setTopN(Number(event.target.value))} />
          <strong>{topN}</strong>
        </label>
        <label>
          提醒門檻
          <input type="number" min="1" max="50" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
          <span>%</span>
        </label>
        <button type="button" onClick={() => window.location.reload()} title="重新整理資料"><RefreshCcw size={18} />重新整理</button>
        <button type="button" onClick={() => fileInputRef.current?.click()} title="匯入官方 CSV"><FileUp size={18} />匯入</button>
        <input ref={fileInputRef} className="visually-hidden" type="file" accept=".csv,text/csv" onChange={handleFileUpload} />
      </section>

      <section className="metric-grid" aria-label="關鍵指標">
        <article>
          <span>{isRealtime ? '外籍來源人次' : '總入境人次'}</span>
          <strong>{formatNumber(total)}</strong>
          <small>{isRealtime && totalAll ? `全部入境 ${formatNumber(totalAll)}，已排除 TWN` : totalYoy == null ? '無前期比較' : `年增 ${formatPercent(totalYoy)}`}</small>
        </article>
        <article>
          <span>最大來源</span>
          <strong>{topMarket?.marketZh || '-'}</strong>
          <small>{topMarket ? `${formatNumber(topMarket.arrivals)} 人次 / ${formatPercent(topMarket.share)}` : '-'}</small>
        </article>
        <article>
          <span>{isRealtime ? '有資料機場' : '亞洲來源佔比'}</span>
          <strong>{isRealtime ? activeEndpoints ?? '-' : formatPercent(asiaShare)}</strong>
          <small>{isRealtime ? '近即時 endpoint 成功回傳' : '跨區域廣告預算檢查點'}</small>
        </article>
        <article>
          <span>提醒命中</span>
          <strong>{alertRows.length}</strong>
          <small>{noticeEnabled ? '瀏覽器通知已嘗試啟用' : '依佔比與年增門檻'}</small>
        </article>
      </section>

      <section className="dashboard-grid">
        <div className="panel panel-wide">
          <div className="panel-head">
            <div>
              <h2>來源國比例排行</h2>
              <p>{isRealtime ? '移民署入境人次預報，近 3 小時、依國籍加總。' : '官方公開資料可得的最新年度；月資料需依觀光署發布日更新。'}</p>
            </div>
            <div className="button-row">
              <button type="button" onClick={handleExportCsv}><Download size={17} />CSV</button>
              <button type="button" onClick={handleExportJson}><Share2 size={17} />JSON</button>
            </div>
          </div>
          <div className="chart-box large">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topRows} layout="vertical" margin={{ left: 12, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={formatAxisNumber} />
                <YAxis type="category" width={92} dataKey="marketZh" />
                <Tooltip formatter={(value) => formatNumber(value)} />
                <Bar dataKey="arrivals" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {topRows.map((entry, index) => <Cell key={entry.marketEn} fill={palette[index % palette.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>市場佔比</h2>
              <p>Top {topN} 來源國</p>
            </div>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={topRows} dataKey="arrivals" nameKey="marketZh" innerRadius={58} outerRadius={92} paddingAngle={2} isAnimationActive={false}>
                  {topRows.map((entry, index) => <Cell key={entry.marketEn} fill={palette[index % palette.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => formatNumber(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel panel-wide">
          <div className="panel-head">
            <div>
              <h2>{isRealtime ? '來源快照' : '主要來源趨勢'}</h2>
              <p>{isRealtime ? '近即時資料為快照，趨勢需部署排程持續保存。' : '用年度資料看市場恢復與投放權重變化。'}</p>
            </div>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis tickFormatter={formatAxisNumber} />
                <Tooltip formatter={(value) => formatNumber(value)} />
                <Legend />
                {marketRows.slice(0, 5).map((row, index) => (
                  <Area
                    key={row.marketZh}
                    type="monotone"
                    dataKey={row.marketZh}
                    stroke={palette[index % palette.length]}
                    fill={palette[index % palette.length]}
                    fillOpacity={0.16}
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <aside className="panel alert-panel">
          <div className="panel-head">
            <div>
              <h2>提醒</h2>
              <p>佔比達 {threshold}% 或年增達 {threshold * 2}%。</p>
            </div>
            <button type="button" onClick={handleEnableNotice}><Bell size={17} />啟用</button>
          </div>
          <div className="alert-list">
            {alertRows.length === 0 && <p className="empty">目前沒有市場達到提醒門檻。</p>}
            {alertRows.map((row) => (
              <div key={row.marketEn} className="alert-item">
                <strong>{row.marketZh}</strong>
                <span>{formatPercent(row.share)} share</span>
                <small>{row.yoy == null ? '無年增資料' : <><TrendingUp size={14} />年增 {formatPercent(row.yoy)}</>}</small>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="table-band">
        <div className="panel-head">
          <div>
            <h2>市場明細</h2>
            <p>資料源: {dataset.source?.title || 'unknown'}。{isRealtime ? '公開 OpenData 為近 3 小時入境預報，依國籍、年齡、性別、機場細格彙總；正式商用仍建議自行部署並保存歷史快照。' : '官方統計採月發布，預告時效通常約 40 日。'}</p>
          </div>
          <div className="source-links">
            <a href="https://data.gov.tw/dataset/88851" target="_blank" rel="noreferrer">移民署 OpenData</a>
            <a href={officialMonthlyUrl} target="_blank" rel="noreferrer">月資料頁</a>
            <a href={releaseCalendarUrl} target="_blank" rel="noreferrer">發布規則</a>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>排名</th>
                <th>市場</th>
                <th>區域</th>
                <th>人次</th>
                <th>佔比</th>
                <th>年增</th>
              </tr>
            </thead>
            <tbody>
              {marketRows.map((row, index) => (
                <tr key={`${row.region}-${row.marketEn}`}>
                  <td>{index + 1}</td>
                  <td><strong>{row.marketZh}</strong><span>{row.marketEn}</span></td>
                  <td>{row.region}</td>
                  <td>{formatNumber(row.arrivals)}</td>
                  <td>{formatPercent(row.share)}</td>
                  <td className={row.yoy == null ? '' : row.yoy >= 0 ? 'positive' : 'negative'}>
                    {row.yoy == null ? '-' : formatPercent(row.yoy)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

export default App
