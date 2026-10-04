// אחסון מקומי: יינות ב-IndexedDB (כולל תמונות), הגדרות ב-localStorage.

const DB_NAME = 'cellar';
const STORE = 'wines';
let dbPromise;

const BACKUPS = 'backups';
const KEEP_BACKUPS = 5;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(BACKUPS)) db.createObjectStore(BACKUPS, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode, fn, store = STORE) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
  });
}

export const getAllWines = () => tx('readonly', (s) => s.getAll());
export const putWine = (wine) => tx('readwrite', (s) => s.put(wine));
export const deleteWine = (id) => tx('readwrite', (s) => s.delete(id));
export const clearWines = () => tx('readwrite', (s) => s.clear());

// ---------- גיבויים אוטומטיים (עותק מלא של המרתף בתוך הטלפון) ----------

export async function listBackups() {
  const all = await tx('readonly', (s) => s.getAll(), BACKUPS);
  return all.sort((a, b) => b.id - a.id);
}

export async function saveBackup(wines, reason) {
  if (!wines.length) return;
  await tx('readwrite', (s) => s.put({ id: Date.now(), reason, count: wines.length, wines }), BACKUPS);
  const all = await listBackups();
  for (const old of all.slice(KEEP_BACKUPS)) {
    await tx('readwrite', (s) => s.delete(old.id), BACKUPS);
  }
}

export async function restoreBackup(id) {
  const backup = await tx('readonly', (s) => s.get(id), BACKUPS);
  if (!backup) throw new Error('הגיבוי לא נמצא');
  await tx('readwrite', (s) => {
    s.clear();
    backup.wines.forEach((w) => s.put(w));
  });
  return backup.wines;
}

const SETTINGS_KEY = 'cellar.settings';
const DEFAULT_SETTINGS = {
  apiKey: '',
  language: 'he',
  webSearch: true,
  fastMode: true,
  currency: 'ILS',
  shopCountry: 'IL',
  shopCity: '',
  storeName: '',
  storePhone: '',
  storeEmail: '',
  myName: '',
  reorderQty: 1,
};

export function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // אחסון חסום (מצב פרטי) - ההגדרות יישמרו רק עד סגירת האפליקציה
  }
}
