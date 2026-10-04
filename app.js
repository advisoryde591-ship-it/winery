import {
  getAllWines, putWine, deleteWine, clearWines, loadSettings, saveSettings, listBackups, saveBackup, restoreBackup,
} from './db.js?v=12';
import {
  GROUPS, groupOf, flag, findDuplicate, mergeInto, mergeDuplicates, rankCompare, matchesSearch, appellationOf,
} from './cellar.js?v=12';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const TYPE_LABELS = {
  red: 'אדום', white: 'לבן', rose: 'רוזה', sparkling: 'מבעבע',
  champagne: 'שמפניה', dessert: 'קינוח', fortified: 'מחוזק',
};
const TYPE_ICONS = {
  red: '🍷', white: '🥂', rose: '🌸', sparkling: '🍾', champagne: '🍾', dessert: '🍯', fortified: '🥃',
};
const CURRENCY_SIGNS = { ILS: '₪', USD: '$', EUR: '€' };
const VIEW_TITLES = {
  cellar: 'המרתף שלי', add: 'הוספת בקבוק', sommelier: 'מה לשתות?', shopping: 'רשימת קניות', settings: 'הגדרות',
};

let wines = [];
let settings = loadSettings();
let chatHistory = [];
const photos = { front: null, back: null };

// ---------- עזרים ----------

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function toast(text, ms = 2600) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, ms);
}

function money(amount, currency = settings.currency) {
  if (amount == null || Number.isNaN(amount)) return '';
  return `${CURRENCY_SIGNS[currency] ?? ''}${Math.round(amount).toLocaleString('he-IL')}`;
}

function midPrice(w) {
  if (w.price_low == null && w.price_high == null) return null;
  return ((w.price_low ?? w.price_high) + (w.price_high ?? w.price_low)) / 2;
}

function wineTitle(w) {
  return [w.producer, w.name].filter(Boolean).join(' · ') || 'יין ללא שם';
}

// מצב חלון השתייה ביחס לשנה הנוכחית
function drinkStatus(w) {
  const y = new Date().getFullYear();
  if (!w.drink_from && !w.drink_until) return null;
  if (w.drink_until && y > w.drink_until) return { label: 'עבר את השיא', cls: 'bad', rank: 0 };
  if (w.drink_until && y >= w.drink_until - 1) return { label: 'לשתות בהקדם', cls: 'warn', rank: 1 };
  if (w.peak && Math.abs(y - w.peak) <= 1) return { label: 'בשיא ✨', cls: 'gold', rank: 2 };
  if (w.drink_from && y < w.drink_from) return { label: `לחכות עד ${w.drink_from}`, cls: '', rank: 4 };
  return { label: 'מוכן לשתייה', cls: 'ok', rank: 3 };
}

