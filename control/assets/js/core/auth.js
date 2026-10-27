/* Browser-local demonstration access. Production access requires server authentication. */
const ACCOUNT_KEY = 'mmtc.admin.account.v1';
const SESSION_KEY = 'mmtc.admin.session.v1';
const MAX_AGE = 8 * 60 * 60 * 1000;
const bytes = (hex) => Uint8Array.from(hex.match(/.{2}/g), (x) => parseInt(x, 16));
const hex = (buffer) => [...new Uint8Array(buffer)].map((x) => x.toString(16).padStart(2, '0')).join('');

async function derive(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: bytes(salt), iterations: 120000, hash: 'SHA-256' }, key, 256));
}
async function makeAccount(username, password) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return { username, salt, hash: await derive(password, salt), revision: crypto.randomUUID() };
}
export async function initAccount() {
  if (!localStorage.getItem(ACCOUNT_KEY)) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(await makeAccount('ADMIN', '1234')));
  return getAccount();
}
function read(key, storage) {
  try { return JSON.parse(storage.getItem(key)); } catch { return null; }
}
function getAccount() { return read(ACCOUNT_KEY, localStorage); }
export function accountName() { return getAccount()?.username || 'ADMIN'; }
export function isAuthenticated() {
  const session = read(SESSION_KEY, sessionStorage);
  const account = getAccount();
  return !!(account && session && session.revision === account.revision && session.expires > Date.now());
}
export async function login(username, password) {
  const account = await initAccount();
  if (username.trim() !== account.username || await derive(password, account.salt) !== account.hash) return false;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ revision: account.revision, expires: Date.now() + MAX_AGE }));
  return true;
}
export function logout() { sessionStorage.removeItem(SESSION_KEY); location.reload(); }
export async function changeAccount({ currentPassword, username, password }) {
  if (!isAuthenticated()) throw Error('다시 로그인해 주세요.');
  const account = getAccount();
  if (await derive(currentPassword, account.salt) !== account.hash) throw Error('현재 비밀번호가 일치하지 않습니다.');
  username = username.trim();
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(username)) throw Error('아이디는 영문·숫자·밑줄·하이픈 3~40자로 입력하세요.');
  if (password && (password.length < 4 || password.length > 128)) throw Error('새 비밀번호는 4~128자로 입력하세요.');
  const updated = password ? await makeAccount(username, password) : { ...account, username, revision: crypto.randomUUID() };
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(updated));
  sessionStorage.removeItem(SESSION_KEY);
}
window.addEventListener('storage', (event) => {
  if (event.key === ACCOUNT_KEY && !isAuthenticated()) location.reload();
});
