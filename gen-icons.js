const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const sizes = [1024, 512, 256, 128, 64, 32, 16];

  function makeHtml(size, mode) {
    const isDark = mode === 'dark';
    const bg = isDark
      ? 'linear-gradient(160deg, #2a2a2a 0%, #111111 40%, #0a0a0a 100%)'
      : 'linear-gradient(160deg, #ffffff 0%, #f0f0f0 40%, #e8e8e8 100%)';
    const sa1 = isDark ? 0.3 : 0.6;
    const sa2 = isDark ? 0.25 : 0.5;
    const sa3 = isDark ? 0.15 : 0.3;
    const sa4 = isDark ? 0.12 : 0.25;
    const ambA = isDark ? 0.06 : 0.15;
    const logoFilter = isDark ? 'invert(1)' : 'none';
    const r = size * 0.22;
    const bw = Math.max(1.5, size * 0.004);

    let bottomShadow = '';
    if (!isDark) {
      bottomShadow = `<div style="
        position:absolute;bottom:-1px;left:0;right:0;height:${size*0.3}px;
        border-radius:0 0 ${r}px ${r}px;
        border-bottom:${Math.max(1,size*0.003)}px solid rgba(0,0,0,0.08);
        border-left:${Math.max(1,size*0.002)}px solid rgba(0,0,0,0.04);
        border-right:${Math.max(1,size*0.002)}px solid rgba(0,0,0,0.04);
        border-top:none;
        mask-image:linear-gradient(0deg,white 0%,transparent 100%);
        -webkit-mask-image:linear-gradient(0deg,white 0%,transparent 100%);
      "></div>`;
    }

    return `<html><body style="margin:0;padding:0;background:transparent;width:${size}px;height:${size}px">
      <div style="width:${size}px;height:${size}px;position:relative;border-radius:${r}px;overflow:hidden;background:${bg}">
        <div style="position:absolute;top:-1px;left:-1px;width:${size*0.6}px;height:${size*0.6}px;
          border-radius:${r}px 0 0 0;
          border-top:${bw}px solid rgba(255,255,255,${sa1});
          border-left:${bw}px solid rgba(255,255,255,${sa2});
          border-right:none;border-bottom:none;
          mask-image:linear-gradient(135deg,white 0%,transparent 100%);
          -webkit-mask-image:linear-gradient(135deg,white 0%,transparent 100%);
        "></div>
        <div style="position:absolute;bottom:-1px;right:-1px;width:${size*0.6}px;height:${size*0.6}px;
          border-radius:0 0 ${r}px 0;
          border-bottom:${bw}px solid rgba(255,255,255,${sa3});
          border-right:${bw}px solid rgba(255,255,255,${sa4});
          border-top:none;border-left:none;
          mask-image:linear-gradient(315deg,white 0%,transparent 100%);
          -webkit-mask-image:linear-gradient(315deg,white 0%,transparent 100%);
          margin-left:auto;margin-top:auto;
        "></div>
        ${bottomShadow}
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
          <img src="http://localhost:3000/bitbit-app-icon.png" style="width:68%;height:68%;object-fit:contain;filter:${logoFilter};opacity:0.95" />
        </div>
        <div style="position:absolute;inset:0;border-radius:inherit;
          background:radial-gradient(ellipse at 20% 15%,rgba(255,255,255,${ambA}) 0%,transparent 50%);
        "></div>
      </div>
    </body></html>`;
  }

  for (const mode of ['dark', 'light']) {
    for (const size of sizes) {
      const dpr = size <= 64 ? 2 : 1;
      const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: dpr });
      await page.setContent(makeHtml(size, mode));
      await page.waitForTimeout(400);
      const suffix = mode === 'dark' ? '' : '-light';
      await page.screenshot({ path: '/home/claude/bitbit/personal-assistant/public/bitbit-icon-' + size + suffix + '.png', omitBackground: true });
      console.log(mode + ' ' + size);
      await page.close();
    }
  }

  await browser.close();
  console.log('All done');
})();
