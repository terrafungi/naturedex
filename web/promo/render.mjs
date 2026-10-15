// Renders the promo video (web/promo.html) frame by frame with headless Chromium, then encodes it.
//   node promo/render.mjs                 → promo/out/naturedex-promo.mp4 (+ -sans-musique.mp4)
//   node promo/render.mjs --stills 1,8.5  → promo/out/still-<t>.jpg, to check a few moments
// Needs puppeteer-core and ffmpeg-static, installed outside the project: PROMO_TOOLS (default /tmp/promo-tools).
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { FPS } from '../src/promo/timeline.js';
import { writeSoundtrack } from './music.mjs';

const tools = createRequire(`${process.env.PROMO_TOOLS || '/tmp/promo-tools'}/package.json`);
const puppeteer = tools('puppeteer-core');
const ffmpeg = tools('ffmpeg-static');

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = fileURLToPath(new URL('./out/', import.meta.url));
const frames = '/tmp/promo-frames';
const args = process.argv.slice(2);
const stills = args.includes('--stills') ? args[args.indexOf('--stills') + 1].split(',').map(Number) : null;
const WORKERS = 6;

mkdirSync(outDir, { recursive: true });
const server = await createServer({ root, logLevel: 'error', server: { port: 5199, strictPort: true } });
await server.listen();
// One browser per worker: background tabs of a shared browser get no animation frames.
const browsers = [];
async function openPage() {
    const browser = await puppeteer.launch({
        executablePath: process.env.CHROME || '/usr/bin/chromium',
        protocolTimeout: 120000,
        args: ['--no-sandbox', '--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none'],
    });
    browsers.push(browser);
    const [page] = await browser.pages();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    await page.goto('http://localhost:5199/promo.html?render', { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForFunction(() => window.__seek);
    return page;
}

try {
    if (stills) {
        const page = await openPage();
        for (const t of stills) {
            await page.evaluate((t) => window.__seek(t), t);
            await page.screenshot({ path: `${outDir}still-${t}.jpg`, type: 'jpeg', quality: 85 });
            console.log('still', t);
        }
    } else {
        const duration = await (await openPage()).evaluate(() => window.__duration);
        const total = Math.round(duration * FPS);
        rmSync(frames, { recursive: true, force: true });
        mkdirSync(frames, { recursive: true });
        let next = 0, done = 0;
        const started = Date.now();
        await Promise.all(Array.from({ length: WORKERS }, async () => {
            const page = await openPage();
            while (next < total) {
                const i = next++;
                await page.evaluate((t) => window.__seek(t), i / FPS);
                await page.screenshot({ path: `${frames}/f${String(i).padStart(5, '0')}.png`, type: 'png' });
                if (++done % 60 === 0) console.log(`${done}/${total} frames, ${Math.round((Date.now() - started) / 1000)} s`);
            }
        }));
        const wav = `${frames}/music.wav`;
        writeSoundtrack(wav, duration);
        const video = ['-framerate', String(FPS), '-i', `${frames}/f%05d.png`];
        const enc = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
        execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...video, '-i', wav, ...enc, '-c:a', 'aac', '-b:a', '192k', '-shortest', `${outDir}naturedex-promo.mp4`]);
        execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...video, ...enc, `${outDir}naturedex-promo-sans-musique.mp4`]);
        console.log('ok', `${outDir}naturedex-promo.mp4`, existsSync(`${outDir}naturedex-promo.mp4`));
    }
} finally {
    await Promise.all(browsers.map((b) => b.close()));
    await server.close();
}
