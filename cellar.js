// לוגיקת המרתף בלי ממשק: דגלים, קבוצות, זיהוי כפולים, דירוג וחיפוש.

// ---------- דגלים ----------

const COUNTRY_CODES = {
  'צרפת': 'FR', 'איטליה': 'IT', 'ספרד': 'ES', 'ישראל': 'IL', 'פורטוגל': 'PT', 'גרמניה': 'DE',
  'אוסטריה': 'AT', 'יוון': 'GR', 'הונגריה': 'HU', 'לבנון': 'LB', 'גאורגיה': 'GE', 'שווייץ': 'CH',
  'ארצות הברית': 'US', 'ארה"ב': 'US', 'ארה״ב': 'US', 'אוסטרליה': 'AU', 'ניו זילנד': 'NZ',
  'ארגנטינה': 'AR', "צ'ילה": 'CL', 'צ׳ילה': 'CL', 'דרום אפריקה': 'ZA', 'קנדה': 'CA', 'אנגליה': 'GB',
  'בריטניה': 'GB', 'סלובניה': 'SI', 'קרואטיה': 'HR', 'רומניה': 'RO', 'מולדובה': 'MD', 'אורוגוואי': 'UY',
  france: 'FR', italy: 'IT', spain: 'ES', israel: 'IL', portugal: 'PT', germany: 'DE', austria: 'AT',
  usa: 'US', 'united states': 'US', australia: 'AU', 'new zealand': 'NZ', argentina: 'AR', chile: 'CL',
  'south africa': 'ZA', greece: 'GR', lebanon: 'LB',
  'франция': 'FR', 'италия': 'IT', 'испания': 'ES', 'израиль': 'IL', 'германия': 'DE',
};

export function countryCode(w) {
  if (/^[A-Z]{2}$/.test(w.country_code ?? '')) return w.country_code;
  return COUNTRY_CODES[(w.country ?? '').trim().toLowerCase()] ?? COUNTRY_CODES[(w.country ?? '').trim()] ?? null;
}

// קוד מדינה של שתי אותיות → אימוג'י דגל
export function flag(w) {
  const code = countryCode(w);
  if (!code) return '';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

// ---------- קבוצות לפי סוג ----------

export const GROUPS = [
  { id: 'red', label: 'אדום', icon: '🍷', types: ['red'] },
  { id: 'white', label: 'לבן', icon: '🥂', types: ['white'] },
  { id: 'rose', label: 'רוזה', icon: '🌸', types: ['rose'] },
  { id: 'bubbles', label: 'שמפניה ומבעבע', icon: '🍾', types: ['champagne', 'sparkling'] },
  { id: 'other', label: 'קינוח ומחוזק', icon: '🍯', types: ['dessert', 'fortified'] },
];

export function groupOf(w) {
  return GROUPS.find((g) => g.types.includes(w.type))?.id ?? 'other';
}

// ---------- נרמול טקסט לחיפוש והשוואה ----------

export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // Château → Chateau
    .replace(/[֑-ׇ]/g, '') // ניקוד וטעמים
    .toLowerCase()
    .replace(/[^a-z0-9א-תЀ-ӿ]+/g, ' ')
    .trim();
}

// ---------- זיהוי כפולים ----------

const STOPWORDS = new Set([
  'champagne', 'chateau', 'domaine', 'maison', 'bodegas', 'bodega', 'cantina', 'tenuta', 'weingut',
  'winery', 'wines', 'wine', 'estate', 'estates', 'vineyards', 'cellars', 'the', 'de', 'du', 'des', 'la',
  'le', 'les', 'di', 'del', 'della', 'y', 'et', 'and', 'of', 'nv', 'יקב', 'יין', 'של',
]);

function nameTokens(w) {
  return new Set(
    normalize(`${w.producer ?? ''} ${w.name ?? ''}`)
      .split(' ')
      .map((t) => ({ '1er': 'premier', 1: 'premier', st: 'saint' }[t] ?? t))
      .filter((t) => t && !STOPWORDS.has(t)),
  );
}

// אותו יין = אותו בציר, אותה קבוצת סוג, ושמות כמעט זהים (יצרן + שם)
export function isSameWine(a, b) {
  if (a.id === b.id) return false;
  if ((a.vintage ?? null) !== (b.vintage ?? null)) return false;
  if (a.type && b.type && groupOf(a) !== groupOf(b)) return false;
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.size || !tb.size) return false;
  const common = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  const smaller = Math.min(ta.size, tb.size);
  // כמעט זהים, או שאחד מוכל בשני (למשל "Armand de Brignac" מול "Champagne Armand de Brignac Brut Gold")
  return common / union >= 0.75 || (smaller >= 2 && common === smaller && common / union >= 0.5);
}

export function findDuplicate(wine, wines) {
  return wines.find((w) => isSameWine(wine, w)) ?? null;
}

// מאחד את `extra` לתוך `keep`: סוכם כמויות, משלים שדות חסרים
export function mergeInto(keep, extra) {
  keep.quantity = (keep.quantity ?? 0) + (extra.quantity ?? 0);
  keep.consumed = [...(keep.consumed ?? []), ...(extra.consumed ?? [])].sort();
  for (const [k, v] of Object.entries(extra)) {
    const empty = keep[k] == null || keep[k] === '' || (Array.isArray(keep[k]) && keep[k].length === 0);
    if (empty && v != null) keep[k] = v;
  }
  if (keep.quantity > 0) keep.reorder = false;
  keep.created = Math.min(keep.created ?? Infinity, extra.created ?? Infinity);
  return keep;
}

// מחזיר את רשימת היינות אחרי איחוד כפולים, ואת מי שנמחק
export function mergeDuplicates(wines) {
  const kept = [];
  const removed = [];
  const changed = new Set();
  const byAge = [...wines].sort((a, b) => (a.created ?? 0) - (b.created ?? 0));
  for (const w of byAge) {
    const dup = kept.find((k) => isSameWine(k, w));
    if (dup) {
      mergeInto(dup, w);
      removed.push(w);
      changed.add(dup);
    } else {
      kept.push(w);
    }
  }
  return { kept, removed, changed: [...changed] };
}

// ---------- דירוג ----------

// ציון אחד לדירוג: הכוכבים שלי (5★=100, 4★=96…) או ציון המבקרים; ממוצע כשיש את שניהם
export function rankScore(w) {
  const mine = w.rating ? 80 + w.rating * 4 : null;
  if (mine && w.score) return (mine + w.score) / 2;
  return mine ?? w.score ?? 0;
}

export function rankCompare(a, b) {
  return rankScore(b) - rankScore(a)
    || ((b.price_high ?? 0) + (b.price_low ?? 0)) - ((a.price_high ?? 0) + (a.price_low ?? 0));
}

// ---------- חיפוש ----------

export function searchText(w) {
  return normalize([
    w.name, w.producer, w.region, w.country, w.appellation, w.appellation_en,
    ...(w.grapes ?? []), ...(w.search_tags ?? []), w.vintage,
  ].join(' '));
}

export function matchesSearch(w, query) {
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const hay = searchText(w);
  return words.every((word) => hay.includes(word));
}

// קבוצת אזור/אפלסיון להצגה כצ'יפ (שאבלי, ריוחה...)
export function appellationOf(w) {
  return (w.appellation || w.region || '').split(/[,،/]/)[0].trim() || null;
}
