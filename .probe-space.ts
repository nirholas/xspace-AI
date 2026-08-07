import 'dotenv/config'
import puppeteer from 'puppeteer'

const url = (process.argv[2] || '').split('?')[0]

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-fake-ui-for-media-stream'],
  })
  const page = await browser.newPage()
  const domain = '.x.com'
  await browser.setCookie(
    { name: 'auth_token', value: process.env.X_AUTH_TOKEN!, domain, path: '/' },
    { name: 'ct0', value: process.env.X_CT0!, domain, path: '/' },
  )
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 })
  await new Promise((r) => setTimeout(r, 6000))

  console.log('FINAL URL:', page.url())
  const text = await page.evaluate(() => document.body.innerText)
  console.log('--- PAGE TEXT (first 1500) ---')
  console.log(text.slice(0, 1500))
  await page.screenshot({ path: '/workspaces/xspace-AI/.space-probe.png', fullPage: false })
  console.log('--- screenshot saved ---')
  await browser.close()
}
main().catch((e) => {
  console.error('PROBE FAILED:', e?.message ?? e)
  process.exit(1)
})
