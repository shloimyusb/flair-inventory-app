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

function loginUser(email, pin, rememberMe) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return loginUser_(email, pin, rememberMe===true); } finally { lock.releaseLock(); }
}

function loginUser_(email, pin, rememberMe) {
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
  const expiresAt=Date.now()+(rememberMe?30*24*60*60:APP.SESSION_SECONDS)*1000;
  const session = { email:user.email,expiresAt,pinVersion:hashPin_(user.pinHash) };
  if(rememberMe){
    pruneRememberedSessions_();
    PropertiesService.getScriptProperties().setProperty(rememberedSessionKey_(token),JSON.stringify(session));
  }
  CacheService.getScriptCache().put(`session:${token}`, JSON.stringify(session), APP.SESSION_SECONDS);
  return { token, user:{email:user.email,name:user.name||user.email,role:user.role||'employee'},remembered:!!rememberMe,expiresAt };
}

function rememberedSessionKey_(token){return 'remembered-session:'+hashPin_(token);}
function pruneRememberedSessions_(){
  const props=PropertiesService.getScriptProperties(),all=props.getProperties();
  Object.keys(all).filter(key=>key.startsWith('remembered-session:')).forEach(key=>{
    try {if(JSON.parse(all[key]).expiresAt<=Date.now())props.deleteProperty(key);}catch(e){props.deleteProperty(key);}
  });
}

function logoutUser(token) {
  if (token) {
    CacheService.getScriptCache().remove(`session:${token}`);
    PropertiesService.getScriptProperties().deleteProperty(rememberedSessionKey_(token));
  }
  return true;
}

function requireSession_(token, writeRequired) {
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  const cache=CacheService.getScriptCache();
  const raw = cache.get(`session:${token}`) || PropertiesService.getScriptProperties().getProperty(rememberedSessionKey_(token));
  if (!raw) throw new Error('Your session has expired. Please sign in again.');
  const session = JSON.parse(raw);
  if(session.expiresAt && session.expiresAt<=Date.now()){logoutUser(token);throw new Error('Your session has expired. Please sign in again.');}
  const approved = getUsers_().find(u => u.email === session.email && u.active !== false);
  if (!approved || !['admin', 'employee', 'view'].includes(approved.role) || (session.pinVersion && session.pinVersion!==hashPin_(approved.pinHash))) {
    logoutUser(token);throw new Error('Your access has been revoked. Please sign in again.');
  }
  if(session.expiresAt)cache.put(`session:${token}`,raw,Math.min(APP.SESSION_SECONDS,Math.max(1,Math.floor((session.expiresAt-Date.now())/1000))));
  const user = {email: approved.email, name: approved.name || approved.email, role: approved.role};
  if (writeRequired && user.role === 'view') throw new Error('You do not have permission to change inventory.');
  return user;
}

