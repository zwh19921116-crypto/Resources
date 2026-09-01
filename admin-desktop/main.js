require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');

const REPO_URL = 'https://github.com/zwh19921116-crypto/Resources.git';
const STANDALONE_CLONE_DIR = path.join(app.getPath('userData'), 'repo');
const LOGIN_HTML_PATH = path.join(__dirname, 'login.html');
const AUTH_FILE = path.join(app.getPath('userData'), 'auth.json');
const SESSION_FILE = path.join(app.getPath('userData'), 'session.json');
const SESSION_TTL_MS = 30 * 60 * 1000; // stay signed in for 30 minutes across app restarts

let PROJECT_ROOT = path.join(__dirname, '..');
let ADMIN_HTML_PATH = path.join(PROJECT_ROOT, 'admin.html');
let win;
let pendingEmailCode = null; // { code, expiresAt }
let failedAttempts = 0;
let lockoutUntil = 0;

/* ---------- local account storage (no server, no plaintext password/2FA state) ---------- */
function readAuth() {
  if (!fs.existsSync(AUTH_FILE)) return null;
  return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
}
function writeAuth(data) {
  fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2));
}

function hasAccount() {
  return !!readAuth();
}

function markSessionUnlocked() {
  fs.writeFileSync(SESSION_FILE, JSON.stringify({ ts: Date.now() }));
}
function hasRecentSession() {
  if (!fs.existsSync(SESSION_FILE)) return false;
  try {
    const { ts } = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    return Date.now() - ts < SESSION_TTL_MS;
  } catch (e) {
    return false;
  }
}
function clearSession() {
  if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
}

function setAccount(username, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  writeAuth({ username, salt, hash, totpSecret: null, backupCodes: [] });
}

function verifyAccount(username, password) {
  const auth = readAuth();
  if (!auth) return false;
  if (auth.username !== username) return false;
  const attempt = crypto.scryptSync(password, auth.salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(attempt, 'hex'), Buffer.from(auth.hash, 'hex'));
}

function checkLockout() {
  if (Date.now() < lockoutUntil) {
    return Math.ceil((lockoutUntil - Date.now()) / 1000);
  }
  return 0;
}
function registerFailure() {
  failedAttempts += 1;
  if (failedAttempts >= 5) {
    lockoutUntil = Date.now() + 30000;
    failedAttempts = 0;
  }
}
function registerSuccess() {
  failedAttempts = 0;
  lockoutUntil = 0;
}

/* ---------- TOTP (RFC 6238) — same algorithm as Google Authenticator / Authy, fully offline ---------- */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let output = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) output += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  return output;
}
function base32Decode(str) {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of clean) bits += BASE32_ALPHABET.indexOf(char).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totpAt(secretBuffer, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuffer).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

function verifyTotpCode(secretBase32, code) {
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / 30);
  // allow the previous/current/next 30s window to tolerate clock drift
  for (const step of [-1, 0, 1]) {
    if (totpAt(secret, counter + step) === String(code).trim()) return true;
  }
  return false;
}

async function setup2fa() {
  const auth = readAuth();
  const secret = base32Encode(crypto.randomBytes(20));
  const backupCodesPlain = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex'));
  const backupCodes = backupCodesPlain.map((c) => ({ hash: crypto.createHash('sha256').update(c).digest('hex'), used: false }));

  const otpauthUrl = `otpauth://totp/Edgeducate%20Admin:${encodeURIComponent(auth.username)}?secret=${secret}&issuer=Edgeducate%20Admin&digits=6&period=30`;
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

  writeAuth({ ...auth, totpSecret: secret, backupCodes, pendingSecret: secret });
  return { secret, otpauthUrl, qrDataUrl, backupCodes: backupCodesPlain };
}

function has2fa() {
  const auth = readAuth();
  return !!(auth && auth.totpSecret);
}

function verifyTotp(code) {
  const auth = readAuth();
  if (!auth || !auth.totpSecret) return false;
  return verifyTotpCode(auth.totpSecret, code);
}

function verifyBackupCode(code) {
  const auth = readAuth();
  if (!auth || !auth.backupCodes) return false;
  const hash = crypto.createHash('sha256').update(String(code).trim()).digest('hex');
  const match = auth.backupCodes.find((entry) => entry.hash === hash && !entry.used);
  if (!match) return false;
  match.used = true;
  writeAuth(auth);
  return true;
}

