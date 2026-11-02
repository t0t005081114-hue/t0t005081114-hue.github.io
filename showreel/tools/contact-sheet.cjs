// 30 stills, one per beat (t = 0.0 … 14.5), tiled 6 x 5 with beat labels → contact-sheet.png
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { openShowreel } = require('./page.cjs');
const [htmlPath, outPng, fontFile, ...extra] = process.argv.slice(2);
(async () => {
  const framesDir = path.join(path.dirname(path.resolve(htmlPath)), 'frames');
  fs.mkdirSync(framesDir, { recursive: true });
  const { browser, page, errors, fontOK } = await openShowreel(htmlPath);
  console.log('font check', JSON.stringify(fontOK));
  const times = extra.length ? extra.map(Number) : Array.from({ length: 30 }, (_, b) => b * 0.5);
  const files = [];
  for (let k = 0; k < times.length; k++) {
    await page.evaluate(t => window.seek(t), times[k]);
    const f = path.join(framesDir, `cs_${String(k).padStart(2, '0')}.png`);
    await page.screenshot({ path: f, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
    files.push(f);
  }
  await browser.close();
  if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
  const cols = extra.length ? Math.min(times.length, 3) : 6, rows = Math.ceil(times.length / cols);
  const tw = extra.length ? 960 : 480, th = tw * 9 / 16;
  const label = k => extra.length ? `t=${times[k].toFixed(3)}` : `BEAT ${k + 1}  t=${times[k].toFixed(1)}s`;
  // label each still, then tile
  const labeled = files.map((f, k) => {
    const o = f.replace('.png', '_l.png');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', f, '-vf',
      `scale=${tw}:${th}:flags=lanczos,pad=${tw}:${th + 34}:0:34:color=0x202020,drawtext=fontfile=${fontFile}:text='${label(k)}':x=10:y=7:fontsize=20:fontcolor=white`, o]);
    fs.unlinkSync(f); return o;
  });
  const listInputs = labeled.flatMap(f => ['-i', f]);
  const filter = labeled.map((_, k) => `[${k}:v]`).join('') + `xstack=inputs=${labeled.length}:layout=` +
    labeled.map((_, k) => `${(k % cols) * (tw + 6)}_${Math.floor(k / cols) * (th + 40)}`).join('|') + `:fill=0x101010`;
  if (labeled.length === 1) fs.copyFileSync(labeled[0], outPng);
  else execFileSync('ffmpeg', ['-v', 'error', '-y', ...listInputs, '-filter_complex', filter, '-frames:v', '1', outPng]);
  labeled.forEach(f => fs.unlinkSync(f));
  console.log('wrote', outPng);
})().catch(e => { console.error(e.message); process.exit(1); });
