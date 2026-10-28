function hashPin_(pin) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(pin),
    Utilities.Charset.UTF_8
  );
  return bytes.map(b => (b + 256) % 256).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getUsers_() {
  const raw = PropertiesService.getScriptProperties().getProperty('USERS_JSON') || '[]';
  let users;
  try {
    users = JSON.parse(raw);
  } catch (e) {
    throw new Error('USERS_JSON is not valid JSON.');
  }
  return Array.isArray(users) ? users : [];
}

function saveUsers_(users) {
  PropertiesService.getScriptProperties().setProperty('USERS_JSON', JSON.stringify(users));
}

// Run from the Apps Script editor to add or update an approved user.
function setInventoryUser_(email, name, role, pin) {
  email = String(email || '').trim().toLowerCase();
  if (!email || !pin) throw new Error('Email and PIN are required.');
  role = String(role || 'employee').toLowerCase();
  if (!['admin', 'employee', 'view'].includes(role)) throw new Error('Role must be admin, employee, or view.');

  const users = getUsers_();
  const next = users.filter(u => String(u.email).toLowerCase() !== email);
  next.push({
    email,
    name: String(name || email),
    role,
    pinHash: hashPin_(pin),
    active: true,
  });
  saveUsers_(next);
  return `Saved ${email} as ${role}.`;
}

function loginUser(email, pin) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return loginUser_(email, pin); } finally { lock.releaseLock(); }
}

function loginUser_(email, pin) {
  email = String(email || '').trim().toLowerCase();
  const cache = CacheService.getScriptCache();
  const key = 'login-failures:' + hashPin_(email);
  const failures = Number(cache.get(key) || 0);
  if (failures >= 5) throw new Error('Too many login attempts. Try again in 15 minutes.');
  const user = getUsers_().find(u => String(u.email).toLowerCase() === email && u.active !== false);
  if (!user || user.pinHash !== hashPin_(pin)) {
    cache.put(key, String(failures + 1), 900);
    throw new Error('Invalid email or PIN.');
  }
  cache.remove(key);

  const token = Utilities.getUuid() + Utilities.getUuid();
  const session = { email: user.email, name: user.name || user.email, role: user.role || 'employee' };
  CacheService.getScriptCache().put(`session:${token}`, JSON.stringify(session), APP.SESSION_SECONDS);
  return { token, user: session };
}

function logoutUser(token) {
  if (token) CacheService.getScriptCache().remove(`session:${token}`);
  return true;
}

function requireSession_(token, writeRequired) {
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  const raw = CacheService.getScriptCache().get(`session:${token}`);
  if (!raw) throw new Error('Your session has expired. Please sign in again.');
  const session = JSON.parse(raw);
  const approved = getUsers_().find(u => u.email === session.email && u.active !== false);
  if (!approved || !['admin', 'employee', 'view'].includes(approved.role)) throw new Error('Your access has been revoked. Please sign in again.');
  const user = {email: approved.email, name: approved.name || approved.email, role: approved.role};
  if (writeRequired && user.role === 'view') throw new Error('You do not have permission to change inventory.');
  return user;
}

