import Papa from 'papaparse'

const OFFICIAL_ANNUAL_CSV = 'https://stat.taiwan.net.tw/data/opendata/7'

function numberFromCell(value) {
  const cleaned = String(value ?? '').replaceAll(',', '').trim()
  if (!cleaned || cleaned === '-') return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function splitMarketName(rawName) {
  const normalized = String(rawName || '').replace(/\s+/g, ' ').trim()
  const match = normalized.match(/^(.+?)\s+([A-Za-z][A-Za-z .'-]+)$/)
  return {
    zh: match ? match[1].trim() : normalized,
    en: match ? match[2].replace(/\s+\./g, '.').trim() : normalized,
  }
}

function parseAnnualResidenceCsv(csv) {
  const result = Papa.parse(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  })

  if (result.errors.length) {
    throw new Error(`CSV parse failed: ${result.errors[0].message}`)
  }

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
        values: Object.fromEntries(years.map((year) => [year, numberFromCell(row[year])])),
      }
    })

  const totals = result.data
    .filter((row) => /Grand Total/i.test(String(row['細分'] || '')))
    .map((row) => Object.fromEntries(years.map((year) => [year, numberFromCell(row[year])])))[0]

  return { years, rows, totals }
}

export default async function handler(_request, response) {
  try {
    const sourceResponse = await fetch(OFFICIAL_ANNUAL_CSV, {
      headers: { Accept: 'text/csv,text/plain;q=0.9,*/*;q=0.1' },
    })

    if (!sourceResponse.ok) {
      throw new Error(`Official CSV returned ${sourceResponse.status}`)
    }

    const csv = await sourceResponse.text()
    response.setHeader('Cache-Control', 's-maxage=43200, stale-while-revalidate=86400')
    response.status(200).json({
      ...parseAnnualResidenceCsv(csv),
      source: {
        title: '歷年來台旅客居住地統計',
        url: OFFICIAL_ANNUAL_CSV,
        fetchedAt: new Date().toISOString(),
        cadence: 'annual open data; monthly official statistics are published separately',
      },
    })
  } catch (error) {
    response.status(502).json({
      error: 'OFFICIAL_DATA_UNAVAILABLE',
      message: error instanceof Error ? error.message : 'Unknown fetch error',
    })
  }
}
