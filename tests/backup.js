/**
 * backup.js - Creates a timestamped ZIP backup of project source files
 * Usage: node tests/backup.js
 *        node tests/backup.js my-label
 * Or import: const { backup } = require('./tests/backup.js'); backup('before-password-fix');
 */

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = path.join(PROJECT_ROOT, '\u05D2\u05E8\u05E1\u05D0\u05D5\u05EA \u05E7\u05D5\u05D3\u05DE\u05D5\u05EA'); // גרסאות קודמות

function pad(n) {
  return String(n).padStart(2, '0');
}

function getTimestamp() {
  const now = new Date();
  const Y = now.getFullYear();
  const M = pad(now.getMonth() + 1);
  const D = pad(now.getDate());
  const h = pad(now.getHours());
  const m = pad(now.getMinutes());
  const s = pad(now.getSeconds());
  return `${Y}-${M}-${D}_${h}-${m}-${s}`;
}

function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const kb = (stats.size / 1024).toFixed(1);
    return `${kb} KB`;
  } catch (e) {
    return 'unknown';
  }
}

/**
 * Recursively copy a directory into dest.
 * Pure Node.js — no external tools needed.
 */
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Recursively delete a directory.
 */
function rimrafSync(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      rimrafSync(full);
    } else {
      fs.unlinkSync(full);
    }
  }
  fs.rmdirSync(dir);
}

/**
 * Create a ZIP using PowerShell, but write to a temp path with no Hebrew chars
 * then move the result to the final (Hebrew) destination.
 */
function createZip(sourceDir, finalZipPath) {
  // Use a temp zip path in %TEMP% to avoid Hebrew path issues in PowerShell
  const tempZipName = `budget_backup_${Date.now()}.zip`;
  const tempZipPath = path.join(require('os').tmpdir(), tempZipName);

  const sourceDirWin = sourceDir.replace(/\//g, '\\');
  const tempZipWin = tempZipPath.replace(/\//g, '\\');

  const psCmd = `Compress-Archive -Path "${sourceDirWin}\\*" -DestinationPath "${tempZipWin}" -Force`;
  execSync(`powershell -Command "${psCmd}"`, { stdio: 'pipe' });

  // Move temp zip to final Hebrew path using Node.js (no shell involved)
  fs.copyFileSync(tempZipPath, finalZipPath);
  fs.unlinkSync(tempZipPath);
}

function backup(label) {
  // Ensure backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`Created backup directory: ${BACKUP_DIR}`);
  }

  const timestamp = getTimestamp();
  const suffix = label ? `_${label.replace(/[^a-zA-Z0-9\u05D0-\u05EA_-]/g, '-')}` : '';
  const zipName = `backup_${timestamp}${suffix}.zip`;
  const zipPath = path.join(BACKUP_DIR, zipName);

  // Folders to back up (relative to project root)
  const sourceFolders = ['src', 'public'];
  const extensionSrc = path.join(PROJECT_ROOT, 'extension', 'src');

  // Build list of paths that exist
  const pathsToBackup = [];
  for (const folder of sourceFolders) {
    const fullPath = path.join(PROJECT_ROOT, folder);
    if (fs.existsSync(fullPath)) {
      pathsToBackup.push({ rel: folder, full: fullPath });
    } else {
      console.warn(`  [SKIP] Folder not found: ${fullPath}`);
    }
  }
  if (fs.existsSync(extensionSrc)) {
    pathsToBackup.push({ rel: 'extension/src', full: extensionSrc });
  } else {
    console.warn(`  [SKIP] extension/src not found: ${extensionSrc}`);
  }

  if (pathsToBackup.length === 0) {
    console.error('No folders found to back up!');
    process.exit(1);
  }

  console.log('');
  console.log('=== Budget App Backup ===');
  console.log(`Timestamp : ${timestamp}`);
  if (label) console.log(`Label     : ${label}`);
  console.log(`Output    : ${zipPath}`);
  console.log('');
  console.log('Folders to archive:');
  for (const p of pathsToBackup) {
    console.log(`  + ${p.rel}  (${p.full})`);
  }
  console.log('');

  // Stage files into a temp directory (ASCII path, safe for PowerShell)
  const tempDir = path.join(require('os').tmpdir(), `budget_backup_stage_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // Copy each folder into temp staging area
    for (const p of pathsToBackup) {
      const destPath = path.join(tempDir, p.rel);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      console.log(`  Copying ${p.rel}...`);
      copyDirSync(p.full, destPath);
    }

    // Create ZIP from staging dir, then move to Hebrew destination
    console.log('Creating ZIP archive...');
    createZip(tempDir, zipPath);

    const size = getFileSize(zipPath);
    console.log('');
    console.log('=== Backup Complete ===');
    console.log(`ZIP file  : ${zipPath}`);
    console.log(`ZIP size  : ${size}`);
    console.log(`Contents  : ${pathsToBackup.map(p => p.rel).join(', ')}`);
    console.log('');

    return zipPath;
  } catch (err) {
    console.error('Backup failed:', err.message);
    throw err;
  } finally {
    // Clean up staging temp dir using Node.js (no shell)
    try { rimrafSync(tempDir); } catch (e) { /* ignore */ }
  }
}

// Run directly
if (require.main === module) {
  const label = process.argv[2] || null;
  try {
    backup(label);
  } catch (e) {
    process.exit(1);
  }
}

module.exports = { backup };