// הקטנת תמונה: גרסה ל-AI (base64) ותמונה ממוזערת לשמירה
async function processImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('לא הצלחתי לקרוא את התמונה'));
      i.src = url;
    });
    const draw = (max, quality) => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', quality);
    };
    return { ai: draw(1280, 0.82).split(',')[1], thumb: draw(480, 0.8), full: draw(800, 0.82) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// חיתוך התמונה סביב הבקבוק לפי המלבן שה-AI סימן (עם שוליים קטנים)
async function cropToBottle(base64, box) {
  const valid = box && [box.x, box.y, box.w, box.h].every((v) => typeof v === 'number' && v >= 0 && v <= 1)
    && box.w > 0.05 && box.h > 0.1;
  if (!valid) return null;
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = `data:image/jpeg;base64,${base64}`;
  });
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const pad = 0.04;
  const x0 = Math.max(0, (box.x - pad * box.w) * W);
  const y0 = Math.max(0, (box.y - pad * box.h * 0.5) * H);
  const x1 = Math.min(W, (box.x + box.w * (1 + pad)) * W);
  const y1 = Math.min(H, (box.y + box.h * (1 + pad * 0.5)) * H);
  const sw = x1 - x0;
  const sh = y1 - y0;
  if (sw < 20 || sh < 20) return null;
  const scale = Math.min(1, 640 / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext('2d').drawImage(img, x0, y0, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

// הסרת רקע בתוך הטלפון (בלי שרת). המנוע והמודל נטענים רק בלחיצה הראשונה.
let bgEngineLoaded = false;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
}

async function removePhotoBackground(dataUrl, box = null) {
  const { removeBackground } = await import('./vendor/bg-removal.js');
  // המודל עובד על ריבוע; בקבוק צר נמתח ונחתך, אז מרפדים לריבוע לבן קודם
  const img = await loadImage(dataUrl);
  const side = Math.max(img.naturalWidth, img.naturalHeight);
  const square = document.createElement('canvas');
  square.width = side;
  square.height = side;
  const sctx = square.getContext('2d');
  sctx.fillStyle = '#fff';
  sctx.fillRect(0, 0, side, side);
  const ox = Math.round((side - img.naturalWidth) / 2);
  const oy = Math.round((side - img.naturalHeight) / 2);
  sctx.drawImage(img, ox, oy);
  const input = await new Promise((resolve) => square.toBlob(resolve, 'image/png'));

  const output = await removeBackground(input, { model: 'small', output: { format: 'image/png' } });
  bgEngineLoaded = true;

  // גוזרים את השוליים השקופים סביב הבקבוק
  const cut = await createImageBitmap(output);
  const canvas = document.createElement('canvas');
  canvas.width = cut.width;
  canvas.height = cut.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(cut, 0, 0);
  const pixels = ctx.getImageData(0, 0, cut.width, cut.height);
  const { data } = pixels;
  // אזור החיפוש: סביב הבקבוק שה-AI סימן (אם יש), כדי לא לגרור שאריות רקע מהצדדים
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const area = box
    ? {
      x0: Math.max(0, Math.floor(ox + (box.x - 0.03) * iw)),
      y0: Math.max(0, Math.floor(oy + (box.y - 0.02) * ih)),
      x1: Math.min(cut.width - 1, Math.ceil(ox + (box.x + box.w + 0.03) * iw)),
      y1: Math.min(cut.height - 1, Math.ceil(oy + (box.y + box.h + 0.02) * ih)),
    }
    : { x0: 0, y0: 0, x1: cut.width - 1, y1: cut.height - 1 };
  // שקיפות מלאה מחוץ לאזור ולפיקסלים חצי-שקופים (אובך שנשאר מהרקע)
  for (let y = 0; y < cut.height; y++) {
    for (let x = 0; x < cut.width; x++) {
      const i = (y * cut.width + x) * 4 + 3;
      if (data[i] < 60 || x < area.x0 || x > area.x1 || y < area.y0 || y > area.y1) data[i] = 0;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  let x0 = cut.width; let y0 = cut.height; let x1 = -1; let y1 = -1;
  for (let y = 0; y < cut.height; y++) {
    for (let x = 0; x < cut.width; x++) {
      if (data[(y * cut.width + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('empty result');
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(cut.width - 1, x1 + pad); y1 = Math.min(cut.height - 1, y1 + pad);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

// ---------- ניווט ----------

function showView(name) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  $('#screen-title').textContent = VIEW_TITLES[name];
  window.scrollTo(0, 0);
  if (name === 'shopping') renderShopping();
  if (name === 'settings') {
    renderBackups();
    renderStorageInfo();
  }
}

$$('.tabbar button').forEach((b) => b.addEventListener('click', () => {
  // לחיצה על "מרתף" כשכבר נמצאים בו מחזירה למסך הקבוצות
  if (b.dataset.view === 'cellar' && b.classList.contains('active')) {
    Object.assign(cellarView, { group: null, region: null });
    $('#search').value = '';
    renderCellar();
  }
  showView(b.dataset.view);
}));

// ---------- מרתף ----------

function renderStats() {
  const inStock = wines.filter((w) => w.quantity > 0);
  const bottles = inStock.reduce((s, w) => s + w.quantity, 0);
  const value = inStock.reduce((s, w) => s + (midPrice(w) ?? 0) * w.quantity, 0);
  const ready = inStock.filter((w) => (drinkStatus(w)?.rank ?? 9) <= 2).length;
  $('#stats').innerHTML = `
    <div class="stat"><b>${bottles}</b><span>בקבוקים</span></div>
    <div class="stat"><b>${money(value) || '—'}</b><span>שווי משוער</span></div>
    <div class="stat"><b>${ready}</b><span>לשתות עכשיו</span></div>`;
}

function wineRow(w, rank = null) {
  const status = drinkStatus(w);
  const mid = midPrice(w);
  return `
    <li class="wine ${w.quantity > 0 ? '' : 'out'}" data-id="${esc(w.id)}">
      ${w.photo ? `<img src="${w.photo}" alt="">` : `<div class="ph">${TYPE_ICONS[w.type] ?? '🍷'}</div>`}
      <div>
        <h3>${rank ? `<span class="rank">#${rank}</span> ` : ''}${esc(wineTitle(w))}</h3>
        <div class="meta">${flag(w) ? `<span class="flag">${flag(w)}</span> ` : ''}${esc([w.vintage ?? 'NV', appellationOf(w), w.country].filter(Boolean).join(' · '))}</div>
        <div class="tags">
          ${w.rating ? `<span class="tag gold">${'★'.repeat(w.rating)}</span>` : ''}
          ${w.score ? `<span class="tag">🏅 ${w.score}</span>` : ''}
          ${status ? `<span class="tag ${status.cls}">${status.label}</span>` : ''}
          ${mid ? `<span class="tag price">${money(mid, w.currency)}</span>` : ''}
        </div>
      </div>
      <div class="qty">
        <button data-act="inc" aria-label="הוסף בקבוק">+</button>
        <b>${w.quantity}</b>
        <button data-act="dec" aria-label="שתיתי בקבוק">−</button>
      </div>
    </li>`;
}

// מה מוצג במרתף: מסך הבית (קבוצות), קבוצת סוג, אזור, או תוצאות חיפוש
const cellarView = { group: null, region: null };

function bottles(list) {
  return list.reduce((sum, w) => sum + Math.max(0, w.quantity), 0);
}

function regionChips(list, active) {
  const counts = new Map();
  for (const w of list.filter((x) => x.quantity > 0)) {
    const name = appellationOf(w);
    if (!name) continue;
    const entry = counts.get(name) ?? { n: 0, flag: flag(w) };
    entry.n += w.quantity;
    counts.set(name, entry);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0], 'he'))
    .map(([name, { n, flag: f }]) => `<button type="button" class="chip ${name === active ? 'active' : ''}" data-region="${esc(name)}">${f} ${esc(name)} <small>${n}</small></button>`)
    .join('');
}

const SORTERS = {
  rank: rankCompare,
  drink: (a, b) => (drinkStatus(a)?.rank ?? 9) - (drinkStatus(b)?.rank ?? 9),
  value: (a, b) => (midPrice(b) ?? 0) - (midPrice(a) ?? 0),
  recent: (a, b) => b.created - a.created,
  name: (a, b) => wineTitle(a).localeCompare(wineTitle(b), 'he'),
};

function renderCellar() {
  renderStats();
  renderTransferBanner();
  updateShopBadge();
  $('#empty-cellar').hidden = wines.length > 0;
  const q = $('#search').value.trim();
  const home = !q && !cellarView.group && !cellarView.region;
  $('#cellar-home').hidden = !home || wines.length === 0;
  $('#cellar-list').hidden = home;

  if (home) {
    $('#group-tiles').innerHTML = GROUPS.map((g) => {
      const list = wines.filter((w) => groupOf(w) === g.id);
      const n = bottles(list);
      if (g.id === 'other' && !list.length) return '';
      const value = list.reduce((sum, w) => sum + (midPrice(w) ?? 0) * Math.max(0, w.quantity), 0);
      return `<button type="button" class="group-tile ${n ? '' : 'empty-group'}" data-group="${g.id}">
        <span class="icon">${g.icon}</span><b>${g.label}</b>
        <span>${n} בקבוקים${value ? ` · ${money(value)}` : ''}</span>
      </button>`;
    }).join('');
    const chips = regionChips(wines);
    $('#region-chips').innerHTML = chips;
    $('#regions-head').hidden = !chips;
    return;
  }

  const group = GROUPS.find((g) => g.id === cellarView.group);
  let list = wines.filter((w) => (!group || groupOf(w) === group.id)
    && (!cellarView.region || appellationOf(w) === cellarView.region)
    && matchesSearch(w, q));
  $('#list-title').textContent = group
    ? `${group.icon} ${group.label}${cellarView.region ? ` · ${cellarView.region}` : ''}`
    : cellarView.region ? `📍 ${cellarView.region}` : `🔎 ${list.length} תוצאות`;
  $('#list-chips').innerHTML = group ? regionChips(wines.filter((w) => groupOf(w) === group.id), cellarView.region) : '';

  const sort = $('#sort').value;
  // בקבוקים שנגמרו תמיד בסוף
  list = list.sort((a, b) => (b.quantity > 0) - (a.quantity > 0) || SORTERS[sort](a, b));
  let rank = 0;
  $('#wine-list').innerHTML = list
    .map((w) => wineRow(w, sort === 'rank' && w.quantity > 0 ? ++rank : null))
    .join('');
  $('#empty-list').hidden = list.length > 0;
}

$('#search').addEventListener('input', renderCellar);
$('#sort').addEventListener('input', renderCellar);

$('#group-tiles').addEventListener('click', (e) => {
  const tile = e.target.closest('[data-group]');
  if (!tile) return;
  Object.assign(cellarView, { group: tile.dataset.group, region: null });
  $('#sort').value = 'rank';
  renderCellar();
  window.scrollTo(0, 0);
});

function onRegionChip(e) {
  const chip = e.target.closest('[data-region]');
  if (!chip) return;
  const region = chip.dataset.region;
  cellarView.region = cellarView.region === region && cellarView.group ? null : region;
  renderCellar();
}
$('#region-chips').addEventListener('click', (e) => {
  cellarView.group = null;
  $('#sort').value = 'rank';
  onRegionChip(e);
});
$('#list-chips').addEventListener('click', onRegionChip);

$('#btn-back').addEventListener('click', () => {
  Object.assign(cellarView, { group: null, region: null });
  $('#search').value = '';
  renderCellar();
});

$('#wine-list').addEventListener('click', async (e) => {
  const li = e.target.closest('.wine');
  if (!li) return;
  const wine = wines.find((w) => w.id === li.dataset.id);
  const act = e.target.dataset.act;
  if (act === 'inc') await changeQty(wine, +1);
  else if (act === 'dec') await changeQty(wine, -1);
  else openWine(wine);
});

async function changeQty(wine, delta) {
  if (delta < 0 && wine.quantity === 0) return;
  wine.quantity += delta;
  if (delta < 0) {
    wine.consumed = [...(wine.consumed ?? []), new Date().toISOString()];
  }
  if (wine.quantity === 0) {
    wine.reorder = true;
    wine.reorderQty ??= Number(settings.reorderQty) || 1;
    toast(`🛒 ${wineTitle(wine)} נגמר ונוסף לרשימת הקניות`);
  } else if (delta > 0) {
    wine.reorder = false;
  }
  await putWine(wine);
  renderCellar();
}

// ---------- הוספה וזיהוי ----------

function bindPhoto(slot, key) {
  $(`#photo-${key}`).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      photos[key] = await processImage(file);
      const el = $(`#slot-${key}`);
      el.style.backgroundImage = `url(${photos[key].thumb})`;
      el.classList.add('has-img');
      $('span', el).textContent = 'החלפת תמונה';
      $('#btn-analyze').disabled = !photos.front;
    } catch (err) {
      toast(err.message);
    }
  });
}
bindPhoto('slot-front', 'front');
bindPhoto('slot-back', 'back');

function resetAddForm() {
  for (const key of ['front', 'back']) {
    photos[key] = null;
    const el = $(`#slot-${key}`);
    el.style.backgroundImage = '';
    el.classList.remove('has-img');
    $(`#photo-${key}`).value = '';
  }
  $('#slot-front span').textContent = '📷 תווית קדמית';
  $('#slot-back span').textContent = '➕ תווית אחורית (רשות)';
  $('#btn-analyze').disabled = true;
  $('#analyze-status').hidden = true;
}

$('#btn-analyze').addEventListener('click', async () => {
  const status = $('#analyze-status');
  status.hidden = false;
  status.innerHTML = '<div class="spinner"></div>מזהה את היין… בדרך כלל 10–20 שניות.';
  $('#btn-analyze').disabled = true;
  try {
    const { identifyWine } = await import('./ai.js?v=12');
    const images = [photos.front, photos.back].filter(Boolean).map((p) => p.ai);
    const info = await identifyWine(images, settings);
    const { bottle_box: box, ...details } = info;
    const cropped = await cropToBottle(photos.front.ai, box).catch(() => null);
    const wine = newWine({ ...details, photo: cropped ?? photos.front.thumb, photoFull: photos.front.full, bottleBox: box ?? null, ai: true, enrichedAt: Date.now() });
    resetAddForm();
    if (settings.webSearch) updatePriceInBackground(wine);
    openWine(wine, { isNew: true });
  } catch (err) {
    status.innerHTML = `⚠️ ${esc(err.message)}`;
    $('#btn-analyze').disabled = false;
  }
});

// מחיר עדכני מהרשת: רץ ברקע אחרי הזיהוי ומעדכן את הכרטיס כשהוא מגיע
const pricing = new Set();

async function updatePriceInBackground(wine) {
  pricing.add(wine.id);
  try {
    const { refreshPrice } = await import('./ai.js?v=12');
    Object.assign(wine, await refreshPrice(wine, settings), { currency: settings.currency });
    if (wines.includes(wine)) {
      await putWine(wine);
      renderCellar();
    }
  } catch {
    // נשארים עם ההערכה מהזיהוי
  } finally {
    pricing.delete(wine.id);
    refreshPriceBlock(wine);
  }
}

function priceBlock(wine) {
  const mid = midPrice(wine);
  return `
    ${mid ? `<p class="price" style="font-size:1.3rem;margin:8px 0 2px"><span dir="ltr">${money(wine.price_low, wine.currency)}–${money(wine.price_high, wine.currency)}</span></p>` : ''}
    ${pricing.has(wine.id) ? '<div class="confidence">🔄 בודק מחיר עדכני ברשת…</div>' : ''}
    ${wine.price_note && !pricing.has(wine.id) ? `<div class="confidence">${esc(wine.price_note)}</div>` : ''}`;
}

function refreshPriceBlock(wine) {
  const form = $('#wine-form');
  if (!$('#wine-dialog').open || form.dataset.id !== wine.id) return;
  $('#price-block', form).innerHTML = priceBlock(wine);
  // גם שדות העריכה, כדי ש"שמירה" לא תדרוס את המחיר החדש
  form.elements.price_low.value = wine.price_low ?? '';
  form.elements.price_high.value = wine.price_high ?? '';
}

$('#btn-manual').addEventListener('click', () => {
  openWine(newWine({ photo: photos.front?.thumb ?? null }), { isNew: true, edit: true });
});

function newWine(data) {
  return {
    id: crypto.randomUUID(),
    created: Date.now(),
    quantity: 1,
    currency: settings.currency,
    grapes: [],
    aromas: [],
    food_pairing: [],
    consumed: [],
    ...data,
  };
}

// ---------- כרטיס יין ----------

const FIELDS = [
  ['producer', 'יצרן'], ['name', 'שם היין'], ['vintage', 'בציר', 'number'],
  ['country', 'מדינה'], ['region', 'אזור'], ['appellation', 'אפלסיון (לקבוצות וחיפוש)'],
  ['score', 'ציון מבקרים (80-100)', 'number'], ['grapes', 'זנים (מופרדים בפסיק)', 'list'],
  ['price_low', 'מחיר מינימום', 'number'], ['price_high', 'מחיר מקסימום', 'number'],
  ['drink_from', 'לשתות משנת', 'number'], ['drink_until', 'לשתות עד שנת', 'number'],
  ['peak', 'שנת שיא', 'number'], ['serving_temp', 'טמפרטורת הגשה'],
  ['location', 'מיקום במרתף (מדף/תא)'], ['quantity', 'כמות', 'number'],
];

function profileBar(label, v) {
  if (!v) return '';
  return `<span>${label}</span><div class="bar"><i style="width:${Math.min(5, v) * 20}%"></i></div>`;
}

function openWine(wine, { isNew = false, edit = false } = {}) {
  const dlg = $('#wine-dialog');
  const form = $('#wine-form');
  const status = drinkStatus(wine);
  const dup = isNew ? findDuplicate(wine, wines) : null;
  const typeOptions = Object.entries(TYPE_LABELS)
    .map(([v, l]) => `<option value="${v}" ${wine.type === v ? 'selected' : ''}>${l}</option>`).join('');
  const fieldInputs = FIELDS.map(([key, label, kind]) => {
    const val = kind === 'list' ? (wine[key] ?? []).join(', ') : (wine[key] ?? '');
    return `<label>${label}<input name="${key}" ${kind === 'number' ? 'type="number" inputmode="decimal" step="any"' : ''} value="${esc(val)}"></label>`;
  }).join('');

  form.innerHTML = `
    <div class="dlg-head">
      <button value="cancel" formnovalidate>✕ סגירה</button>
      <strong>${isNew ? 'בקבוק חדש' : 'פרטי יין'}</strong>
      <button value="save">שמירה</button>
    </div>
    <div class="dlg-body">
      ${dup ? `<div class="dup-note">🔁 היין הזה כבר במרתף (${dup.quantity} בקבוקים). בשמירה הוא יתווסף לאותה שורה ולא ייפתח כיין נפרד.</div>` : ''}
      <div class="hero">
        ${wine.photo ? `<div class="hero-photo">
          <img src="${wine.photo}" alt="" id="hero-img">
          <button type="button" class="btn small" id="btn-bg">${wine.photoOriginal ? '↩️ תמונה מקורית' : '✨ רקע נקי'}</button>
          <span class="confidence" id="bg-status" hidden></span>
        </div>` : `<div class="ph" style="font-size:3rem;display:grid;place-items:center">${TYPE_ICONS[wine.type] ?? '🍷'}</div>`}
        <div>
          <h2>${esc(wineTitle(wine))}</h2>
          <div class="meta">${flag(wine) ? `<span class="flag">${flag(wine)}</span> ` : ''}${esc([wine.vintage ?? 'NV', wine.region, wine.country].filter(Boolean).join(' · '))}</div>
          ${wine.score ? `<div class="meta">🏅 ציון מבקרים: ${wine.score}</div>` : ''}
          ${wine.grapes?.length ? `<div class="meta">${esc(wine.grapes.join(', '))}</div>` : ''}
          <div id="price-block">${priceBlock(wine)}</div>
          ${status ? `<div class="tags"><span class="tag ${status.cls}">${status.label}</span></div>` : ''}
        </div>
      </div>

      ${wine.tasting_notes ? `<div class="section-title">טעמים</div><p style="margin:0;line-height:1.6">${esc(wine.tasting_notes)}</p>` : ''}
      ${wine.aromas?.length ? `<div class="tags" style="margin-top:8px">${wine.aromas.map((a) => `<span class="tag">${esc(a)}</span>`).join('')}</div>` : ''}
      ${wine.body || wine.acidity ? `<div class="section-title">פרופיל</div><div class="profile">
        ${profileBar('גוף', wine.body)}${profileBar('מתיקות', wine.sweetness)}${profileBar('חומציות', wine.acidity)}${profileBar('טאנינים', wine.tannins)}
      </div>` : ''}
      ${wine.drink_from ? `<div class="section-title">מתי לשתות</div><p style="margin:0"><span dir="ltr">${wine.drink_from}–${wine.drink_until}</span>${wine.peak ? ` · שיא ב-${wine.peak}` : ''}${wine.serving_temp ? ` · הגשה ב-${esc(wine.serving_temp)}` : ''}</p>` : ''}
      ${wine.decant ? `<p class="meta">🫗 ${esc(wine.decant)}</p>` : ''}
      ${wine.food_pairing?.length ? `<div class="section-title">מתאים ל…</div><div class="tags">${wine.food_pairing.map((f) => `<span class="tag">${esc(f)}</span>`).join('')}</div>` : ''}
      ${wine.ai && wine.confidence && wine.confidence !== 'high' ? `<p class="confidence">🤖 רמת ביטחון בזיהוי: ${wine.confidence === 'low' ? 'נמוכה' : 'בינונית'}${wine.confidence_note ? ` — ${esc(wine.confidence_note)}` : ''}. כדאי לבדוק את הפרטים.</p>` : ''}

      <div class="section-title">הדירוג וההערות שלי</div>
      <div class="form">
        <label>דירוג
          <select name="rating">
            <option value="">—</option>
            ${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${Number(wine.rating) === n ? 'selected' : ''}>${'★'.repeat(n)}</option>`).join('')}
          </select>
        </label>
        <label>הערות<textarea name="notes">${esc(wine.notes)}</textarea></label>
      </div>

      <details ${edit ? 'open' : ''}>
        <summary>✏️ עריכת פרטים</summary>
        <div class="form">
          <label>סוג<select name="type"><option value="">—</option>${typeOptions}</select></label>
          <div class="grid2">${fieldInputs}</div>
          <label>טעמים<textarea name="tasting_notes">${esc(wine.tasting_notes)}</textarea></label>
        </div>
      </details>

      ${wine.consumed?.length ? `<p class="meta">נפתחו ${wine.consumed.length} בקבוקים. אחרון: ${new Date(wine.consumed.at(-1)).toLocaleDateString('he-IL')}</p>` : ''}
      <button type="button" class="btn" id="btn-prices">🔎 איפה לקנות ובכמה</button>
      <div id="prices-out" class="msg ai" style="max-width:100%;margin-top:10px" hidden></div>
      ${isNew ? '' : '<button type="button" class="btn ghost danger" id="btn-delete">🗑️ מחיקה מהמרתף</button>'}
    </div>`;

  form.dataset.id = wine.id;

  form.onsubmit = async (e) => {
    const action = e.submitter?.value;
    if (action !== 'save') return;
    e.preventDefault();
    const fd = new FormData(form);
    for (const [key, , kind] of FIELDS) {
      const raw = String(fd.get(key) ?? '').trim();
      if (kind === 'number') wine[key] = raw === '' ? null : Number(raw);
      else if (kind === 'list') wine[key] = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
      else wine[key] = raw || null;
    }
    wine.type = fd.get('type') || null;
    wine.tasting_notes = String(fd.get('tasting_notes') ?? '').trim() || null;
    wine.notes = String(fd.get('notes') ?? '').trim() || null;
    wine.rating = fd.get('rating') ? Number(fd.get('rating')) : null;
    wine.quantity = Math.max(0, Math.round(wine.quantity ?? 0));
    if (wine.quantity > 0) wine.reorder = false;
    // יין שכבר קיים: מוסיפים לשורה הקיימת במקום ליצור כפול
    const existing = isNew ? findDuplicate(wine, wines) : null;
    if (existing) {
      mergeInto(existing, { ...wine, id: existing.id });
      await putWine(existing);
    } else {
      await putWine(wine);
      if (!wines.includes(wine)) wines.push(wine);
    }
    dlg.close();
    if (isNew) {
      // מציגים את הקבוצה של היין שנוסף
      Object.assign(cellarView, { group: groupOf(existing ?? wine), region: null });
      $('#search').value = '';
      $('#sort').value = 'rank';
    }
    renderCellar();
    if (isNew) {
      showView('cellar');
      toast(existing ? `🔁 היין כבר היה במרתף. עכשיו יש ${existing.quantity} בקבוקים` : 'נוסף למרתף 🍷');
    }
  };

  $('#btn-delete', form)?.addEventListener('click', async () => {
    if (!confirm('למחוק את היין מהמרתף?')) return;
    await deleteWine(wine.id);
    wines = wines.filter((w) => w.id !== wine.id);
    dlg.close();
    renderCellar();
  });

  $('#btn-bg', form)?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const status = $('#bg-status', form);
    if (wine.photoOriginal) {
      wine.photo = wine.photoOriginal;
      delete wine.photoOriginal;
    } else {
      btn.disabled = true;
      status.hidden = false;
      status.textContent = bgEngineLoaded
        ? 'מנקה רקע…'
        : 'מכין את מנוע הסרת הרקע… בפעם הראשונה זה מוריד כ-40MB ולוקח עד דקה.';
      try {
        // התמונה המלאה (לפני החיתוך) נותנת למנוע הקשר ומונעת שאריות רקע בשוליים
        const clean = wine.photoFull
          ? await removePhotoBackground(wine.photoFull, wine.bottleBox)
          : await removePhotoBackground(wine.photo);
        wine.photoOriginal = wine.photo;
        wine.photo = clean;
        status.hidden = true;
      } catch {
        status.textContent = 'לא הצלחתי לנקות את הרקע. נסו שוב עם חיבור טוב לאינטרנט.';
        btn.disabled = false;
        return;
      }
      btn.disabled = false;
    }
    $('#hero-img', form).src = wine.photo;
    btn.textContent = wine.photoOriginal ? '↩️ תמונה מקורית' : '✨ רקע נקי';
    if (wines.includes(wine)) {
      await putWine(wine);
      renderCellar();
    }
  });

  $('#btn-prices', form).addEventListener('click', async (e) => {
    const out = $('#prices-out', form);
    out.hidden = false;
    out.classList.add('loading');
    out.textContent = 'מחפש ברשת…';
    e.target.disabled = true;
    try {
      const { findPrices } = await import('./ai.js?v=12');
      out.innerHTML = linkify(await findPrices(wine, settings));
    } catch (err) {
      out.textContent = `⚠️ ${err.message}`;
    } finally {
      out.classList.remove('loading');
      e.target.disabled = false;
    }
  });

  dlg.showModal();
  dlg.scrollTop = 0;
}

function linkify(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">קישור</a>');
}

// ---------- סומלייה ----------

function addMsg(role, html) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.innerHTML = html;
  $('#chat').append(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'end' });
  return el;
}

async function ask(question) {
  if (!question.trim()) return;
  addMsg('user', esc(question));
  chatHistory.push({ role: 'user', content: question });
  const pending = addMsg('ai loading', 'חושב… 🍷');
  try {
    const { askSommelier } = await import('./ai.js?v=12');
    const answer = await askSommelier(chatHistory, wines, settings);
    chatHistory.push({ role: 'assistant', content: answer });
    pending.classList.remove('loading');
    pending.innerHTML = linkify(answer);
  } catch (err) {
    chatHistory.pop();
    pending.classList.remove('loading');
    pending.textContent = `⚠️ ${err.message}`;
  }
}

$('#chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#chat-input');
  ask(input.value);
  input.value = '';
});
$('#quick-prompts').addEventListener('click', (e) => {
  if (e.target.dataset.q) ask(e.target.dataset.q);
});

// ---------- רשימת קניות והזמנה ----------

const shoppingItems = () => wines.filter((w) => w.quantity === 0 && w.reorder);

function updateShopBadge() {
  const n = shoppingItems().length;
  const badge = $('#shop-badge');
  badge.hidden = n === 0;
  badge.textContent = n;
}

function renderShopping() {
  const items = shoppingItems();
  $('#shopping-list').innerHTML = items.map((w) => `
    <li class="wine" data-id="${esc(w.id)}" style="cursor:default">
      ${w.photo ? `<img src="${w.photo}" alt="">` : `<div class="ph">${TYPE_ICONS[w.type] ?? '🍷'}</div>`}
      <div>
        <h3>${esc(wineTitle(w))}</h3>
        <div class="meta">${esc(w.vintage ?? 'NV')}${midPrice(w) ? ` · ~${money(midPrice(w), w.currency)}` : ''}</div>
        <button class="btn small ghost" data-act="remove" style="margin-top:6px">הסרה מהרשימה</button>
      </div>
      <div class="qty">
        <span class="meta">כמות</span>
        <input class="shop-qty" type="number" min="1" inputmode="numeric" value="${w.reorderQty ?? settings.reorderQty}" data-act="qty">
      </div>
    </li>`).join('');
  $('#empty-shopping').hidden = items.length > 0;
  $('#order-actions').hidden = items.length === 0;
  updateShopBadge();
}

$('#shopping-list').addEventListener('change', async (e) => {
  if (e.target.dataset.act !== 'qty') return;
  const wine = wines.find((w) => w.id === e.target.closest('.wine').dataset.id);
  wine.reorderQty = Math.max(1, Number(e.target.value) || 1);
  await putWine(wine);
});
$('#shopping-list').addEventListener('click', async (e) => {
  if (e.target.dataset.act !== 'remove') return;
  const wine = wines.find((w) => w.id === e.target.closest('.wine').dataset.id);
  wine.reorder = false;
  await putWine(wine);
  renderShopping();
});

function orderText() {
  const lines = shoppingItems().map((w) =>
    `• ${w.reorderQty ?? settings.reorderQty} × ${[w.producer, w.name].filter(Boolean).join(' ')}${w.vintage ? ` ${w.vintage}` : ''}`);
  return [
    `שלום${settings.storeName ? ` ${settings.storeName}` : ''},`,
    'אשמח להזמין:',
    ...lines,
    '',
    'אם בציר מסוים לא זמין - בציר קרוב זה בסדר, רק לעדכן אותי.',
    'תודה!',
    settings.myName,
  ].filter((l) => l !== undefined).join('\n').trim();
}

$('#btn-order-wa').addEventListener('click', () => {
  const phone = settings.storePhone.replace(/\D/g, '');
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(orderText())}`;
  if (!phone) toast('לא הוגדר מספר וואטסאפ לחנות - בחרו איש קשר בוואטסאפ');
  window.open(url, '_blank');
});
$('#btn-order-mail').addEventListener('click', () => {
  const subject = encodeURIComponent('הזמנת יין');
  window.location.href = `mailto:${settings.storeEmail}?subject=${subject}&body=${encodeURIComponent(orderText())}`;
});
$('#btn-order-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(orderText());
    toast('ההזמנה הועתקה 📋');
  } catch {
    toast('לא הצלחתי להעתיק');
  }
});

