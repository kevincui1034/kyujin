import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
await page.goto('http://localhost:8765/preview.html', { waitUntil: 'networkidle' });
await page.waitForFunction(
  () => (document.getElementById('dash')?.children.length ?? 0) > 0,
  { timeout: 30000 },
);
await page.waitForTimeout(800);

// Find every direct card by class containing 'pillow' or similar.
const boxes = await page.evaluate(() => {
  const dash = document.getElementById('dash');
  const out = [];
  const walk = (el, depth = 0) => {
    if (depth > 6) return;
    const r = el.getBoundingClientRect();
    const text = el.textContent?.slice(0, 60).replace(/\s+/g, ' ').trim();
    out.push({
      tag: el.tagName,
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60),
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      text: text?.slice(0, 50),
    });
    for (const c of el.children) walk(c, depth + 1);
  };
  if (dash) walk(dash);
  return out;
});

// Print every node whose text starts with markers we care about.
const markers = ['ACTIVE THREADS', 'THIS WEEK', 'FUNNEL', 'CURRENT GOAL', 'SENT', 'RESPONSE'];
for (const m of markers) {
  const hits = boxes.filter((b) => b.text?.toUpperCase().startsWith(m));
  for (const h of hits.slice(0, 1)) {
    console.log(m.padEnd(18), JSON.stringify(h));
  }
}

// Also print top-level structure
const dashBox = await page.locator('#dash').boundingBox();
console.log('\n#dash:', dashBox);

await browser.close();
