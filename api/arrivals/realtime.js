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
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(`${IMMIGRATION_API_BASE}/${endpoint.code}`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json,text/plain;q=0.9,*/*;q=0.1',
        'User-Agent': 'Mozilla/5.0 tourist-origin-radar/1.0',
      },
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const rows = JSON.parse(text)
    if (!Array.isArray(rows)) throw new Error('payload is not an array')
    return { endpoint, rows, error: null }
  } catch (error) {
    return {
      endpoint,
      rows: [],
      error: error instanceof Error ? error.message : 'unknown error',
    }
  } finally {
    clearTimeout(timer)
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

      // Marketing source mix is more useful when returning Taiwanese nationals are not the top bucket.
      if (nationality === 'TWN') continue

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
        airports: item.airports,
        values: { [PERIOD]: item.count },
      }
    })

  const total = rows.reduce((sum, row) => sum + row.values[PERIOD], 0)
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
      totalForeign: total,
      endpoints: endpointStatus,
      airportTotals: Object.fromEntries([...airportTotals.entries()].sort()),
      note: '來源資料包含本國籍入境；本 dashboard 的來源國比例預設排除 TWN，以呈現行銷常用外籍來源市場。',
    },
  })
}
