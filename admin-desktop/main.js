require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { app, BrowserWindow, ipcMain } = require('electron');
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
const SESSION_DURATION_MS = 30 * 60 * 1000;
const LOG_FILE = path.join(app.getPath('userData'), 'logs', 'admin.log');

let PROJECT_ROOT = path.join(__dirname, '..');
let ADMIN_HTML_PATH = path.join(PROJECT_ROOT, 'admin.html');
let win;
let adminUnlocked = false;
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

function writeAppLog(message, level = 'info') {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} [${level.toUpperCase()}] ${String(message)}\n`, 'utf8');
  } catch (e) {
    console.error('Could not write admin log:', e.message);
  }
}

function hasAccount() {
  return !!readAuth();
}

function hasValidSession() {
  const auth = readAuth();
  return !!(auth && Number(auth.sessionExpiresAt) > Date.now());
}

function rememberSession() {
  const auth = readAuth();
  if (!auth) return;
  writeAuth({ ...auth, sessionExpiresAt: Date.now() + SESSION_DURATION_MS });
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
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const auth = readAuth();
  const loginRecipient = process.env.ADMIN_EMAIL_TO;
  pendingEmailCode = { code, expiresAt };
  writeAppLog(`Sending sign-in code to ${loginRecipient}`);
  try {
    const info = await mailer().sendMail({
      from: `"Edgeducate Admin" <${process.env.SMTP_USER}>`,
      to: loginRecipient,
      subject: 'Edgeducate Admin — sign-in code',
      text: `Your sign-in code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
      html: `<p>Your sign-in code is <b style="font-size:1.3em">${code}</b>.</p><p>It expires in 10 minutes. If you did not request this, ignore this email.</p>`
    });
    writeAppLog(`Sign-in email accepted by SMTP for ${loginRecipient}; rejected recipients: ${(info.rejected || []).join(', ') || 'none'}`);
    if (auth) {
      const now = Date.now();
      const validCodes = Array.isArray(auth.emailCodes)
        ? auth.emailCodes.filter((entry) => entry.expiresAt > now)
        : [];
      validCodes.push({ hash: crypto.createHash('sha256').update(code).digest('hex'), expiresAt });
      auth.emailCodes = validCodes.slice(-5);
      delete auth.emailCodeHash;
      delete auth.emailCodeExpiresAt;
      writeAuth(auth);
    }
    return { ok: true };
  } catch (e) {
    pendingEmailCode = null;
    writeAppLog(`Sign-in email failed: ${e.message}`, 'error');
    return { ok: false, error: e.message };
  }
}

function verifyEmailCode(code) {
  const auth = readAuth();
  const submitted = crypto.createHash('sha256').update(String(code).trim()).digest('hex');
  const now = Date.now();
  const validCodes = auth && Array.isArray(auth.emailCodes)
    ? auth.emailCodes.filter((entry) => entry.expiresAt > now)
    : [];
  const ok = validCodes.some((entry) => entry.hash === submitted);
  if (ok) {
    delete auth.emailCodes;
    delete auth.emailCodeHash;
    delete auth.emailCodeExpiresAt;
    writeAuth(auth);
    pendingEmailCode = null;
  }
  writeAppLog(`Sign-in email code verification ${ok ? 'succeeded' : 'failed'}`);
  return ok;
}

/* ---------- password reset — must be confirmed via a code emailed to williamc@edgeducate.com.au ---------- */
let pendingResetCode = null; // { code, expiresAt }
let resetCodeVerified = false;
const RESET_CONFIRM_EMAIL = 'williamc@edgeducate.com.au';

