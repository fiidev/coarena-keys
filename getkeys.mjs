#!/usr/bin/env node
// Ambil API key coarena.ai pakai browser asli + profil yang sudah login Google.
// Zen/Firefox: profil asli. Chromium family: profil khusus (Chrome 136+ blokir otomasi di profil utama).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const arg = (n, d = null) => { const i = process.argv.indexOf('--' + n); return i > 0 ? (process.argv[i + 1] ?? true) : d; };
const has = n => process.argv.includes('--' + n);
const OUT = String(arg('out', 'keys.csv'));
const BROWSER = String(arg('browser', 'zen'));
const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const die = m => { console.error('ERROR: ' + m); process.exit(1); };

const CHROMIUM = {
  chrome: ['google-chrome-stable', 'google-chrome', 'chrome'],
  chromium: ['chromium', 'chromium-browser'],
  brave: ['brave-browser', 'brave'],
  edge: ['microsoft-edge-stable', 'microsoft-edge', 'msedge'],
  vivaldi: ['vivaldi-stable', 'vivaldi'],
};
const isChromium = BROWSER in CHROMIUM;
if (!isChromium && BROWSER !== 'zen' && BROWSER !== 'firefox') die('--browser harus zen, firefox, ' + Object.keys(CHROMIUM).join(', '));

