import { getAllWines, putWine, deleteWine, clearWines, loadSettings, saveSettings } from './db.js';

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
    return { ai: draw(1280, 0.82).split(',')[1], thumb: draw(480, 0.8) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- ניווט ----------

function showView(name) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  $('#screen-title').textContent = VIEW_TITLES[name];
  window.scrollTo(0, 0);
  if (name === 'shopping') renderShopping();
}

$$('.tabbar button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

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

function wineRow(w) {
  const status = drinkStatus(w);
  const mid = midPrice(w);
  return `
    <li class="wine ${w.quantity > 0 ? '' : 'out'}" data-id="${esc(w.id)}">
      ${w.photo ? `<img src="${w.photo}" alt="">` : `<div class="ph">${TYPE_ICONS[w.type] ?? '🍷'}</div>`}
      <div>
        <h3>${esc(wineTitle(w))}</h3>
        <div class="meta">${esc([w.vintage ?? 'NV', w.region, w.country].filter(Boolean).join(' · '))}</div>
        <div class="tags">
          ${w.type ? `<span class="tag">${TYPE_LABELS[w.type] ?? esc(w.type)}</span>` : ''}
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

function renderCellar() {
  renderStats();
  const q = $('#search').value.trim().toLowerCase();
  const type = $('#filter-type').value;
  const sort = $('#sort').value;
  let list = wines.filter((w) => {
    if (type && w.type !== type) return false;
    if (!q) return true;
    return [w.name, w.producer, w.region, w.country, ...(w.grapes ?? [])]
      .join(' ').toLowerCase().includes(q);
  });
  const sorters = {
    drink: (a, b) => (drinkStatus(a)?.rank ?? 9) - (drinkStatus(b)?.rank ?? 9),
    value: (a, b) => (midPrice(b) ?? 0) - (midPrice(a) ?? 0),
    recent: (a, b) => b.created - a.created,
    name: (a, b) => wineTitle(a).localeCompare(wineTitle(b), 'he'),
  };
  // בקבוקים שנגמרו תמיד בסוף
  list = list.sort((a, b) => (b.quantity > 0) - (a.quantity > 0) || sorters[sort](a, b));
  $('#wine-list').innerHTML = list.map(wineRow).join('');
  $('#empty-cellar').hidden = wines.length > 0;
  updateShopBadge();
}

['#search', '#filter-type', '#sort'].forEach((s) => $(s).addEventListener('input', renderCellar));

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
    const { identifyWine } = await import('./ai.js');
    const images = [photos.front, photos.back].filter(Boolean).map((p) => p.ai);
    const info = await identifyWine(images, settings);
    const wine = newWine({ ...info, photo: photos.front.thumb, ai: true });
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
    const { refreshPrice } = await import('./ai.js');
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
  ['country', 'מדינה'], ['region', 'אזור'], ['grapes', 'זנים (מופרדים בפסיק)', 'list'],
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
      <div class="hero">
        ${wine.photo ? `<img src="${wine.photo}" alt="">` : `<div class="ph" style="font-size:3rem;display:grid;place-items:center">${TYPE_ICONS[wine.type] ?? '🍷'}</div>`}
        <div>
          <h2>${esc(wineTitle(wine))}</h2>
          <div class="meta">${esc([wine.vintage ?? 'NV', wine.region, wine.country].filter(Boolean).join(' · '))}</div>
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
    await putWine(wine);
    if (!wines.includes(wine)) wines.push(wine);
    dlg.close();
    renderCellar();
    if (isNew) {
      showView('cellar');
      toast('נוסף למרתף 🍷');
    }
  };

  $('#btn-delete', form)?.addEventListener('click', async () => {
    if (!confirm('למחוק את היין מהמרתף?')) return;
    await deleteWine(wine.id);
    wines = wines.filter((w) => w.id !== wine.id);
    dlg.close();
    renderCellar();
  });

  $('#btn-prices', form).addEventListener('click', async (e) => {
    const out = $('#prices-out', form);
    out.hidden = false;
    out.classList.add('loading');
    out.textContent = 'מחפש ברשת…';
    e.target.disabled = true;
    try {
      const { findPrices } = await import('./ai.js');
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
    const { askSommelier } = await import('./ai.js');
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
}

$('#settings-form').addEventListener('submit', (e) => {
  e.preventDefault();
  for (const [key, sel] of Object.entries(SETTING_INPUTS)) settings[key] = $(sel).value.trim();
  settings.reorderQty = Math.max(1, Number(settings.reorderQty) || 1);
  settings.webSearch = $('#set-websearch').checked;
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
    const { testConnection } = await import('./ai.js');
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

$('#btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ version: 1, exported: new Date().toISOString(), wines }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cellar-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.wines)) throw new Error();
    if (!confirm(`לייבא ${data.wines.length} יינות? זה יחליף את המרתף הנוכחי.`)) return;
    await clearWines();
    for (const w of data.wines) await putWine(w);
    wines = await getAllWines();
    renderCellar();
    toast('הגיבוי שוחזר ✓');
  } catch {
    toast('קובץ גיבוי לא תקין');
  } finally {
    e.target.value = '';
  }
});

// ---------- הפעלה ----------

async function init() {
  fillSettings();
  wines = await getAllWines();
  renderCellar();
  if (!settings.apiKey) {
    toast('כדי לזהות יינות מתמונה, הוסיפו מפתח Claude API בהגדרות ⚙️', 4500);
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
