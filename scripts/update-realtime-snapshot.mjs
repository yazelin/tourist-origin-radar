import { execFile } from 'node:child_process'
import fs from 'node:fs'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const IMMIGRATION_API_BASE = 'https://opendata.immigration.gov.tw/APIS'
const PERIOD = '近3小時'

const INBOUND_ENDPOINTS = [
  { code: 'TPE1', label: '桃園機場' },
  { code: 'TSA1', label: '松山機場' },
  { code: 'KHH1', label: '高雄機場' },
  { code: 'RMQ1', label: '臺中機場' },
  { code: 'TNN1', label: '臺南機場' },
  { code: 'CYI1', label: '嘉義機場' },
  { code: 'HUN1', label: '花蓮機場' },
  { code: 'MZG1', label: '澎湖馬公機場' },
  { code: 'PIF1', label: '屏東機場' },
  { code: 'TTT1', label: '臺東機場' },
  { code: 'KNH1', label: '金門機場' },
  { code: 'LZN1', label: '馬祖南竿機場' },
  { code: 'MFK1', label: '馬祖北竿機場' },
  { code: 'WOT1', label: '澎湖望安機場' },
  { code: 'CMJ1', label: '澎湖七美機場' },
  { code: 'GNI1', label: '綠島機場' },
  { code: 'KYD1', label: '蘭嶼機場' },
  { code: 'HCN1', label: '恆春機場' },
]

const countryNames = {
  AUS: ['澳洲', 'Australia'],
  CAN: ['加拿大', 'Canada'],
  CHN: ['中國大陸', 'China'],
  DEU: ['德國', 'Germany'],
  FRA: ['法國', 'France'],
  GBR: ['英國', 'United Kingdom'],
  HKG: ['香港', 'Hong Kong'],
  IDN: ['印尼', 'Indonesia'],
  IND: ['印度', 'India'],
  JPN: ['日本', 'Japan'],
  KHM: ['柬埔寨', 'Cambodia'],
  KOR: ['韓國', 'Korea'],
  MAC: ['澳門', 'Macao'],
  MYS: ['馬來西亞', 'Malaysia'],
  PHL: ['菲律賓', 'Philippines'],
  SGP: ['新加坡', 'Singapore'],
  THA: ['泰國', 'Thailand'],
  USA: ['美國', 'United States'],
  VNM: ['越南', 'Vietnam'],
}

function numberFromCell(value) {
  const parsed = Number(String(value ?? '').replaceAll(',', '').trim())
  return Number.isFinite(parsed) ? parsed : 0
}

function marketName(code) {
  const normalized = String(code || 'UNK').trim().toUpperCase()
  const mapped = countryNames[normalized]
  if (mapped) return { marketZh: mapped[0], marketEn: mapped[1] }
  return { marketZh: normalized, marketEn: normalized }
}

async function fetchEndpoint(endpoint) {
  try {
    const { stdout } = await execFileAsync(
      'curl',
      [
        '-sS',
        '-L',
        '--max-time',
        '12',
        '-A',
        'Mozilla/5.0 tourist-origin-radar-snapshot/1.0',
        '-H',
        'Accept: application/json,text/plain,*/*',
        `${IMMIGRATION_API_BASE}/${endpoint.code}`,
      ],
      { timeout: 15000, maxBuffer: 8 * 1024 * 1024 },
    )
    const rows = JSON.parse(stdout)
    if (!Array.isArray(rows)) throw new Error('payload is not an array')
    return { endpoint, rows, error: null }
  } catch (error) {
    return {
      endpoint,
      rows: [],
      error: error instanceof Error ? error.message : 'unknown error',
    }
  }
}

const fetchedAt = new Date().toISOString()
const results = await Promise.all(INBOUND_ENDPOINTS.map(fetchEndpoint))
const grouped = new Map()
const airportTotals = new Map()
let totalAll = 0

for (const result of results) {
  for (const row of result.rows) {
    if (String(row.inOutTransit || '').trim() !== '1') continue
    const pax = numberFromCell(row.paxCnt)
    if (pax <= 0) continue

    const nationality = String(row.nationality || 'UNK').trim().toUpperCase()
    const airport = String(row.airport || result.endpoint.code.replace(/\d+$/, '')).trim()
    totalAll += pax
    airportTotals.set(airport, (airportTotals.get(airport) || 0) + pax)

    const current = grouped.get(nationality) || {
      code: nationality,
      count: 0,
      airports: {},
    }
    current.count += pax
    current.airports[airport] = (current.airports[airport] || 0) + pax
    grouped.set(nationality, current)
  }
}

if (totalAll === 0) {
  console.error('No usable immigration APIS rows returned; keeping existing snapshot.')
  console.error(JSON.stringify(results.map((result) => ({
    code: result.endpoint.code,
    rows: result.rows.length,
    ok: !result.error,
    error: result.error,
  })), null, 2))
  process.exit(2)
}

const rows = [...grouped.values()]
  .sort((a, b) => b.count - a.count)
  .map((item) => {
    const names = marketName(item.code)
    return {
      region: '近即時入境',
      marketZh: names.marketZh,
      marketEn: names.marketEn,
      nationality: item.code,
      isDomestic: item.code === 'TWN',
      airports: item.airports,
      values: { [PERIOD]: item.count },
    }
  })

const totalForeign = rows
  .filter((row) => !row.isDomestic)
  .reduce((sum, row) => sum + row.values[PERIOD], 0)
const endpointStatus = results.map((result) => ({
  code: result.endpoint.code,
  label: result.endpoint.label,
  rows: result.rows.length,
  ok: !result.error,
  error: result.error,
}))

const snapshot = {
  years: [PERIOD],
  totals: { [PERIOD]: totalAll },
  rows,
  source: {
    mode: 'realtime',
    title: '排程快照備援: 移民署入境人次預報 OpenData',
    url: 'https://data.gov.tw/dataset/88851',
    apiBase: IMMIGRATION_API_BASE,
    fetchedAt,
    cadence: 'GitHub Actions 每小時嘗試更新；資料集說明為近3小時入境人次、每小時更新',
    totalAll,
    totalForeign,
    endpoints: endpointStatus,
    airportTotals: Object.fromEntries([...airportTotals.entries()].sort()),
    note: '來源資料包含本國籍入境；dashboard 預設排除 TWN，以呈現行銷常用外籍來源市場，可在設定中切換。',
    snapshot: true,
    snapshotReason: 'Vercel production cannot reach NIA APIS directly; this snapshot is updated by GitHub Actions when the runner can access the upstream API.',
    fallbackFor: 'IMMIGRATION_APIS_NO_DATA',
  },
}

fs.writeFileSync(
  new URL('../api/arrivals/realtimeSnapshot.js', import.meta.url),
  `export const realtimeSnapshot = ${JSON.stringify(snapshot, null, 2)}\n`,
)

console.log(JSON.stringify({
  fetchedAt,
  totalAll,
  totalForeign,
  markets: rows.length,
  airports: snapshot.source.airportTotals,
}, null, 2))