const SKIP = new Set(['Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'ShaderCache', 'GrShaderCache', 'Crashpad', 'component_crx_cache', 'Safe Browsing']);

function getZenDir() {
  if (IS_MAC) return path.join(os.homedir(), 'Library/Application Support/zen');
  if (IS_WIN) return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData/Roaming'), 'zen');
  const p1 = path.join(os.homedir(), '.config/zen');
  return fs.existsSync(p1) ? p1 : path.join(os.homedir(), '.zen');
}

function getAppConfigDir() {
  if (IS_WIN) return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData/Local'), 'coarena-keys');
  return path.join(os.homedir(), '.config/coarena-keys');
}

function getDefaultBrowserDir(browser) {
  if (IS_WIN) {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData/Local');
    const map = {
      chrome: 'Google/Chrome/User Data',
      chromium: 'Chromium/User Data',
      brave: 'BraveSoftware/Brave-Browser/User Data',
      edge: 'Microsoft/Edge/User Data',
      vivaldi: 'Vivaldi/User Data',
    };
    return path.join(local, map[browser] || browser);
  }
  if (IS_MAC) {
    const appSupport = path.join(os.homedir(), 'Library/Application Support');
    const map = {
      chrome: 'Google/Chrome',
      chromium: 'Chromium',
      brave: 'BraveSoftware/Brave-Browser',
      edge: 'Microsoft Edge',
      vivaldi: 'Vivaldi',
    };
    return path.join(appSupport, map[browser] || browser);
  }
  const map = {
    chrome: 'google-chrome',
    chromium: 'chromium',
    brave: 'BraveSoftware/Brave-Browser',
    edge: 'microsoft-edge',
    vivaldi: 'vivaldi',
  };
  return path.join(os.homedir(), '.config', map[browser] || browser);
}

function isProcessRunning(names) {
  const list = (Array.isArray(names) ? names : [names]).map(n => n.toLowerCase());
  if (IS_WIN) {
    try {
      const out = execSync('tasklist /NH /FO CSV', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().toLowerCase();
      return list.some(n => out.includes(n.replace(/\.exe$/i, '') + '.exe') || out.includes(n));
    } catch { return false; }
  }
  for (const n of list) {
    try { execSync(`pgrep -f "${n}"`, { stdio: 'ignore' }); return true; } catch {}
  }
  return false;
}

function zenRunning() {
  return isProcessRunning(['zen-bin', 'zen.exe', 'zen']);
}

function copyDefault(profile) {
  const src = getDefaultBrowserDir(BROWSER);
  if (!fs.existsSync(src)) die('profil default tidak ketemu: ' + src);
  fs.rmSync(profile, { recursive: true, force: true });
  fs.cpSync(src, profile, { recursive: true, filter: s => !SKIP.has(path.basename(s)) && !/^Singleton/.test(path.basename(s)) });
  console.log(`profil default disalin: ${src} -> ${profile}`);
}

function findProfileDir(userDataDir, email) {
  try {
    const lsPath = path.join(userDataDir, 'Local State');
    if (!fs.existsSync(lsPath)) return null;
    const ls = JSON.parse(fs.readFileSync(lsPath, 'utf8'));
    const cache = ls.profile?.info_cache || {};
    for (const [dir, info] of Object.entries(cache)) {
      if (info.user_name && info.user_name.toLowerCase() === email.toLowerCase()) {
        return dir;
      }
    }
  } catch {}
  return null;
}

function findExe() {
  if (arg('browser-path')) return String(arg('browser-path'));
  if (process.env.BROWSER_PATH) return process.env.BROWSER_PATH;

  if (!isChromium) {
    if (process.env.ZEN_PATH) return process.env.ZEN_PATH;
    const candidates = [];
    if (IS_MAC) {
      candidates.push(
        '/Applications/Zen Browser.app/Contents/MacOS/zen-bin',
        '/Applications/Zen.app/Contents/MacOS/zen-bin',
        '/Applications/Zen Browser.app/Contents/MacOS/zen',
        path.join(os.homedir(), 'Applications/Zen Browser.app/Contents/MacOS/zen-bin')
      );
    } else if (IS_WIN) {
      const pf = process.env.ProgramFiles || 'C:\\Program Files';
      const local = process.env.LOCALAPPDATA || '';
      candidates.push(
        path.join(pf, 'Zen Browser', 'zen.exe'),
        path.join(local, 'Zen Browser', 'zen.exe'),
        path.join(pf, 'Zen', 'zen.exe')
      );
    } else {
      candidates.push('/opt/zen-browser-bin/zen-bin', '/usr/bin/zen-browser', '/usr/bin/zen');
    }
    for (const c of candidates) if (c && fs.existsSync(c)) return c;
    for (const d of (process.env.PATH || '').split(path.delimiter)) {
      for (const name of ['zen-bin', 'zen', 'zen-browser', 'zen.exe']) {
        const p = path.join(d, name);
        if (fs.existsSync(p)) return p;
      }
    }
    die('binary Zen tidak ketemu. Pakai --browser-path <exe> atau set ZEN_PATH.');
  }

  const candidates = [];
  if (IS_MAC) {
    const appMap = {
      chrome: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')],
      chromium: ['/Applications/Chromium.app/Contents/MacOS/Chromium'],
      brave: ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', path.join(os.homedir(), 'Applications/Brave Browser.app/Contents/MacOS/Brave Browser')],
      edge: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', path.join(os.homedir(), 'Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge')],
      vivaldi: ['/Applications/Vivaldi.app/Contents/MacOS/Vivaldi'],
    };
    candidates.push(...(appMap[BROWSER] || []));
  } else if (IS_WIN) {
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const pfx86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const local = process.env.LOCALAPPDATA || '';
    const winMap = {
      chrome: [
        path.join(pf, 'Google/Chrome/Application/chrome.exe'),
        path.join(pfx86, 'Google/Chrome/Application/chrome.exe'),
        path.join(local, 'Google/Chrome/Application/chrome.exe'),
      ],
      chromium: [
        path.join(local, 'Chromium/Application/chrome.exe'),
        path.join(pf, 'Chromium/Application/chrome.exe'),
      ],
      brave: [
        path.join(pf, 'BraveSoftware/Brave-Browser/Application/brave.exe'),
        path.join(local, 'BraveSoftware/Brave-Browser/Application/brave.exe'),
      ],
      edge: [
        path.join(pfx86, 'Microsoft/Edge/Application/msedge.exe'),
        path.join(pf, 'Microsoft/Edge/Application/msedge.exe'),
      ],
      vivaldi: [
        path.join(local, 'Vivaldi/Application/vivaldi.exe'),
        path.join(pf, 'Vivaldi/Application/vivaldi.exe'),
      ],
    };
    candidates.push(...(winMap[BROWSER] || []));
  } else {
    const linuxMap = {
      chrome: ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/opt/google/chrome/chrome'],
      chromium: ['/usr/bin/chromium', '/usr/bin/chromium-browser'],
      brave: ['/usr/bin/brave-browser', '/usr/bin/brave'],
      edge: ['/usr/bin/microsoft-edge-stable', '/usr/bin/microsoft-edge'],
      vivaldi: ['/usr/bin/vivaldi-stable', '/usr/bin/vivaldi'],
    };
    candidates.push(...(linuxMap[BROWSER] || []));
  }

  for (const c of candidates) if (c && fs.existsSync(c)) return c;
  for (const n of CHROMIUM[BROWSER]) for (const d of (process.env.PATH || '').split(path.delimiter)) {
    for (const ext of ['', '.exe', '.cmd']) {
      const p = path.join(d, n + ext);
      if (fs.existsSync(p)) return p;
    }
  }
  die(`binary ${BROWSER} tidak ketemu. Pakai --browser-path <exe>.`);
}

function resolveProfile() {
  if (arg('profile')) return path.resolve(String(arg('profile')));
  if (isChromium) return path.join(getAppConfigDir(), BROWSER);
  const zenDir = getZenDir();
  const iniPath = path.join(zenDir, 'installs.ini');
  if (fs.existsSync(iniPath)) {
    const ini = fs.readFileSync(iniPath, 'utf8');
    const def = ini.match(/^Default=(.+)$/m)?.[1];
    if (def) return path.join(zenDir, def);
  }
  const profPath = path.join(zenDir, 'profiles.ini');
  if (fs.existsSync(profPath)) {
    const prof = fs.readFileSync(profPath, 'utf8');
    const def = prof.match(/^Path=(.+)$/m)?.[1];
    if (def) return path.join(zenDir, def);
  }
  die(`profil default Zen tidak ketemu di ${zenDir}. Pakai --profile <dir>.`);
}

// Puppeteer menulis pref ke user.js/prefs.js profil Firefox. Backup sendiri biar profil pasti balik utuh.
function guardProfile(profile) {
  if (isChromium) return () => {};
  const files = ['user.js', 'prefs.js'].map(f => path.join(profile, f));
  const saved = files.map(f => fs.existsSync(f) ? fs.readFileSync(f) : null);
  return () => files.forEach((f, i) => saved[i] ? fs.writeFileSync(f, saved[i]) : fs.rmSync(f, { force: true }));
}

const call = (page, url, opts) => page.evaluate(async (u, o) => {
  const r = await fetch(u, { cache: 'no-store', ...o });
  return { status: r.status, text: await r.text() };
}, url, opts ?? {});

async function emailOnPage(page) {
  if (!page.url().startsWith('https://coarena.ai')) return null;
  try { return JSON.parse((await call(page, '/api/me')).text).user?.email ?? null; } catch { return null; }
}

async function coarenaLogout(page) {
  await page.goto('https://coarena.ai/account/api');
  const { csrfToken } = JSON.parse((await call(page, '/api/auth/csrf')).text);
  await call(page, '/api/auth/signout', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'csrfToken=' + encodeURIComponent(csrfToken) });
}

async function login(page, email) {
  await page.goto('https://coarena.ai/account/api');
  const current = await emailOnPage(page);
  if (current === email) return 'ok';
  if (current) { await coarenaLogout(page); await page.goto('https://coarena.ai/account/api'); }

  await page.locator('button ::-p-text(Google)').click();
  await page.waitForNavigation({ timeout: 15000 }).catch(() => {});
  await sleep(2000);

  if (page.url().includes('accounts.google.com')) {
    const pick = await page.$(`[data-identifier="${email}"]`) ?? await page.$(`::-p-text(${email})`);
    if (!pick) return 'skip: tidak login di browser';
    await pick.click();
    await sleep(4000);
    if (await page.$('input[type=password]')) return 'skip: signed out di browser';
  }

  for (let i = 0; i < 10 && !page.url().startsWith('https://coarena.ai'); i++) {
    const btn = await page.$('button ::-p-text(Continue), button ::-p-text(Lanjutkan), button ::-p-text(Allow), button ::-p-text(Izinkan), [role=button] ::-p-text(Continue), [role=button] ::-p-text(Lanjutkan)');
    if (btn) await btn.click().catch(() => {});
    await sleep(2000);
  }
  if (!page.url().startsWith('https://coarena.ai')) return 'gagal: ' + page.url().slice(0, 70);
  const got = await emailOnPage(page);
  return got === email ? 'ok' : 'skip: masuk sebagai ' + got;
}

async function processAccount(page, email, tag) {
  const info = JSON.parse((await call(page, '/api/me/keys')).text);
  if (!info.modelApi?.terms?.acceptedAt) {
    const t = await call(page, '/api/me/model-api/terms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: info.modelApi.terms.version }) });
    console.log(`${tag}  accept terms: ${t.status}`);
  }
  const active = (info.keys || []).filter(k => k.status === 'active');
  if (has('check')) { console.log(`${tag}  login ok, key aktif ${active.length}/${info.maxActive}`); return 'login ok'; }
  if (active.length && !has('force')) { console.log(`${tag}  skip (punya ${active.length} key aktif)`); return 'skip'; }
  if (active.length >= info.maxActive) { console.log(`${tag}  penuh (${info.maxActive} key)`); return 'penuh'; }

  const r = await call(page, '/api/me/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'auto-' + new Date().toISOString().slice(0, 10) }) });
  const body = JSON.parse(r.text);
  if (r.status !== 201 || !body.token) { console.log(`${tag}  gagal create (${r.status})`); return 'gagal create ' + r.status; }

  const v = await call(page, '/api/v1/models', { headers: { authorization: 'Bearer ' + body.token } });
  const ok = v.status === 200;
  console.log(`${tag}  key ${body.key.prefix}... verify=${v.status}${has('print') ? '\n    ' + body.token : ''}`);
  fs.appendFileSync(OUT, [email, body.key.id, body.token, new Date(body.key.expiresAt).toISOString(), ok ? 'ok' : 'invalid'].join(',') + '\n');
  return ok ? 'ok' : 'key invalid';
}

function launch(exe, profile, profileDir = null) {
  if (!isChromium) return puppeteer.launch({ browser: 'firefox', executablePath: exe, userDataDir: profile, headless: false, defaultViewport: null });
  const args = ['--disable-blink-features=AutomationControlled'];
  if (profileDir) args.push('--profile-directory=' + profileDir);
  return puppeteer.launch({
    browser: 'chrome', executablePath: exe, userDataDir: profile, headless: false, defaultViewport: null,
    ignoreDefaultArgs: ['--enable-automation'], args,
  });
}

async function main() {
  const exe = findExe();
  const profile = resolveProfile();

  // Buka browser biasa (tanpa otomasi) di profil khusus supaya login Google tidak diblokir.
  if (has('setup')) {
    if (!isChromium) die('--setup hanya untuk Chromium family. Zen/Firefox pakai profil asli.');
    fs.mkdirSync(profile, { recursive: true });
    spawn(exe, ['--user-data-dir=' + profile, 'https://accounts.google.com'], { detached: true, stdio: 'ignore' }).unref();
    console.log(`profil: ${profile}\nLogin semua akun Google di jendela itu, lalu TUTUP browsernya.`);
    return;
  }

  const emails = has('only')
    ? [String(arg('only'))]
    : fs.existsSync('accounts.txt')
      ? fs.readFileSync('accounts.txt', 'utf8').split('\n').map(s => s.trim()).filter(Boolean)
      : die('buat accounts.txt (satu email per baris) atau pakai --only <email>');

  if (!isChromium && zenRunning()) die('Zen masih jalan. Tutup dulu Zen-nya, lalu jalankan lagi.');
  if (isChromium && has('copy-default')) {
    const procNames = [path.basename(exe), 'chrome', 'msedge', 'brave', 'vivaldi'];
    if (isProcessRunning(procNames)) die('Browser masih jalan. Tutup dulu, lalu jalankan lagi.');
    copyDefault(profile);
  }
  if (isChromium && !fs.existsSync(profile)) die(`profil ${profile} belum ada. Jalankan dulu: node getkeys.mjs --browser ${BROWSER} --setup`);
  console.log(`browser=${BROWSER}\nprofile=${profile}\nout=${OUT}\n`);

  const restore = guardProfile(profile);
  process.on('SIGINT', () => { restore(); process.exit(130); });

  const rows = [];
  if (!isChromium) {
    const browser = await launch(exe, profile);
    try {
      const page = (await browser.pages())[0] ?? await browser.newPage();
      await page.goto('https://coarena.ai/account/api');
      const original = await emailOnPage(page);
      if (original) console.log(`akun coarena aktif sekarang: ${original} (dikembalikan di akhir)\n`);

      for (let i = 0; i < emails.length; i++) {
        const email = emails[i];
        const tag = `[${i + 1}/${emails.length}] ${email}`;
        try {
          const res = await login(page, email);
          if (res !== 'ok') { console.log(`${tag}  ${res}`); rows.push([email, res]); continue; }
          rows.push([email, await processAccount(page, email, tag)]);
        } catch (e) {
          console.log(`${tag}  error: ${String(e.message).slice(0, 100)}`);
          rows.push([email, 'error']);
        }
      }

      if (original) console.log(`\nbalik ke ${original}: ${await login(page, original).catch(e => 'error ' + e.message)}`);
      else await coarenaLogout(page).catch(() => {});
    } finally {
      await browser.close().catch(() => {});
      restore();
    }
  } else {
    let currentBrowser = null;
    let currentProfDir = null;
    let page = null;
    try {
      for (let i = 0; i < emails.length; i++) {
        const email = emails[i];
        const tag = `[${i + 1}/${emails.length}] ${email}`;
        const profDir = arg('profile-dir') || findProfileDir(profile, email) || 'Default';

        if (!currentBrowser || currentProfDir !== profDir) {
          if (currentBrowser) await currentBrowser.close().catch(() => {});
          currentProfDir = profDir;
          console.log(`[${profDir}] membuka browser...`);
          currentBrowser = await launch(exe, profile, profDir);
          page = (await currentBrowser.pages())[0] ?? await currentBrowser.newPage();
        }

        try {
          const res = await login(page, email);
          if (res !== 'ok') { console.log(`${tag}  ${res}`); rows.push([email, res]); continue; }
          rows.push([email, await processAccount(page, email, tag)]);
        } catch (e) {
          console.log(`${tag}  error: ${String(e.message).slice(0, 100)}`);
          rows.push([email, 'error']);
        }
      }
    } finally {
      if (currentBrowser) await currentBrowser.close().catch(() => {});
      restore();
    }
  }

  console.log('\nringkasan:');
  for (const [email, status] of rows) console.log('  ' + email + ' -> ' + status);
}

main().catch(e => { console.error(e); process.exit(1); });
