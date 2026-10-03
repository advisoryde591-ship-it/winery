// אחסון מקומי: יינות ב-IndexedDB (כולל תמונות), הגדרות ב-localStorage.

const DB_NAME = 'cellar';
const STORE = 'wines';
let dbPromise;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
  });
}

export const getAllWines = () => tx('readonly', (s) => s.getAll());
export const putWine = (wine) => tx('readwrite', (s) => s.put(wine));
export const deleteWine = (id) => tx('readwrite', (s) => s.delete(id));
export const clearWines = () => tx('readwrite', (s) => s.clear());

const SETTINGS_KEY = 'cellar.settings';
const DEFAULT_SETTINGS = {
  apiKey: '',
  webSearch: true,
  currency: 'ILS',
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
