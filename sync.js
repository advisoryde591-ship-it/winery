// מרתף משותף: סנכרון היינות דרך Firestore בין כמה טלפונים שיודעים את אותו קוד מרתף.
// המקור לתצוגה נשאר ה-IndexedDB המקומי; כאן רק מעבירים שינויים לענן וממנו.
import { firebaseConfig } from './firebase-config.js?v=18';

const CODE_KEY = 'cellar.sharedCode';
const LAST_SYNC_KEY = 'cellar.lastSyncAt';
// שדות שנשארים רק בטלפון (כבדים ונחוצים רק לעריכת התמונה)
const LOCAL_ONLY = ['photoFull', 'photoOriginal'];
const MAX_DOC_BYTES = 900_000;

let fb = null;
let db = null;
let unsubscribe = null;

export const syncConfigured = () => Boolean(firebaseConfig?.projectId);

export function getCode() {
  try {
    return localStorage.getItem(CODE_KEY);
  } catch {
    return null;
  }
}

function setCode(code) {
  try {
    if (code) localStorage.setItem(CODE_KEY, code);
    else localStorage.removeItem(CODE_KEY);
  } catch { /* אחסון חסום */ }
}

function getLastSync() {
  try {
    return Number(localStorage.getItem(LAST_SYNC_KEY)) || 0;
  } catch {
    return 0;
  }
}

function setLastSync(t) {
  try {
    localStorage.setItem(LAST_SYNC_KEY, String(t));
  } catch { /* אחסון חסום */ }
}

// קוד אקראי של 24 תווים (בלי תווים שמתבלבלים כמו 0/o ו-1/l)
export function newCode() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

export const formatCode = (code) => code.match(/.{1,4}/g).join('-');
export const cleanCode = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function firestore() {
  if (db) return db;
  fb = await import('./vendor/firebase.js');
  const app = fb.initializeApp(firebaseConfig);
  db = fb.initializeFirestore(app, {
    localCache: fb.memoryLocalCache(),
    ...(firebaseConfig.forceLongPolling ? { experimentalForceLongPolling: true } : {}),
  });
  if (firebaseConfig.emulatorHost) {
    const [host, port] = firebaseConfig.emulatorHost.split(':');
    fb.connectFirestoreEmulator(db, host, Number(port));
  }
  return db;
}

const winesRef = (code) => fb.collection(db, 'cellars', code, 'wines');

function toRemote(wine) {
  const copy = { ...wine };
  for (const k of LOCAL_ONLY) delete copy[k];
  for (const [k, v] of Object.entries(copy)) if (v === undefined) delete copy[k];
  // מסמך בענן מוגבל ל-1MB; תמונה גדולה מדי נשארת רק בטלפון
  if (JSON.stringify(copy).length > MAX_DOC_BYTES) delete copy.photo;
  return copy;
}

export async function pushWine(wine) {
  const code = getCode();
  if (!code || !syncConfigured()) return;
  await firestore();
  await fb.setDoc(fb.doc(db, 'cellars', code, 'wines', wine.id), toRemote(wine));
}

export async function removeWine(id) {
  const code = getCode();
  if (!code || !syncConfigured()) return;
  await firestore();
  await fb.deleteDoc(fb.doc(db, 'cellars', code, 'wines', id));
}

// כתיבה בקבוצות לפי גודל: Firestore מגביל בקשה אחת לכ-10MB
async function pushMany(code, wines) {
  const LIMIT = 3_000_000;
  let batch = fb.writeBatch(db);
  let size = 0;
  let count = 0;
  for (const w of wines) {
    const data = toRemote(w);
    const bytes = JSON.stringify(data).length;
    if (count && (size + bytes > LIMIT || count >= 100)) {
      await batch.commit();
      batch = fb.writeBatch(db);
      size = 0;
      count = 0;
    }
    batch.set(fb.doc(db, 'cellars', code, 'wines', w.id), data);
    size += bytes;
    count += 1;
  }
  if (count) await batch.commit();
}

// מחליף את כל המרתף בענן ברשימה הנתונה (אחרי שחזור מגיבוי)
export async function replaceAll(wines) {
  const code = getCode();
  if (!code || !syncConfigured()) return;
  await firestore();
  const remote = await fb.getDocs(winesRef(code));
  const keep = new Set(wines.map((w) => w.id));
  for (const d of remote.docs) if (!keep.has(d.id)) await fb.deleteDoc(d.ref);
  await pushMany(code, wines);
}

