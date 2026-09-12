const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const url = process.env.APP_URL || 'http://localhost:3002';
  const out = [];

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', (msg) => {
    out.push({ type: 'console', text: msg.text() });
  });
  page.on('pageerror', (err) => {
    out.push({ type: 'pageerror', text: String(err) });
  });


  await page.goto(url, { waitUntil: 'networkidle' });
  // Click Admin button (fixed in top-right)
  try {
    await page.waitForSelector('button:has-text("Admin")', { timeout: 10000 });
    await page.click('button:has-text("Admin")');
  } catch (e) {
    out.push({ type: 'error', text: 'Admin button not found: ' + String(e) });
  }

  // Wait for admin panel to render
  await page.waitForSelector('nav[aria-label="Admin sections"]', { timeout: 10000 }).catch(() => {
    out.push({ type: 'error', text: 'Admin sections nav not found' });
  });

  // Click each admin tab
  const tabs = await page.$$(`nav[aria-label="Admin sections"] button`);
  for (let i = 0; i < tabs.length; i++) {
    try {
      await tabs[i].click();
      await page.waitForTimeout(500);
    } catch (e) {
      out.push({ type: 'error', text: `Failed clicking tab ${i}: ${e}` });
    }
  }

  // Capture snapshot of DOM for TokenPanel presence
  const tokenPanel = await page.$('text=Dev: Pi Access Token');
  out.push({ type: 'tokenPanelPresent', present: Boolean(tokenPanel) });

  await browser.close();

  fs.writeFileSync('tools/verify-token-panel-output.json', JSON.stringify(out, null, 2));
  console.log('Playwright run complete. Output written to tools/verify-token-panel-output.json');
})();
