#!/usr/bin/env node
// Ambil API key coarena.ai lewat sesi Google yang sudah login di browser.
// Firefox family: impor cookie. Chromium family: pakai salinan profil apa adanya.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { firefox, chromium } from 'playwright';

const arg = (n, d = null) => { const i = process.argv.indexOf('--' + n); return i > 0 ? (process.argv[i + 1] ?? true) : d; };
const has = n => process.argv.includes('--' + n);
const HOME = os.homedir();
const OUT = String(arg('out', 'keys.csv'));
const BROWSER = String(arg('browser', 'auto'));
const PROFILE = arg('profile');
const EXE = arg('browser-path') || process.env.CHROME_PATH;
const HEADLESS = has('headless');

const die = m => { console.error('ERROR: ' + m); process.exit(1); };

function detectKind(dir) {
  if (!dir || !fs.existsSync(dir)) return null;
  if (fs.existsSync(path.join(dir, 'cookies.sqlite'))) return 'firefox';
  const d = path.join(dir, 'Default');
  if (fs.existsSync(path.join(dir, 'Local State')) || fs.existsSync(path.join(d, 'Cookies')) || fs.existsSync(path.join(d, 'Network', 'Cookies'))) return 'chromium';
  return null;
}

function candidateProfiles() {
  const out = [];
  const addChildren = base => { try { for (const d of fs.readdirSync(base)) out.push(path.join(base, d)); } catch {} };
  addChildren(path.join(HOME, '.config/zen'));
  addChildren(path.join(HOME, '.mozilla/firefox'));
  for (const b of ['google-chrome', 'chromium', 'BraveSoftware/Brave-Browser', 'microsoft-edge', 'vivaldi', 'google-chrome-debug']) out.push(path.join(HOME, '.config', b));
  return out;
}

function resolveProfile() {
  if (PROFILE) return path.resolve(String(PROFILE));
  const want = BROWSER === 'auto' ? null : BROWSER;
  for (const p of candidateProfiles()) {
    if (p.includes('/Default')) continue;
    const k = detectKind(p);
    if (k && (!want || k === want)) return p;
  }
  die('profil browser tidak ketemu. Pakai --profile <dir> (folder profil Firefox, atau user-data-dir Chromium).');
}

