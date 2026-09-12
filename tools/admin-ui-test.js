const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', msg => {
    logs.push({ type: msg.type(), text: msg.text() });
  });
  try {
    await page.goto('http://localhost:3001', { waitUntil: 'networkidle' });
    // Open Admin overlay button
    await page.waitForSelector('button:has-text("Admin")', { timeout: 5000 });
    await page.click('button:has-text("Admin")');
    // Wait for admin panel to render
    await page.waitForSelector('h1:has-text("Admin Panel")', { timeout: 5000 });

    const tabs = ["Dashboard","Users","Services","Jobs","Requests","Reviews","Payments","Fees","Reports","Categories","Settings"];
    for (const t of tabs) {
      try {
        // Click nav button by text
        await page.click(`button:has-text("${t}")`);
        await page.waitForTimeout(600);
      } catch (e) {
        // ignore per-tab click failures
      }
    }

    // give a moment for any async console errors to appear
    await page.waitForTimeout(1000);

    console.log('--- BROWSER CONSOLE LOGS START ---');
    if (logs.length === 0) console.log('(no console messages)');
    for (const l of logs) {
      console.log(`${l.type}: ${l.text}`);
    }
    console.log('--- BROWSER CONSOLE LOGS END ---');
  } catch (err) {
    console.error('TEST ERROR:', err);
    process.exitCode = 2;
  } finally {
    await browser.close();
  }
})();