/* ---------- email code (3rd factor) ---------- */
function mailer() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE) === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    // Some local antivirus (e.g. Norton) intercepts TLS to scan mail traffic, presenting its own
    // certificate instead of Gmail's — this trusts that local interception for this connection only.
    tls: { rejectUnauthorized: false }
  });
}

async function sendEmailCode() {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  pendingEmailCode = { code, expiresAt: Date.now() + 10 * 60 * 1000 };
  try {
    await mailer().sendMail({
      from: `"Edgeducate Admin" <${process.env.SMTP_USER}>`,
      to: process.env.ADMIN_EMAIL_TO,
      subject: 'Edgeducate Admin — sign-in code',
      text: `Your sign-in code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
      html: `<p>Your sign-in code is <b style="font-size:1.3em">${code}</b>.</p><p>It expires in 10 minutes. If you did not request this, ignore this email.</p>`
    });
    return { ok: true };
  } catch (e) {
    pendingEmailCode = null;
    return { ok: false, error: e.message };
  }
}

function verifyEmailCode(code) {
  if (!pendingEmailCode) return false;
  if (Date.now() > pendingEmailCode.expiresAt) return false;
  const ok = String(code).trim() === pendingEmailCode.code;
  if (ok) pendingEmailCode = null;
  return ok;
}

/* ---------- password reset — must be confirmed via a code emailed to williamc@edgeducate.com.au ---------- */
let pendingResetCode = null; // { code, expiresAt }
let resetCodeVerified = false;
const RESET_CONFIRM_EMAIL = 'williamc@edgeducate.com.au';

async function sendResetCode() {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  pendingResetCode = { code, expiresAt: Date.now() + 10 * 60 * 1000 };
  resetCodeVerified = false;
  try {
    await mailer().sendMail({
      from: `"Edgeducate Admin" <${process.env.SMTP_USER}>`,
      to: RESET_CONFIRM_EMAIL,
      subject: 'Edgeducate Admin — password reset confirmation',
      text: `A password reset was requested for the Edgeducate Admin app. Confirmation code: ${code}. It expires in 10 minutes. If you did not request this, ignore this email — your password will not change.`,
      html: `<p>A password/2FA reset was requested for the Edgeducate Admin app.</p><p>Confirmation code: <b style="font-size:1.3em">${code}</b></p><p>It expires in 10 minutes. If you did not request this, ignore this email — nothing will change.</p>`
    });
    return { ok: true };
  } catch (e) {
    pendingResetCode = null;
    return { ok: false, error: e.message };
  }
}

function verifyResetCode(code) {
  if (!pendingResetCode) return false;
  if (Date.now() > pendingResetCode.expiresAt) return false;
  const ok = String(code).trim() === pendingResetCode.code;
  if (ok) {
    resetCodeVerified = true;
    pendingResetCode = null;
  }
  return ok;
}

function resetPassword(newPassword) {
  if (!resetCodeVerified) return false;
  const auth = readAuth();
  if (!auth) return false;
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(newPassword, salt, 64).toString('hex');
  writeAuth({ ...auth, salt, hash });
  resetCodeVerified = false;
  registerSuccess();
  return true;
}

/** Last-resort recovery: proving control of the email inbox lets you regenerate 2FA from scratch
 *  (new QR + new backup codes), so a broken authenticator or lost backup codes can never permanently lock you out. */
async function reset2faViaEmail() {
  if (!resetCodeVerified) return null;
  resetCodeVerified = false;
  registerSuccess();
  return setup2fa();
}

/* ---------- git sync (uses your machine's own git + credentials) ---------- */
function runGitIn(cwd, args) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd }, (error, stdout, stderr) => {
      resolve({ ok: !error, output: (stdout || '') + (stderr || ''), error: error ? error.message : '' });
    });
  });
}
function runGit(args) {
  return runGitIn(PROJECT_ROOT, args);
}

/**
 * Dev checkout (this PC): admin-desktop sits inside the real project's git working tree — use it directly.
 * Standalone copy (e.g. a laptop): maintain our own managed clone of the public repo for the text data
 * (resources/ads/config — no images, they're just external URLs), cloning on first run and pulling every
 * launch. No rebuild ever needed for content changes.
 *
 * admin.html / admin.js are never published to the public site, so they travel INSIDE this admin-desktop
 * folder (in admin-panel/) instead — copy this whole folder to a new machine and it's fully self-contained.
 */
const ADMIN_PANEL_DIR = path.join(__dirname, 'admin-panel');
const ADMIN_PANEL_FILES = ['admin.html', 'admin.js'];

function checkAdminFilesPresent(root) {
  return ADMIN_PANEL_FILES.every((f) => fs.existsSync(path.join(root, f)));
}

/** Keeps admin-panel/ (the distributable copy) and the working project root in sync, in whichever
 *  direction makes sense: on the dev machine the root is authoritative; everywhere else, admin-panel/ is. */
function syncAdminPanelFiles(root, isDevMachine) {
  fs.mkdirSync(ADMIN_PANEL_DIR, { recursive: true });
  for (const file of ADMIN_PANEL_FILES) {
    const rootPath = path.join(root, file);
    const panelPath = path.join(ADMIN_PANEL_DIR, file);
    if (isDevMachine) {
      if (fs.existsSync(rootPath)) fs.copyFileSync(rootPath, panelPath);
    } else if (fs.existsSync(panelPath)) {
      fs.copyFileSync(panelPath, rootPath);
    }
  }
}

async function resolveProjectRoot() {
  const adjacentRepo = path.join(__dirname, '..');
  if (fs.existsSync(path.join(adjacentRepo, '.git'))) {
    syncAdminPanelFiles(adjacentRepo, true);
    return { root: adjacentRepo, log: 'Running from the project checkout next to admin-desktop.' };
  }

  let log = '';
  if (!fs.existsSync(path.join(STANDALONE_CLONE_DIR, '.git'))) {
    fs.mkdirSync(path.dirname(STANDALONE_CLONE_DIR), { recursive: true });
    const clone = await runGitIn(path.dirname(STANDALONE_CLONE_DIR), ['clone', REPO_URL, STANDALONE_CLONE_DIR]);
    if (!clone.ok) return { root: adjacentRepo, log: `Clone failed, falling back to adjacent folder:\n${clone.output || clone.error}` };
    log = `Cloned the project into ${STANDALONE_CLONE_DIR}.`;
  } else {
    const pull = await runGitIn(STANDALONE_CLONE_DIR, ['pull']);
    log = pull.ok ? `Pulled latest: ${pull.output.trim() || 'already up to date.'}` : `Pull failed:\n${pull.output || pull.error}`;
  }

  syncAdminPanelFiles(STANDALONE_CLONE_DIR, false);
  return { root: STANDALONE_CLONE_DIR, log };
}

async function gitSync(message) {
  const status = await runGit(['status', '--porcelain']);
  if (!status.ok) return { ok: false, pushed: false, log: `git status failed:\n${status.output || status.error}` };
  if (!status.output.trim()) return { ok: true, pushed: false, log: 'Nothing to sync — no local changes.' };

  const add = await runGit(['add', '-A']);
  if (!add.ok) return { ok: false, pushed: false, log: `git add failed:\n${add.output || add.error}` };

  const commit = await runGit(['commit', '-m', message || 'Update via Edgeducate Admin']);
  if (!commit.ok) return { ok: false, pushed: false, log: `git commit failed:\n${commit.output || commit.error}` };

  const push = await runGit(['push']);
  if (!push.ok) return { ok: false, pushed: false, log: `git push failed:\n${push.output || push.error}` };

  const rev = await runGit(['rev-parse', 'HEAD']);
  return { ok: true, pushed: true, commitSha: rev.ok ? rev.output.trim() : '', log: `${commit.output}\n${push.output}`.trim() };
}

/* ---------- settings (SMTP etc.) stored in .env, editable from the app ---------- */
const ENV_PATH = path.join(__dirname, '.env');
const SETTINGS_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'ADMIN_EMAIL_TO'];

function readEnvFile() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const out = {};
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

function writeEnvFile(updates) {
  const current = readEnvFile();
  Object.assign(current, updates);
  const lines = Object.entries(current).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n');
  for (const [k, v] of Object.entries(updates)) process.env[k] = v;
}

function getSettings() {
  const env = { ...process.env, ...readEnvFile() };
  const out = {};
  for (const key of SETTINGS_KEYS) out[key] = env[key] || '';
  return out;
}

function saveSettings(fields) {
  const updates = {};
  for (const key of SETTINGS_KEYS) if (fields[key] !== undefined) updates[key] = String(fields[key]);
  writeEnvFile(updates);
  return getSettings();
}

/* ---------- native filesystem bridge (reliable folder picker + file read/write, avoids the browser
 * File System Access API which can silently hang forever in Electron instead of resolving/rejecting) ---------- */
ipcMain.handle('fs:pickFolder', async () => {
  const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  return { canceled: false, path: result.filePaths[0] };
});
ipcMain.handle('fs:ensureDir', (event, dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
  return true;
});
ipcMain.handle('fs:readFile', (event, filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return null;
  }
});
ipcMain.handle('fs:writeFile', (event, filePath, content) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return true;
});
ipcMain.handle('fs:exists', (event, filePath) => fs.existsSync(filePath));
ipcMain.handle('fs:openFolder', (event, dirPath) => shell.openPath(dirPath));
ipcMain.handle('fs:listDir', (event, dirPath) => {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath, { withFileTypes: true }).map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }));
});
ipcMain.handle('fs:removeEntry', (event, entryPath, recursive) => {
  fs.rmSync(entryPath, { recursive: !!recursive, force: true });
  return true;
});

function createWindow(startFile) {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Edgeducate Admin',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(startFile);
}

ipcMain.handle('auth:hasAccount', () => hasAccount());
ipcMain.handle('auth:setAccount', (event, { username, password }) => {
  setAccount(username, password);
  return true;
});
ipcMain.handle('auth:verifyAccount', (event, { username, password }) => {
  const remaining = checkLockout();
  if (remaining) return { ok: false, locked: remaining };
  const ok = verifyAccount(username, password);
  if (ok) registerSuccess();
  else registerFailure();
  return { ok };
});
ipcMain.handle('auth:has2fa', () => has2fa());
ipcMain.handle('auth:setup2fa', () => setup2fa());
ipcMain.handle('auth:verifyTotp', (event, code) => verifyTotp(code));
ipcMain.handle('auth:verifyBackupCode', (event, code) => verifyBackupCode(code));
ipcMain.handle('auth:sendEmailCode', () => sendEmailCode());
ipcMain.handle('auth:verifyEmailCode', (event, code) => verifyEmailCode(code));
ipcMain.handle('auth:sendResetCode', () => sendResetCode());
ipcMain.handle('auth:verifyResetCode', (event, code) => verifyResetCode(code));
ipcMain.handle('auth:resetPassword', (event, password) => resetPassword(password));
ipcMain.handle('auth:reset2faViaEmail', () => reset2faViaEmail());
ipcMain.handle('auth:unlock', () => {
  markSessionUnlocked();
  if (!checkAdminFilesPresent(PROJECT_ROOT)) {
    win.loadFile(path.join(__dirname, 'missing-admin.html'));
    return true;
  }
  win.loadFile(ADMIN_HTML_PATH);
  return true;
});
ipcMain.handle('auth:hasRecentSession', () => hasRecentSession());
ipcMain.handle('auth:signOut', () => { clearSession(); return true; });
ipcMain.handle('auth:pullBeforeUnlock', async () => {
  if (!fs.existsSync(path.join(PROJECT_ROOT, '.git'))) return { ok: true, log: 'Not a git checkout — nothing to pull.' };
  return runGit(['pull']);
});
ipcMain.handle('git:sync', (event, message) => gitSync(message));
ipcMain.handle('git:pull', () => runGit(['pull']));
ipcMain.handle('git:status', async () => {
  const status = await runGit(['status', '--porcelain', '-b']);
  const lines = status.output.split('\n');
  const branchLine = lines[0] || '';
  const aheadMatch = branchLine.match(/ahead (\d+)/);
  const ahead = aheadMatch ? Number(aheadMatch[1]) : 0;
  const files = lines.slice(1).map((l) => l.trim()).filter(Boolean);
  const lastCommit = await runGit(['log', '-1', '--format=%ci']);
  return { ok: status.ok, count: files.length, ahead, files, lastCommit: lastCommit.ok ? lastCommit.output.trim() : '' };
});
ipcMain.handle('app:getPaths', () => ({ standaloneDir: PROJECT_ROOT }));
ipcMain.handle('settings:get', () => getSettings());
ipcMain.handle('settings:save', (event, fields) => saveSettings(fields));

app.whenReady().then(async () => {
  const resolved = await resolveProjectRoot();
  PROJECT_ROOT = resolved.root;
  ADMIN_HTML_PATH = path.join(PROJECT_ROOT, 'admin.html');
  console.log(resolved.log);

  createWindow(LOGIN_HTML_PATH);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(LOGIN_HTML_PATH);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