function chromeExe() {
  if (EXE) return String(EXE);
  const names = ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser', 'brave-browser', 'microsoft-edge', 'vivaldi-stable'];
  for (const n of names) for (const d of (process.env.PATH || '').split(':')) {
    const p = path.join(d, n);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function firefoxCookies(profile) {
  const snap = path.join(os.tmpdir(), 'getkeys-cookies.sqlite');
  fs.copyFileSync(path.join(profile, 'cookies.sqlite'), snap);
  const wal = path.join(profile, 'cookies.sqlite-wal');
  if (fs.existsSync(wal)) fs.copyFileSync(wal, snap + '-wal');
  const db = new DatabaseSync(snap);
  const rows = db.prepare("select name,value,host,path,expiry,isSecure,isHttpOnly,sameSite from moz_cookies where host like '%google%'").all();
  db.close();
  const ss = { 0: 'None', 1: 'Lax', 2: 'Strict', 256: 'None' };
  return rows.map(r => {
    const secure = r.isSecure === 1;
    let sameSite = ss[r.sameSite] ?? 'None';
    if (!secure && sameSite === 'None') sameSite = 'Lax';
    return { name: r.name, value: r.value, domain: r.host, path: r.path, expires: Number(r.expiry) > 0 ? Math.floor(Number(r.expiry) / 1000) : -1, secure, httpOnly: r.isHttpOnly === 1, sameSite };
  });
}

function browserOpts() {
  const opts = { headless: HEADLESS, args: ['--disable-blink-features=AutomationControlled'] };
  const exe = chromeExe();
  if (exe) opts.executablePath = exe; else opts.channel = 'chrome';
  return opts;
}

const SKIP_DIRS = new Set(['Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'ShaderCache', 'GrShaderCache', 'Crashpad', 'component_crx_cache', 'Safe Browsing']);
function copyProfile(src) {
  const dst = fs.mkdtempSync(path.join(os.tmpdir(), 'getkeys-prof-'));
  fs.cpSync(src, dst, { recursive: true, filter: s => !(fs.statSync(s).isDirectory() && SKIP_DIRS.has(path.basename(s))) });
  for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'LOCK', '.parentlock']) fs.rmSync(path.join(dst, f), { force: true });
  return dst;
}

async function openSession() {
  const profile = resolveProfile();
  const kind = BROWSER === 'auto' ? detectKind(profile) : BROWSER;
  if (kind === 'firefox') {
    const browser = await firefox.launch({ headless: HEADLESS });
    const ctx = await browser.newContext({ viewport: HEADLESS ? { width: 1280, height: 900 } : null });
    await ctx.addCookies(firefoxCookies(profile));
    return { ctx, close: () => browser.close(), kind, profile };
  }
  if (kind === 'chromium') {
    const dir = copyProfile(profile);
    const ctx = await chromium.launchPersistentContext(dir, { ...browserOpts(), viewport: HEADLESS ? { width: 1280, height: 900 } : null });
    return { ctx, close: () => ctx.close(), kind, profile };
  }
  die('tipe profil tidak dikenali: ' + profile);
}

function totp(secret) {
  if (!secret) return null;
  const key = Buffer.from(secret.replace(/\s/g, '').toUpperCase(), 'base32');
  const ctr = Buffer.alloc(8);
  ctr.writeUInt32BE(Math.floor(Date.now() / 30000) >>> 0, 4);
  const h = crypto.createHmac('sha1', key).update(ctr).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

function credentials() {
  const f = process.env.ACCOUNTS || 'accounts.csv';
  const map = new Map();
  if (!fs.existsSync(f)) return map;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const [email, password, secret] = line.split(',').map(x => x?.trim());
    if (email?.includes('@')) map.set(email, { password, secret });
  }
  return map;
}

async function login(page, email, cred) {
  await page.goto('https://coarena.ai/account/api');
  const current = await emailOnPage(page);
  if (current === email) return 'ok';
  if (current) {
    for (const c of await page.context().cookies('https://coarena.ai')) {
      await page.context().clearCookies({ name: c.name, domain: c.domain, path: c.path });
    }
    await page.goto('https://coarena.ai/account/api');
  }
  await page.getByRole('button', { name: /Google/ }).first().click();
  await page.waitForTimeout(5000);

  if (page.url().includes('accountchooser')) {
    const pick = page.getByText(email, { exact: true }).first();
    if (await pick.count()) await pick.click();
    else {
      await page.getByText(/Use another account|Gunakan akun lain/).first().click();
      await page.waitForTimeout(1500);
      await page.locator('input[type=email]').fill(email);
      await page.getByRole('button', { name: /Next|Berikutnya/ }).first().click();
    }
    await page.waitForTimeout(5000);
  }

  const pw = page.locator('input[type=password]');
  if (await pw.count()) {
    if (!cred?.password) return 'butuh password';
    await pw.fill(cred.password);
    await page.getByRole('button', { name: /Next|Berikutnya/ }).first().click();
    await page.waitForTimeout(6000);
  }

  const otp = page.locator("input[autocomplete='one-time-code'], input[name='totpPin'], input[type=tel]").first();
  if (await otp.count().catch(() => 0)) {
    const code = totp(cred?.secret);
    if (!code) return 'butuh OTP';
    await otp.fill(code);
    await page.getByRole('button', { name: /Next|Berikutnya|Verify|Verifikasi/ }).first().click();
    await page.waitForTimeout(6000);
  }

  for (let i = 0; i < 8 && !page.url().startsWith('https://coarena.ai'); i++) {
    const c = page.getByRole('button', { name: /^(Continue|Lanjutkan|Allow|Izinkan)$/ });
    if (await c.count()) await c.first().click().catch(() => {});
    await page.waitForTimeout(3000);
  }
  for (let i = 0; i < 10 && !page.url().startsWith('https://coarena.ai'); i++) await page.waitForTimeout(2000);
  return page.url().startsWith('https://coarena.ai') ? 'ok' : 'gagal: ' + page.url().slice(0, 70);
}

const call = (page, url, opts) => page.evaluate(async ([u, o]) => {
  const r = await fetch(u, { cache: 'no-store', ...o });
  return { status: r.status, text: await r.text() };
}, [url, opts]);

const statesDir = 'states';
const statePathOf = email => path.join(statesDir, email + '.json');

async function openFromState(kind, statePath) {
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const viewport = HEADLESS ? { width: 1280, height: 900 } : null;
  if (kind === 'firefox') {
    const b = await firefox.launch({ headless: HEADLESS });
    return { ctx: await b.newContext({ viewport, storageState: state }), close: () => b.close() };
  }
  const b = await chromium.launch(browserOpts());
  return { ctx: await b.newContext({ viewport, storageState: state }), close: () => b.close() };
}

async function saveState(session, statePath) {
  const state = await session.ctx.storageState();
  state.cookies = state.cookies.filter(c => c.domain.includes('coarena.ai'));
  fs.mkdirSync(statesDir, { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state));
}

async function emailOnPage(page) {
  if (!page.url().startsWith('https://coarena.ai')) return null;
  try { return JSON.parse((await call(page, '/api/me')).text).user?.email ?? null; } catch { return null; }
}

async function openAccount(email, kind, cred) {
  const statePath = statePathOf(email);
  if (fs.existsSync(statePath)) {
    const s = await openFromState(kind, statePath);
    const page = s.ctx.pages()[0] ?? await s.ctx.newPage();
    await page.goto('https://coarena.ai/account/api');
    if ((await emailOnPage(page)) === email) return { ...s, page, viaState: true };
    await s.close();
    fs.rmSync(statePath, { force: true });
  }
  const s = await openSession();
  const page = s.ctx.pages?.()[0] ?? await s.ctx.newPage();
  const res = await login(page, email, cred);
  if (res !== 'ok') { await s.close(); return { error: res }; }
  if ((await emailOnPage(page)) !== email) { const got = await emailOnPage(page); await s.close(); return { error: 'salah akun: ' + got }; }
  await saveState(s, statePath);
  return { ...s, page, viaState: false };
}

async function main() {
  if (has('dry-run')) {
    const { ctx, close, kind, profile } = await openSession();
    console.log(`browser=${kind}\nprofile=${profile}\n`);
    const page = ctx.pages?.()[0] ?? await ctx.newPage();
    await page.goto('https://coarena.ai/account/api');
    await page.getByRole('button', { name: /Google/ }).first().click();
    await page.waitForTimeout(6000);
    const found = await page.locator('text=/[\\w.+-]+@[\\w-]+\\.[\\w.]+/').allInnerTexts();
    const emails = [...new Set(found.map(s => s.trim()).filter(s => s.includes('@')))];
    console.log('akun terdeteksi:');
    for (const e of emails) console.log('  ' + e);
    if (!emails.length) console.log('  (kosong - sesi Google di profil ini tidak ada)');
    fs.writeFileSync('accounts.txt', emails.join('\n') + '\n');
    await close();
    return;
  }

  const profile = resolveProfile();
  const kind = BROWSER === 'auto' ? detectKind(profile) : BROWSER;
  console.log(`browser=${kind}\nprofile=${profile}\nout=${OUT}\n`);

  const emails = has('only')
    ? [String(arg('only'))]
    : fs.existsSync('accounts.txt')
      ? fs.readFileSync('accounts.txt', 'utf8').split('\n').map(s => s.trim()).filter(Boolean)
      : die('buat accounts.txt (lihat --dry-run) atau pakai --only <email>');

  const creds = credentials();
  const rows = [];
  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    const tag = `[${i + 1}/${emails.length}] ${email}`;
    let session;
    try {
      session = await openAccount(email, kind, creds.get(email));
      if (session.error) { console.log(`${tag}  ${session.error}`); rows.push([email, session.error]); continue; }
      const { page } = session;

      const info = JSON.parse((await call(page, '/api/me/keys')).text);
      if (!info.modelApi?.terms?.acceptedAt) {
        const t = await call(page, '/api/me/model-api/terms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: info.modelApi.terms.version }) });
        console.log(`${tag}  accept terms: ${t.status}`);
      }

      const active = (info.keys || []).filter(k => k.status === 'active');
      if (has('check')) { console.log(`${tag}  login ok (${session.viaState ? 'sesi tersimpan' : 'login google'}), key aktif ${active.length}/${info.maxActive}`); rows.push([email, 'login ok']); continue; }
      if (active.length && !has('force')) { console.log(`${tag}  skip (punya ${active.length} key aktif)`); rows.push([email, 'skip']); continue; }
      if (active.length >= info.maxActive) { console.log(`${tag}  penuh (${info.maxActive} key)`); rows.push([email, 'penuh']); continue; }

      const r = await call(page, '/api/me/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'auto-' + new Date().toISOString().slice(0, 10) }) });
      const body = JSON.parse(r.text);
      if (r.status !== 201 || !body.token) { console.log(`${tag}  gagal create (${r.status})`); rows.push([email, 'gagal create ' + r.status]); continue; }

      const v = await call(page, '/api/v1/models', { headers: { authorization: 'Bearer ' + body.token } });
      const ok = v.status === 200;
      console.log(`${tag}  key ${body.key.prefix}... verify=${v.status}${has('print') ? '\n    ' + body.token : ''}`);
      fs.appendFileSync(OUT, [email, body.key.id, body.token, new Date(body.key.expiresAt).toISOString(), ok ? 'ok' : 'invalid'].join(',') + '\n');
      rows.push([email, ok ? 'ok' : 'key invalid']);
      await page.waitForTimeout(8000);
    } catch (e) {
      console.log(`${tag}  error: ${String(e.message).slice(0, 100)}`);
      rows.push([email, 'error']);
    } finally {
      if (session && !session.error) await session.close().catch(() => {});
    }
  }

  console.log('\nringkasan:');
  for (const [email, status] of rows) console.log('  ' + email + ' -> ' + status);
}

main().catch(e => { console.error(e); process.exit(1); });