async function sendResetCode() {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const expiresAt = Date.now() + 10 * 60 * 1000;
  pendingResetCode = { code, expiresAt };
  resetCodeVerified = false;
  writeAppLog(`Sending password-reset code to ${RESET_CONFIRM_EMAIL}`);
  try {
    const info = await mailer().sendMail({
      from: `"Edgeducate Admin" <${process.env.SMTP_USER}>`,
      to: RESET_CONFIRM_EMAIL,
      subject: 'Edgeducate Admin — password reset confirmation',
      text: `A password reset was requested for the Edgeducate Admin app. Confirmation code: ${code}. It expires in 10 minutes. If you did not request this, ignore this email — your password will not change.`,
      html: `<p>A password/2FA reset was requested for the Edgeducate Admin app.</p><p>Confirmation code: <b style="font-size:1.3em">${code}</b></p><p>It expires in 10 minutes. If you did not request this, ignore this email — nothing will change.</p>`
    });
    writeAppLog(`Password-reset email accepted by SMTP for ${RESET_CONFIRM_EMAIL}; rejected recipients: ${(info.rejected || []).join(', ') || 'none'}`);
    const auth = readAuth();
    if (auth) {
      const now = Date.now();
      const validCodes = Array.isArray(auth.resetCodes)
        ? auth.resetCodes.filter((entry) => entry.expiresAt > now)
        : [];
      validCodes.push({ hash: crypto.createHash('sha256').update(code).digest('hex'), expiresAt });
      auth.resetCodes = validCodes.slice(-5);
      delete auth.resetCodeHash;
      delete auth.resetCodeExpiresAt;
      writeAuth(auth);
    }
    return { ok: true };
  } catch (e) {
    pendingResetCode = null;
    writeAppLog(`Password-reset email failed: ${e.message}`, 'error');
    return { ok: false, error: e.message };
  }
}

function verifyResetCode(code) {
  const auth = readAuth();
  const submitted = crypto.createHash('sha256').update(String(code).trim()).digest('hex');
  const now = Date.now();
  const validCodes = auth && Array.isArray(auth.resetCodes)
    ? auth.resetCodes.filter((entry) => entry.expiresAt > now)
    : [];
  const ok = validCodes.some((entry) => entry.hash === submitted);
  if (ok) {
    resetCodeVerified = true;
    delete auth.resetCodes;
    delete auth.resetCodeHash;
    delete auth.resetCodeExpiresAt;
    writeAuth(auth);
  }
  writeAppLog(`Password-reset code verification ${ok ? 'succeeded' : 'failed'}`);
  return ok;
}

function resetPassword(newPassword) {
  if (!resetCodeVerified) return false;
  const auth = readAuth();
  if (!auth) return false;
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(newPassword, salt, 64).toString('hex');
  writeAuth({ ...auth, salt, hash, sessionExpiresAt: 0 });
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
    execFile('git', args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'auto' }
    }, (error, stdout, stderr) => {
      resolve({ ok: !error, output: (stdout || '') + (stderr || ''), error: error ? error.message : '' });
    });
  });
}

function runGit(args) {
  return runGitIn(PROJECT_ROOT, args);
}

function projectFilePath(relativePath) {
  const root = path.resolve(PROJECT_ROOT);
  const target = path.resolve(root, String(relativePath || ''));
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error('Invalid project path');
  return target;
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
  if (!status.ok) return { ok: false, log: `git status failed:\n${status.output || status.error}` };
  if (!status.output.trim()) return { ok: true, log: 'Nothing to sync — no local changes.' };

  const add = await runGit(['add', '-A']);
  if (!add.ok) return { ok: false, log: `git add failed:\n${add.output || add.error}` };

  // Dirty nested backups do not produce a stageable change in the parent repo.
  const staged = await runGit(['diff', '--cached', '--quiet']);
  if (staged.ok) {
    return { ok: true, pushed: false, log: 'Saved locally. No changes in the main repository to push.' };
  }

  const commit = await runGit(['commit', '-m', message || 'Update via Edgeducate Admin']);
  if (!commit.ok) return { ok: false, log: `git commit failed:\n${commit.output || commit.error}` };

  // Publish to main explicitly so Cloudflare/Workers serves the latest admin changes.
  const push = await runGit(['push', 'origin', 'HEAD:main']);
  if (!push.ok) return { ok: false, log: `git push failed:\n${push.output || push.error}` };

  return { ok: true, pushed: true, log: `${commit.output}\n${push.output}`.trim() };
}

