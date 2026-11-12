#!/usr/bin/env node
// Ambil API key coarena.ai pakai Zen asli + profil asli yang sudah login Google.
// Akun yang tidak login di Zen di-skip. Tidak ada cookie yang disalin atau disimpan.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const arg = (n, d = null) => { const i = process.argv.indexOf('--' + n); return i > 0 ? (process.argv[i + 1] ?? true) : d; };
const has = n => process.argv.includes('--' + n);
const OUT = String(arg('out', 'keys.csv'));
const EXE = String(arg('browser-path', process.env.ZEN_PATH || '/opt/zen-browser-bin/zen-bin'));
const ZEN = path.join(os.homedir(), '.config/zen');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const die = m => { console.error('ERROR: ' + m); process.exit(1); };

function resolveProfile() {
  if (arg('profile')) return path.resolve(String(arg('profile')));
  const ini = fs.readFileSync(path.join(ZEN, 'installs.ini'), 'utf8');
  const def = ini.match(/^Default=(.+)$/m)?.[1];
  if (!def) die('profil default Zen tidak ketemu. Pakai --profile <dir>.');
  return path.join(ZEN, def);
}

function zenRunning() {
  try { execSync('pgrep -x zen-bin', { stdio: 'ignore' }); return true; } catch { return false; }
}

// Puppeteer menulis pref ke user.js/prefs.js profil. Backup sendiri biar profil pasti balik utuh.
function guardProfile(profile) {
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
    if (!pick) return 'skip: tidak login di Zen';
    await pick.click();
    await sleep(4000);
    if (await page.$('input[type=password]')) return 'skip: signed out di Zen';
  }

  for (let i = 0; i < 10 && !page.url().startsWith('https://coarena.ai'); i++) {
    const btn = await page.$('button ::-p-text(Continue), button ::-p-text(Lanjutkan), button ::-p-text(Allow), button ::-p-text(Izinkan)');
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

async function main() {
  const emails = has('only')
    ? [String(arg('only'))]
    : fs.existsSync('accounts.txt')
      ? fs.readFileSync('accounts.txt', 'utf8').split('\n').map(s => s.trim()).filter(Boolean)
      : die('buat accounts.txt (satu email per baris) atau pakai --only <email>');

  if (zenRunning()) die('Zen masih jalan. Tutup dulu Zen-nya, lalu jalankan lagi.');
  const profile = resolveProfile();
  console.log(`profile=${profile}\nout=${OUT}\n`);

  const restore = guardProfile(profile);
  process.on('SIGINT', () => { restore(); process.exit(130); });
  const browser = await puppeteer.launch({ browser: 'firefox', executablePath: EXE, userDataDir: profile, headless: false, defaultViewport: null });
  const rows = [];
  try {
    const page = (await browser.pages())[0] ?? await browser.newPage();
    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      const tag = `[${i + 1}/${emails.length}] ${email}`;
      try {
        const res = await login(page, email);
        if (res !== 'ok') { console.log(`${tag}  ${res}`); rows.push([email, res]); continue; }
        rows.push([email, await processAccount(page, email, tag)]);
        await coarenaLogout(page);
      } catch (e) {
        console.log(`${tag}  error: ${String(e.message).slice(0, 100)}`);
        rows.push([email, 'error']);
      }
    }
  } finally {
    await browser.close().catch(() => {});
    restore();
  }

  console.log('\nringkasan:');
  for (const [email, status] of rows) console.log('  ' + email + ' -> ' + status);
}

main().catch(e => { console.error(e); process.exit(1); });
