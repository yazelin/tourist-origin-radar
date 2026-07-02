import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const IMMIGRATION_API_BASE = 'https://opendata.immigration.gov.tw/APIS'
const PERIOD = '近3小時'
const execFileAsync = promisify(execFile)

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
        'Mozilla/5.0 tourist-origin-radar/1.0',
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

export default async function handler(_request, response) {
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

  const total = rows.reduce((sum, row) => sum + row.values[PERIOD], 0)
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

  if (totalAll === 0) {
    response.status(502).json({
      error: 'IMMIGRATION_APIS_NO_DATA',
      message: '移民署 APIS 未回傳可用入境資料；常見原因是部署所在雲端 IP 被上游封鎖或所有 endpoint 暫無資料。',
      source: {
        mode: 'realtime',
        title: '移民署入境人次預報 OpenData',
        url: 'https://data.gov.tw/dataset/88851',
        apiBase: IMMIGRATION_API_BASE,
        fetchedAt,
        endpoints: endpointStatus,
      },
    })
    return
  }

  response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
  response.status(200).json({
    years: [PERIOD],
    totals: { [PERIOD]: total },
    rows,
    source: {
      mode: 'realtime',
      title: '移民署入境人次預報 OpenData',
      url: 'https://data.gov.tw/dataset/88851',
      apiBase: IMMIGRATION_API_BASE,
      fetchedAt,
      cadence: '近3小時入境人次；資料集說明為每小時更新',
      totalAll,
      totalForeign,
      endpoints: endpointStatus,
      airportTotals: Object.fromEntries([...airportTotals.entries()].sort()),
      note: '來源資料包含本國籍入境；dashboard 預設排除 TWN，以呈現行銷常用外籍來源市場，可在設定中切換。',
    },
  })
}