/**
 * מתחבר למרתף ומאזין לשינויים.
 * localWines: היינות בטלפון כרגע.
 * apply({ upsert: [...], remove: [...ids] }): מחיל שינויים שהגיעו מהענן על הטלפון.
 * onStatus(text, ok): מצב החיבור לתצוגה.
 */
export async function start(localWinesFn, apply, onStatus) {
  stop();
  const code = getCode();
  if (!code || !syncConfigured()) return;
  onStatus('מתחבר…', null);
  await firestore();
  let first = true;
  unsubscribe = fb.onSnapshot(winesRef(code), { includeMetadataChanges: true }, async (snap) => {
    // בלי חיבור Firebase מחזיר קודם רשימה מהזיכרון (לפעמים ריקה). משווים רק מול תשובה אמיתית מהשרת,
    // אחרת יינות היו נמחקים מהטלפון כאילו נמחקו בטלפון אחר.
    if (snap.metadata.fromCache) {
      onStatus(first ? 'ממתין לחיבור לאינטרנט…' : 'אין חיבור כרגע. השינויים יסונכרנו כשיחזור.', null);
      if (first) return;
    }
    if (!first && !snap.docChanges().length) {
      onStatus('מסונכרן ✓', true);
      return;
    }
    try {
      const local = new Map(localWinesFn().map((w) => [w.id, w]));
      const upsert = [];
      const remove = [];
      if (first) {
        // סנכרון ראשון: משווים את כל הרשימה
        first = false;
        const lastSync = getLastSync();
        const remoteIds = new Set();
        const toPush = [];
        for (const d of snap.docs) {
          const remote = d.data();
          remoteIds.add(d.id);
          const mine = local.get(d.id);
          if (!mine || (remote.updatedAt ?? 0) > (mine.updatedAt ?? 0)) upsert.push(remote);
          else if ((mine.updatedAt ?? 0) > (remote.updatedAt ?? 0)) toPush.push(mine);
        }
        for (const [id, mine] of local) {
          if (remoteIds.has(id)) continue;
          // יין שאין בענן: חדש מהטלפון הזה (נוסף אחרי הסנכרון האחרון) או שנמחק בטלפון אחר
          if ((mine.updatedAt ?? mine.created ?? 0) > lastSync) toPush.push(mine);
          else remove.push(id);
        }
        if (upsert.length || remove.length) await apply({ upsert, remove });
        if (toPush.length) await pushMany(code, toPush);
      } else {
        for (const change of snap.docChanges()) {
          if (change.type === 'removed') {
            if (local.has(change.doc.id)) remove.push(change.doc.id);
            continue;
          }
          const remote = change.doc.data();
          const mine = local.get(change.doc.id);
          if (!mine || (remote.updatedAt ?? 0) > (mine.updatedAt ?? 0)) upsert.push(remote);
        }
        if (upsert.length || remove.length) await apply({ upsert, remove });
      }
      if (!snap.metadata.fromCache) setLastSync(Date.now());
      onStatus('מסונכרן ✓', true);
    } catch (err) {
      first = true; // בפעם הבאה שמגיעים נתונים מהשרת, מנסים שוב השוואה מלאה
      onStatus(`שגיאת סנכרון (${err.code ?? err.name}): ${err.message}`, false);
    }
  }, (err) => {
    onStatus(err.code === 'permission-denied'
      ? 'אין הרשאה למרתף. בדקו את הקוד ואת כללי האבטחה ב-Firebase.'
      : `שגיאת סנכרון (${err.code ?? err.name}): ${err.message}`, false);
  });
}

export function stop() {
  unsubscribe?.();
  unsubscribe = null;
}

// יצירת מרתף משותף חדש מהיינות שבטלפון
export async function create(localWines) {
  const code = newCode();
  await firestore();
  await pushMany(code, localWines);
  setCode(code);
  setLastSync(Date.now());
  return code;
}

// הצטרפות למרתף קיים: היינות שכבר בטלפון מתווספים אליו
export async function join(code) {
  await firestore();
  // תמיד מול השרת: בלי חיבור לא "מצטרפים" למרתף שנראה ריק
  let remote;
  try {
    remote = await fb.getDocsFromServer(winesRef(code));
  } catch (err) {
    if (err.code === 'permission-denied') throw err;
    throw new Error('אין חיבור לשרת. בדקו את האינטרנט ונסו שוב.');
  }
  setCode(code);
  setLastSync(0);
  return remote.size;
}

export function leave() {
  stop();
  setCode(null);
  setLastSync(0);
}
