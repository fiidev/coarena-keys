#!/usr/bin/env node
/**
 * Modul Backup & Restore Otomatis Sesi & Tab Browser (Cross-Platform).
 * Mendukung: Zen Browser, Firefox, Google Chrome, Brave, Microsoft Edge, Chromium.
 * 
 * Lokasi penyimpanan backup default:
 *   Linux/Mac: ~/.browser-backups/<browser>/<timestamp>/
 *   Windows  : %USERPROFILE%\.browser-backups\<browser>\<timestamp>\
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BACKUP_ROOT = path.join(os.homedir(), '.browser-backups');
const MAX_BACKUPS = 15;

export function getBackupRootDir() {
  return BACKUP_ROOT;
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return false;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
  return true;
}

/**
 * Backup sesi & tab browser sebelum script otomasi berjalan.
 * @param {string} browser - 'zen', 'firefox', 'chrome', 'brave', 'edge', 'chromium'
 * @param {string} profileDir - Path direktori profil browser
 * @returns {object} { ok: boolean, backupDir: string, filesCount: number, error?: string }
 */
export function backupBrowserSession(browser, profileDir) {
  try {
    if (!profileDir || !fs.existsSync(profileDir)) {
      return { ok: false, error: `Direktori profil tidak ditemukan: ${profileDir}` };
    }

    const browserKey = String(browser || 'unknown').toLowerCase();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const targetDir = path.join(BACKUP_ROOT, browserKey, timestamp);
    fs.mkdirSync(targetDir, { recursive: true });

    let backedUp = [];

    const isGecko = browserKey === 'zen' || browserKey === 'firefox';

    if (isGecko) {
      // Firefox & Zen session files
      const items = [
        'sessionstore.jsonlz4',
        'sessionCheckpoints.json',
        'zen-sessions.jsonlz4',
        'sessionstore-backups',
        'zen-sessions-backup',
      ];
      for (const item of items) {
        const src = path.join(profileDir, item);
        const dest = path.join(targetDir, item);
        if (copyRecursive(src, dest)) {
          backedUp.push(item);
        }
      }
    } else {
      // Chromium family (Chrome, Brave, Edge, Chromium)
      const items = [
        'Sessions',
        'Current Session',
        'Current Tabs',
        'Last Session',
        'Last Tabs',
        'Preferences',
      ];
      for (const item of items) {
        const src = path.join(profileDir, item);
        const dest = path.join(targetDir, item);
        if (copyRecursive(src, dest)) {
          backedUp.push(item);
        }
      }
    }

    // Catat metadata backup
    const meta = {
      browser: browserKey,
      timestamp,
      createdAt: new Date().toISOString(),
      profileDir,
      backedUpItems: backedUp,
    };
    fs.writeFileSync(path.join(targetDir, 'backup-meta.json'), JSON.stringify(meta, null, 2), 'utf-8');

    // Rotasi backup lama (simpan maksimal MAX_BACKUPS)
    pruneOldBackups(browserKey);

    return {
      ok: true,
      backupDir: targetDir,
      timestamp,
      filesCount: backedUp.length,
      items: backedUp,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Kembalikan sesi & tab dari backup terakhir (atau backup tertentu).
 * @param {string} browser - 'zen', 'firefox', 'chrome', etc.
 * @param {string} profileDir - Path direktori profil browser
 * @param {string} [specificTimestamp] - Timestamp backup spesifik, jika kosong ambil yang terbaru
 * @returns {object} { ok: boolean, restoredFrom: string, error?: string }
 */
export function restoreBrowserSession(browser, profileDir, specificTimestamp = null) {
  try {
    const browserKey = String(browser || 'unknown').toLowerCase();
    const browserBackupDir = path.join(BACKUP_ROOT, browserKey);

    if (!fs.existsSync(browserBackupDir)) {
      return { ok: false, error: `Belum ada folder backup untuk browser ${browserKey}` };
    }

    const available = fs.readdirSync(browserBackupDir)
      .filter((d) => fs.statSync(path.join(browserBackupDir, d)).isDirectory())
      .sort()
      .reverse();

    if (available.length === 0) {
      return { ok: false, error: `Tidak ada data backup yang tersedia untuk ${browserKey}` };
    }

    const selectedBackup = specificTimestamp && available.includes(specificTimestamp)
      ? specificTimestamp
      : available[0];

    const sourceDir = path.join(browserBackupDir, selectedBackup);
    const isGecko = browserKey === 'zen' || browserKey === 'firefox';

    let restored = [];

    if (isGecko) {
      // 1. Pulihkan file sessionstore
      const recoveryFile = path.join(sourceDir, 'sessionstore-backups', 'recovery.jsonlz4');
      const cleanZenFile = path.join(sourceDir, 'zen-sessions-backup', 'clean.jsonlz4');
      const zenSessionFile = path.join(sourceDir, 'zen-sessions.jsonlz4');

      // Salin folder sessionstore-backups
      copyRecursive(path.join(sourceDir, 'sessionstore-backups'), path.join(profileDir, 'sessionstore-backups'));
      copyRecursive(path.join(sourceDir, 'zen-sessions-backup'), path.join(profileDir, 'zen-sessions-backup'));

      // Salin recovery.jsonlz4 langsung ke sessionstore.jsonlz4 di root profil agar Zen/Firefox langsung load
      if (fs.existsSync(recoveryFile)) {
        fs.copyFileSync(recoveryFile, path.join(profileDir, 'sessionstore.jsonlz4'));
        restored.push('sessionstore.jsonlz4');
      }

      if (fs.existsSync(zenSessionFile)) {
        fs.copyFileSync(zenSessionFile, path.join(profileDir, 'zen-sessions.jsonlz4'));
        restored.push('zen-sessions.jsonlz4');
      } else if (fs.existsSync(cleanZenFile)) {
        fs.copyFileSync(cleanZenFile, path.join(profileDir, 'zen-sessions.jsonlz4'));
        restored.push('zen-sessions.jsonlz4');
      }

      // Paksa trigger restore pada startup berikutnya
      const checkpointPath = path.join(profileDir, 'sessionCheckpoints.json');
      fs.writeFileSync(
        checkpointPath,
        JSON.stringify({
          'profile-after-change': true,
          'final-ui-startup': true,
          'sessionstore-windows-restored': false,
        }),
        'utf-8'
      );
      restored.push('sessionCheckpoints.json');

      // Set user_pref startup page = 3 (restore previous tabs) di prefs.js jika ada
      const prefsPath = path.join(profileDir, 'prefs.js');
      if (fs.existsSync(prefsPath)) {
        let prefsContent = fs.readFileSync(prefsPath, 'utf-8');
        if (!prefsContent.includes('browser.startup.page')) {
          prefsContent += '\nuser_pref("browser.startup.page", 3);\n';
          fs.writeFileSync(prefsPath, prefsContent, 'utf-8');
          restored.push('prefs.js (browser.startup.page=3)');
        }
      }
    } else {
      // Chromium: pulihkan folder Sessions
      const sessionsDir = path.join(sourceDir, 'Sessions');
      if (fs.existsSync(sessionsDir)) {
        copyRecursive(sessionsDir, path.join(profileDir, 'Sessions'));
        restored.push('Sessions');
      }
      for (const item of ['Current Session', 'Current Tabs', 'Last Session', 'Last Tabs']) {
        const src = path.join(sourceDir, item);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(profileDir, item));
          restored.push(item);
        }
      }
    }

    return {
      ok: true,
      restoredFrom: sourceDir,
      selectedBackup,
      restoredItems: restored,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function pruneOldBackups(browserKey) {
  try {
    const dir = path.join(BACKUP_ROOT, browserKey);
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir)
      .filter((d) => fs.statSync(path.join(dir, d)).isDirectory())
      .sort();
    while (entries.length > MAX_BACKUPS) {
      const oldest = entries.shift();
      fs.rmSync(path.join(dir, oldest), { recursive: true, force: true });
    }
  } catch {}
}

export function listBackups(browserKey) {
  const dir = path.join(BACKUP_ROOT, String(browserKey).toLowerCase());
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((d) => fs.statSync(path.join(dir, d)).isDirectory())
    .sort()
    .reverse()
    .map((timestamp) => {
      const metaPath = path.join(dir, timestamp, 'backup-meta.json');
      let meta = null;
      if (fs.existsSync(metaPath)) {
        try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch {}
      }
      return { timestamp, path: path.join(dir, timestamp), meta };
    });
}
