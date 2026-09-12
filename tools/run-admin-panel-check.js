const playwright = require('playwright');

(async () => {
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const logs = [];
  page.on('console', (msg) => {
    logs.push({ type: 'console.' + msg.type(), text: msg.text() });
  });
  page.on('pageerror', (err) => {
    logs.push({ type: 'pageerror', text: String(err) });
  });

  try {
    await page.goto('http://localhost:3001', { waitUntil: 'networkidle' });
    // Click Admin button in top-right
    await page.click('button:has-text("Admin")');
    await page.waitForSelector('text=Admin Panel', { timeout: 5000 });

    const tabs = [
      'Dashboard',
      'Users',
      'Services',
      'Jobs',
      'Requests',
      'Reviews',
      'Payments',
      'Fees',
      'Reports',
      'Categories',
      'Settings',
    ];

    for (const t of tabs) {
      try {
        await page.click(`button:has-text("${t}")`);
      } catch (e) {
        // ignore if a tab isn't present
      }
      await page.waitForTimeout(300);
    }

    // allow any async console messages to appear
    await page.waitForTimeout(500);
  } catch (err) {
    logs.push({ type: 'script-error', text: String(err) });
  } finally {
    await browser.close();
    console.log(JSON.stringify(logs, null, 2));
  }
})();
