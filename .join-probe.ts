import 'dotenv/config'
import puppeteer from 'puppeteer'

const url = (process.argv[2] || '').split('?')[0]

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--window-size=1280,900',
    ],
    defaultViewport: { width: 1280, height: 900 },
  })
  const ctx = browser.defaultBrowserContext()
  await ctx.overridePermissions('https://x.com', ['microphone'])

  const page = await browser.newPage()
  const domain = '.x.com'
  await browser.setCookie(
    { name: 'auth_token', value: process.env.X_AUTH_TOKEN!, domain, path: '/' },
    { name: 'ct0', value: process.env.X_CT0!, domain, path: '/' },
  )

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 })
  await new Promise((r) => setTimeout(r, 6000))
  console.log('URL after load:', page.url())

  // Enumerate every clickable that looks like a join affordance, with geometry
  const candidates = await page.evaluate(() => {
    return [...document.querySelectorAll('button, [role="button"]')]
      .map((b) => {
        const r = b.getBoundingClientRect()
        return {
          aria: b.getAttribute('aria-label') || '',
          text: (b.textContent || '').trim().slice(0, 40),
          testid: b.getAttribute('data-testid') || '',
          x: Math.round(r.x + r.width / 2),
          y: Math.round(r.y + r.height / 2),
          w: Math.round(r.width),
          h: Math.round(r.height),
          visible: r.width > 0 && r.height > 0,
        }
      })
      .filter(
        (b) =>
          /listen|join|tune in/i.test(b.aria) || /listen|join|tune in/i.test(b.text),
      )
  })
  console.log('JOIN CANDIDATES:', JSON.stringify(candidates, null, 2))

  // Click the real "Start listening" via an actual mouse event at its centre
  const target = candidates.find(
    (c) => c.visible && /start listening/i.test(c.text + ' ' + c.aria),
  )
  if (!target) {
    console.log('NO START LISTENING BUTTON FOUND')
    await page.screenshot({ path: '/workspaces/xspace-AI/.join-probe.png' })
    await browser.close()
    return
  }
  console.log('clicking at', target.x, target.y)
  await page.mouse.click(target.x, target.y)
  await new Promise((r) => setTimeout(r, 8000))

  console.log('URL after click:', page.url())
  const after = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, [role="button"]')].map(
      (b) => (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 30),
    )
    return { text: document.body.innerText.slice(0, 600), btns: btns.filter(Boolean).slice(0, 40) }
  })
  console.log('--- PAGE TEXT ---\n', after.text)
  console.log('--- BUTTONS ---\n', JSON.stringify(after.btns))
  await page.screenshot({ path: '/workspaces/xspace-AI/.join-probe.png' })
  console.log('screenshot saved')
  await browser.close()
}

main().catch((e) => {
  console.error('FAILED:', e?.message ?? e)
  process.exit(1)
})
