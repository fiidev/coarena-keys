#!/usr/bin/env node
/**
 * CLI Pulihkan Sesi & Tab Browser (Cross-Platform).
 * Penggunaan:
 *   node restore-session.mjs --browser zen
 *   node restore-session.mjs --browser chrome
 *   node restore-session.mjs --browser brave
 */

import { restoreBrowserSession, listBackups } from './browser-backup.mjs';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const args = process.argv.slice(2);
function arg(key, def = null) {
  const i = args.indexOf('--' + key);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

const BROWSER = String(arg('browser', 'zen')).toLowerCase();
const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

function getZenDir() {
  if (IS_MAC) return path.join(os.homedir(), 'Library/Application Support/zen');
  if (IS_WIN) return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData/Roaming'), 'zen');
  const p1 = path.join(os.homedir(), '.config/zen');
  return fs.existsSync(p1) ? p1 : path.join(os.homedir(), '.zen');
}

function resolveZenProfile() {
  const zenDir = getZenDir();
  const iniPath = path.join(zenDir, 'installs.ini');
  if (fs.existsSync(iniPath)) {
    const text = fs.readFileSync(iniPath, 'utf8');
    const m = text.match(/Default=([^\r\n]+)/);
    if (m && m[1]) return path.join(zenDir, m[1].trim());
  }
  const profPath = path.join(zenDir, 'profiles.ini');
  if (fs.existsSync(profPath)) {
    const text = fs.readFileSync(profPath, 'utf8');
    const m = text.match(/Path=([^\r\n]+)/);
    if (m && m[1]) return path.join(zenDir, m[1].trim());
  }
  return null;
}

function resolveChromeProfile(profileName = 'Default') {
  let baseDir = '';
  if (IS_WIN) baseDir = path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/User Data');
  else if (IS_MAC) baseDir = path.join(os.homedir(), 'Library/Application Support/Google/Chrome');
  else baseDir = path.join(os.homedir(), '.config/google-chrome');
  return path.join(baseDir, profileName);
}

function resolveProfileDir(browser) {
  if (browser === 'zen') return resolveZenProfile();
  if (browser === 'chrome') return resolveChromeProfile(arg('profile-directory', 'Default'));
  return null;
}

const profileDir = arg('profile', resolveProfileDir(BROWSER));

console.log(`[restore] Browser: ${BROWSER}`);
console.log(`[restore] Profil : ${profileDir || 'otomatis'}`);

if (!profileDir || !fs.existsSync(profileDir)) {
  console.error(`[error] Direktori profil ${BROWSER} tidak ditemukan.`);
  process.exit(1);
}

const backups = listBackups(BROWSER);
if (backups.length === 0) {
  console.error(`[error] Belum ada backup sesi untuk browser ${BROWSER}.`);
  process.exit(1);
}

console.log(`[restore] Ditemukan ${backups.length} cadangan sesi.`);
console.log(`[restore] Mengembalikan dari backup terbaru: ${backups[0].timestamp}...`);

const res = restoreBrowserSession(BROWSER, profileDir, backups[0].timestamp);
if (!res.ok) {
  console.error(`[error] Gagal restore: ${res.error}`);
  process.exit(1);
}

console.log(`[sukses] Berhasil memulihkan sesi & tabs ${BROWSER}!`);
console.log(`[sukses] File dipulihkan: ${res.restoredItems.join(', ')}`);
console.log(`\nSilakan buka browser ${BROWSER} kamu kembali. Semua tab & workspace akan langsung terbuka.`);
