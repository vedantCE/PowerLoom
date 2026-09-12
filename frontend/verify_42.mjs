import { chromium } from 'playwright'

const BASE = 'http://localhost:5175'
const SHOTS = '/private/tmp/claude-501/-Users-vedantbhatt-Desktop-Hackthone-PowerLoom-PowerLoom/576f9664-bdfb-4665-ba3c-a21eac0f14c1/scratchpad/shots42'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } })
const consoleMsgs = []
page.on('console', (msg) => consoleMsgs.push(`[${msg.type()}] ${msg.text()}`))
page.on('pageerror', (err) => consoleMsgs.push('pageerror: ' + err.message))

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('text=Energy Mix Dispatch', { timeout: 15000 })
await page.waitForTimeout(1500)

await page.screenshot({ path: `${SHOTS}/01-default.png`, fullPage: true })

// Check chart data points count (48 hours) via the SVG paths existing
const chartInfo = await page.evaluate(() => {
  const svgs = document.querySelectorAll('.recharts-wrapper svg')
  return { svgCount: svgs.length }
})
console.log('CHART_SVGS=', JSON.stringify(chartInfo))

// Click "Compare naive" toggle on Energy Mix Chart
const compareBtn = page.getByRole('button', { name: /Compare naive/ }).first()
await compareBtn.click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${SHOTS}/02-compare-naive.png`, fullPage: true })

// Click "Show curtailed"
const curtailBtn = page.getByRole('button', { name: /Show curtailed/ })
await curtailBtn.click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${SHOTS}/03-show-curtailed.png`, fullPage: true })

// Click a point on the mix chart to select an hour, then check ExplainBox + HourTimeline sync
const chartArea = page.locator('.recharts-wrapper').first()
const box = await chartArea.boundingBox()
if (box) {
  // click near 1/3 across width (roughly hour ~16, a daytime hour)
  await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.5)
}
await page.waitForTimeout(700)
await page.screenshot({ path: `${SHOTS}/04-click-hour.png`, fullPage: true })

const explainHourText = await page.locator('text=Optimizer Decision Explainer').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]').innerText()
console.log('--- EXPLAIN AFTER CHART CLICK ---')
console.log(explainHourText.slice(0, 200))

// Switch language to Gujarati and confirm chart labels translate
await page.locator('button[id="lang-btn-gu"]').click().catch(async () => {
  await page.getByRole('button', { name: 'ગુજરાતી' }).click()
})
await page.waitForTimeout(700)
await page.screenshot({ path: `${SHOTS}/05-gujarati.png`, fullPage: true })

console.log('CONSOLE_ERRORS=', JSON.stringify(consoleMsgs.filter(m => m.startsWith('[error]') || m.startsWith('pageerror'))))

await browser.close()
