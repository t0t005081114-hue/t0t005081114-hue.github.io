// Render the soundtrack inside the page (OfflineAudioContext → 16-bit WAV in the page → base64) and write it to disk
const fs = require('fs'); const { openShowreel } = require('./page.cjs');
const [htmlPath, outWav] = process.argv.slice(2);
(async () => {
  const { browser, page, errors } = await openShowreel(htmlPath);
  const r = await page.evaluate(async () => await window.renderSoundtrack());
  await browser.close();
  const buf = Buffer.from(r.base64, 'base64'); fs.writeFileSync(outWav, buf);
  console.log(`wrote ${outWav}: ${r.frames} frames @ ${r.sampleRate} Hz x ${r.channels} ch = ${(r.frames / r.sampleRate).toFixed(4)} s, peak ${r.peak.toFixed(3)}`);
  // level check from the PCM itself
  const pcm = new Int16Array(buf.buffer, buf.byteOffset + 44, (buf.length - 44) / 2), ch = r.channels, sr = r.sampleRate;
  const win = (a, b, fn) => { let v = 0, n = 0; for (let i = Math.floor(a * sr); i < Math.floor(b * sr); i++) for (let c = 0; c < ch; c++) { const s = Math.abs(pcm[i * ch + c]) / 32768; v = fn === 'peak' ? Math.max(v, s) : v + s * s; n++; } return fn === 'peak' ? v : Math.sqrt(v / n); };
  const db = x => (20 * Math.log10(x + 1e-9)).toFixed(1) + ' dB';
  for (const t of [0, 3, 6, 9, 12]) console.log(`hit @${t}s peak ${db(win(t, t + 0.15, 'peak'))}`);
  console.log('riser rms 9.0-9.5', db(win(9.0, 9.5)), '| 11.5-12.0', db(win(11.5, 11.995)));
  console.log('beats 25-26 cleared space rms 12.6-13.0', db(win(12.6, 13.0)), '| typical beat rms 4.0-4.5', db(win(4.0, 4.5)));
  if (errors.length) console.log(errors.join('\n'));
})().catch(e => { console.error(e); process.exit(1); });