async function gitPullData() {
  const mainPull = await runGit(['pull', 'origin', 'main']);
  if (mainPull.ok) return mainPull;

  const upstreamPull = await runGit(['pull']);
  if (upstreamPull.ok) {
    return {
      ok: true,
      output: `Pull from origin/main failed, pulled current upstream instead.\n\norigin/main:\n${mainPull.output || mainPull.error}\n\nupstream:\n${upstreamPull.output || upstreamPull.error}`
    };
  }

  return {
    ok: false,
    output: `git pull origin main failed:\n${mainPull.output || mainPull.error}\n\nFallback git pull also failed:\n${upstreamPull.output || upstreamPull.error}`
  };
}

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

ipcMain.handle('window:setFullscreen', (event, flag) => {
  if (!win) return false;
  win.setFullScreen(!!flag);
  return win.isFullScreen();
});
ipcMain.handle('window:isFullscreen', () => (win ? win.isFullScreen() : false));

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
ipcMain.handle('auth:hasValidSession', () => hasValidSession());
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
ipcMain.handle('auth:isUnlocked', () => adminUnlocked);
ipcMain.handle('auth:unlock', () => {
  if (!checkAdminFilesPresent(PROJECT_ROOT)) {
    adminUnlocked = false;
    win.loadFile(path.join(__dirname, 'missing-admin.html'));
    return true;
  }
  rememberSession();
  adminUnlocked = true;
  win.loadFile(ADMIN_HTML_PATH);
  return true;
});
ipcMain.handle('auth:pullBeforeUnlock', async () => {
  if (!fs.existsSync(path.join(PROJECT_ROOT, '.git'))) return { ok: true, log: 'Not a git checkout — nothing to pull.' };
  return gitPullData();
});
ipcMain.handle('git:sync', (event, message) => gitSync(message));
ipcMain.handle('git:pull', () => gitPullData());
ipcMain.handle('project:connect', () => {
  const required = ['data/resources.js', 'data/ads.js', 'data/club-deals.js', 'data/packages.js'];
  const missing = required.filter((file) => !fs.existsSync(projectFilePath(file)));
  return { ok: missing.length === 0, missing };
});
ipcMain.handle('project:write', async (event, { relativePath, content }) => {
  const target = projectFilePath(relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const data = content && typeof content.arrayBuffer === 'function'
    ? Buffer.from(await content.arrayBuffer())
    : Buffer.from(content);
  fs.writeFileSync(target, data);
  return true;
});
ipcMain.handle('project:list', (event, relativePath) => {
  const target = projectFilePath(relativePath);
  if (!fs.existsSync(target)) return [];
  return fs.readdirSync(target, { withFileTypes: true }).map((entry) => [entry.name, entry.isDirectory() ? 'directory' : 'file']);
});
ipcMain.handle('project:remove', (event, { relativePath, recursive }) => {
  const target = projectFilePath(relativePath);
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: Boolean(recursive), force: true });
  return true;
});
ipcMain.handle('app:getPaths', () => ({ standaloneDir: PROJECT_ROOT, logFile: LOG_FILE }));
ipcMain.handle('app:writeLog', (event, { message, level }) => {
  writeAppLog(message, level);
  return true;
});

app.whenReady().then(async () => {
  const resolved = await resolveProjectRoot();
  PROJECT_ROOT = resolved.root;
  ADMIN_HTML_PATH = path.join(PROJECT_ROOT, 'admin.html');
  console.log(resolved.log);
  writeAppLog(resolved.log);

  createWindow(LOGIN_HTML_PATH);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(LOGIN_HTML_PATH);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