// ---------- הגדרות וגיבוי ----------

const SETTING_INPUTS = {
  apiKey: '#set-apikey', currency: '#set-currency', storeName: '#set-store-name',
  storePhone: '#set-store-phone', storeEmail: '#set-store-email', myName: '#set-my-name', reorderQty: '#set-reorder-qty',
};

function fillSettings() {
  for (const [key, sel] of Object.entries(SETTING_INPUTS)) $(sel).value = settings[key] ?? '';
  $('#set-websearch').checked = settings.webSearch;
  $('#set-fast').checked = settings.fastMode;
}

$('#settings-form').addEventListener('submit', (e) => {
  e.preventDefault();
  for (const [key, sel] of Object.entries(SETTING_INPUTS)) settings[key] = $(sel).value.trim();
  settings.reorderQty = Math.max(1, Number(settings.reorderQty) || 1);
  settings.webSearch = $('#set-websearch').checked;
  settings.fastMode = $('#set-fast').checked;
  saveSettings(settings);
  const saved = $('#settings-saved');
  saved.hidden = false;
  setTimeout(() => { saved.hidden = true; }, 1800);
  renderCellar();
});

$('#btn-test').addEventListener('click', async (e) => {
  const out = $('#test-result');
  // בודקים את מה שכתוב בשדה כרגע, גם אם עוד לא לחצו "שמירה"
  const key = $('#set-apikey').value.trim();
  out.hidden = false;
  out.className = 'test-result';
  if (!key) {
    out.classList.add('bad');
    out.textContent = 'השדה של המפתח ריק. הדביקו את המפתח ונסו שוב.';
    return;
  }
  out.textContent = 'בודק…';
  e.target.disabled = true;
  try {
    const { testConnection } = await import('./ai.js?v=12');
    await testConnection({ ...settings, apiKey: key });
    settings.apiKey = key;
    saveSettings(settings);
    out.classList.add('ok');
    out.textContent = '✅ החיבור תקין. המפתח נשמר ואפשר לצלם בקבוקים.';
  } catch (err) {
    out.classList.add('bad');
    out.textContent = `❌ ${err.message}`;
  } finally {
    e.target.disabled = false;
  }
});

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// קובץ עם כל המרתף. באייפון נפתח חלון השיתוף ("שמירה בקבצים"), ובמקומות אחרים הורדה רגילה.
async function exportCellar() {
  const name = `cellar-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([JSON.stringify({ version: 1, exported: new Date().toISOString(), wines })], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'המרתף שלי' });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// מוסיף את היינות מהקובץ למרתף (לא מוחק את מה שכבר יש), ומאחד כפולים
async function importCellar(file) {
  const data = JSON.parse(await file.text());
  if (!Array.isArray(data.wines)) throw new Error('bad file');
  await saveBackup(wines, 'לפני ייבוא');
  for (const w of data.wines) await putWine(w);
  wines = await getAllWines();
  await mergeExistingDuplicates();
  Object.assign(cellarView, { group: null, region: null });
  renderCellar();
  return data.wines.length;
}

$('#btn-export').addEventListener('click', exportCellar);
$('#btn-transfer-export').addEventListener('click', exportCellar);

for (const input of ['#import-file', '#transfer-import']) {
  $(input).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const n = await importCellar(file);
      showView('cellar');
      toast(`✓ הועברו ${n} יינות למרתף`, 4000);
    } catch {
      toast('הקובץ לא נקרא. ודאו שבחרתם את קובץ ה-cellar שנשמר.');
    } finally {
      e.target.value = '';
    }
  });
}

// הסבר העברה: ב-Safari ובאפליקציה שבמסך הבית המרתף נשמר בנפרד
function renderTransferBanner() {
  const standalone = isStandalone();
  $('#transfer-export').hidden = standalone || wines.length === 0;
  $('#transfer-import').closest('.transfer').hidden = !standalone || wines.length > 0;
}

// ---------- הפעלה ----------

// איחוד יינות כפולים שכבר שמורים (נוספו פעמיים כשורות נפרדות)
async function mergeExistingDuplicates() {
  const { kept, removed, changed } = mergeDuplicates(wines.map((w) => ({ ...w })));
  if (!removed.length) return;
  // גיבוי מלא לפני כל שינוי אוטומטי, כדי שאפשר יהיה לשחזר מההגדרות
  await saveBackup(wines, 'לפני איחוד כפולים');
  for (const w of changed) await putWine(w);
  for (const w of removed) await deleteWine(w.id);
  wines = kept;
  toast(`🔁 איחדתי ${removed.length} ${removed.length === 1 ? 'יין כפול' : 'יינות כפולים'}`, 4000);
}

// השלמת דגל, אזור וציון ליינות ישנים, ברקע ואחד אחד
async function enrichOldWines() {
  if (!settings.apiKey) return;
  const { enrichWine } = await import('./ai.js?v=12');
  for (const wine of wines.filter((w) => !w.enrichedAt)) {
    try {
      const { country_he, region_he, ...extra } = await enrichWine(wine, settings);
      for (const [k, v] of Object.entries(extra)) {
        if (v != null && (wine[k] == null || wine[k] === '')) wine[k] = v;
      }
      // מדינה ואזור שנשמרו בשפה אחרת (למשל רוסית) מוחלפים בעברית
      const notHebrew = (t) => !t || !/[\u0590-\u05FF]/.test(t);
      if (country_he && notHebrew(wine.country)) wine.country = country_he;
      if (region_he && notHebrew(wine.region)) wine.region = region_he;
      wine.enrichedAt = Date.now();
      await putWine(wine);
      renderCellar();
    } catch {
      return; // ננסה שוב בפתיחה הבאה
    }
  }
}

// עותק גיבוי אוטומטי פעם ביום (נשמרים 5 אחרונים)
async function dailyBackup() {
  const [last] = await listBackups();
  if (!last || Date.now() - last.id > 24 * 3600 * 1000 || last.count !== wines.length) {
    await saveBackup(wines, 'גיבוי יומי');
  }
}

// מה שמור בדיוק בהקשר הזה (Safari או אפליקציה ממסך הבית שומרים מידע בנפרד באייפון)
async function renderStorageInfo() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const stored = await getAllWines().catch(() => null);
  const backups = await listBackups().catch(() => []);
  const persisted = await navigator.storage?.persisted?.().catch(() => null);
  const rows = [
    ['נפתח מתוך', standalone ? '📱 אייקון במסך הבית' : '🧭 דפדפן Safari'],
    ['יינות שמורים כאן', stored ? `${stored.length} יינות · ${stored.reduce((n, w) => n + Math.max(0, w.quantity ?? 0), 0)} בקבוקים` : 'לא ניתן לקרוא'],
    ['גיבויים אוטומטיים', backups.length ? `${backups.length} (הגדול: ${Math.max(...backups.map((b) => b.count))} יינות)` : 'אין'],
    ['הגנה ממחיקה אוטומטית', persisted ? '✓ פעילה' : 'לא פעילה'],
  ];
  $('#storage-info').innerHTML = rows.map(([k, v]) => `<div class="backup-row"><span>${k}</span><b>${v}</b></div>`).join('')
    + (standalone ? '' : '<p class="hint small">⚠️ ב-Safari המידע נשמר בנפרד מהאפליקציה שבמסך הבית, ו-iOS עלול למחוק אותו אחרי 7 ימים בלי שימוש. עדיף לעבוד רק מהאייקון שבמסך הבית.</p>');
}

async function renderBackups() {
  const backups = await listBackups().catch(() => []);
  $('#backup-list').innerHTML = backups.length
    ? backups.map((b) => `<div class="backup-row">
        <span>${new Date(b.id).toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${b.count} יינות · ${esc(b.reason)}</span>
        <button type="button" class="btn small" data-restore="${b.id}">שחזור</button>
      </div>`).join('')
    : '<p class="hint small">עוד אין גיבויים אוטומטיים.</p>';
}

$('#backup-list').addEventListener('click', async (e) => {
  const id = Number(e.target.dataset.restore);
  if (!id) return;
  if (!confirm('לשחזר את המרתף לגיבוי הזה? המצב הנוכחי יישמר קודם כגיבוי נוסף.')) return;
  await saveBackup(wines, 'לפני שחזור');
  wines = await restoreBackup(id);
  Object.assign(cellarView, { group: null, region: null });
  renderCellar();
  renderBackups();
  toast(`✓ שוחזרו ${wines.length} יינות`);
});

async function init() {
  fillSettings();
  wines = await getAllWines();
  await dailyBackup().catch(() => {});
  await mergeExistingDuplicates();
  renderCellar();
  window.cellarReady = true;
  // מבקשים מהמערכת לא למחוק את המידע כשחסר מקום
  navigator.storage?.persist?.().catch(() => {});
  renderBackups();
  enrichOldWines();
  if (!settings.apiKey) {
    toast('כדי לזהות יינות מתמונה, הוסיפו מפתח Claude API בהגדרות ⚙️', 4500);
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init().catch((err) => {
  console.error(err);
  $('#boot-error').hidden = false;
});
