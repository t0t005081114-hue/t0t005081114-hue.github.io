// Numeric QA: 3D overlap scan, loop identity (t=15 vs t=0), determinism (seek order independence)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { openShowreel } = require('./page.cjs');
const htmlPath = process.argv[2];
const psnr = (a, b) => {
  const out = execFileSync('ffmpeg', ['-v', 'info', '-i', a, '-i', b, '-lavfi', 'psnr', '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  return out;
};
const psnrOf = (a, b) => { try { execFileSync('ffmpeg', ['-v', 'info', '-i', a, '-i', b, '-lavfi', 'psnr', '-f', 'null', '-'], { stdio: 'pipe' }); } catch (e) {} 
  const r = require('child_process').spawnSync('ffmpeg', ['-v', 'info', '-i', a, '-i', b, '-lavfi', 'psnr', '-f', 'null', '-']);
  const m = r.stderr.toString().match(/average:(\S+)/); return m ? m[1] : '?'; };
(async () => {
  const dir = path.join(path.dirname(path.resolve(htmlPath)), 'frames'); fs.mkdirSync(dir, { recursive: true });
  const { browser, page, errors } = await openShowreel(htmlPath);
  // 1) overlap scan of the 3D solids: projected x-extent of each solid's real vertices
  const ov = await page.evaluate(() => {
    let worst = { gap: Infinity, t: 0, pair: '' };
    for (let f = 0; f < 360; f++) {
      const t = 6 + f / 120, ext = [];
      for (let i = 0; i < 6; i++) {
        const o = R.objs[i], P = objPose(i, t); let x0 = Infinity, x1 = -Infinity;
        for (const z of [0, P.D]) for (const q of o.poly) { const p = project(worldPt(o, P, [q[0], q[1], z])); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); }
        ext.push([x0, x1]);
      }
      for (let i = 0; i < 5; i++) { const g = ext[i + 1][0] - ext[i][1]; if (g < worst.gap) worst = { gap: +g.toFixed(1), t: +t.toFixed(3), pair: `${i}-${i + 1}` }; }
    }
    return worst;
  });
  console.log('3D min horizontal gap between neighbouring solids (negative = overlap):', JSON.stringify(ov));
  // 2) loop identity
  const shot = async (t, name) => { await page.evaluate(x => window.seek(x), t); const f = path.join(dir, name); await page.screenshot({ path: f, clip: { x: 0, y: 0, width: 1920, height: 1080 } }); return f; };
  const a = await shot(0, 'qa_t0.png'), b = await shot(15, 'qa_t15.png'), c = await shot(14.99, 'qa_t1499.png');
  console.log('PSNR seek(15) vs seek(0):', psnrOf(a, b), '(inf = pixel-identical)');
  console.log('PSNR seek(14.99) vs seek(0):', psnrOf(a, c));
  // 3) determinism: 7.3 directly vs after other seeks
  const d1 = await shot(7.3, 'qa_d1.png'); await page.evaluate(() => { window.seek(2.0); window.seek(11.9); });
  const d2 = await shot(7.3, 'qa_d2.png');
  console.log('PSNR seek(7.3) fresh vs after seek(2.0),seek(11.9):', psnrOf(d1, d2));
  for (const f of [a, b, c, d1, d2]) fs.unlinkSync(f);
  await browser.close();
  console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors, no network requests');
})().catch(e => { console.error(e); process.exit(1); });
