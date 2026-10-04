// חיבור ל-Claude: זיהוי יין מתמונה, סומלייה אישית וחיפוש מחירים.
// הקריאות יוצאות ישירות מהמכשיר עם מפתח ה-API של המשתמש (נשמר מקומית בלבד).
import Anthropic from 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm';
import { isEn } from './i18n.js?v=21';

// שפת התשובות של ה-AI לפי שפת הממשק
const LANG = isEn ? 'English' : 'Hebrew';
const say = (he, en) => (isEn ? en : he);

const MODEL = 'claude-opus-5-5';
// מצב מהיר לזיהוי תוויות: Sonnet בלי שלב חשיבה
const FAST_MODEL = 'claude-sonnet-5-5';
const WEB_SEARCH_TOOL = { type: 'web_search_20260209', name: 'web_search', max_uses: 4 };

// איפה המשתמש קונה יין (מההגדרות) - כדי שהחיפושים ימצאו חנויות ומחירים שם
const COUNTRIES = {
  IL: ['ישראל', 'Israel'], CY: ['קפריסין', 'Cyprus'], GR: ['יוון', 'Greece'], GB: ['בריטניה', 'United Kingdom'],
  US: ['ארצות הברית', 'United States'], FR: ['צרפת', 'France'], IT: ['איטליה', 'Italy'], DE: ['גרמניה', 'Germany'],
};

function shopPlace(settings) {
  const code = COUNTRIES[settings.shopCountry] ? settings.shopCountry : 'IL';
  const [he, en] = COUNTRIES[code];
  const city = (settings.shopCity || '').trim();
  return { code, he, en, city, label: city ? `${city}, ${en}` : en };
}

// החנויות שהמשתמש הגדיר: החיפוש בודק אותן קודם
function myShopsText(settings) {
  const shops = (settings.shops ?? []).filter((x) => x.name);
  if (!shops.length) return '';
  return shops.map((x) => `- ${x.name}${x.website ? ` (${x.website})` : ''}`).join('\n');
}

function webSearch(settings, maxUses = 4) {
  const place = shopPlace(settings);
  return {
    ...WEB_SEARCH_TOOL,
    max_uses: maxUses,
    user_location: { type: 'approximate', country: place.code, ...(place.city ? { city: place.city } : {}) },
  };
}


function client(settings) {
  if (!settings.apiKey) {
    throw new Error(say('חסר מפתח Claude API. הוסיפו אותו במסך ההגדרות.', 'Missing Claude API key. Add it in Settings.'));
  }
  return new Anthropic({ apiKey: settings.apiKey.trim(), dangerouslyAllowBrowser: true });
}

// שליחה עם fallback בצד השרת, והמשך אוטומטי כשחיפוש ברשת עוצר באמצע (pause_turn).
// הודעת שגיאה ברורה בעברית לפי סוג התקלה מול ה-API
function friendlyError(err) {
  const detail = err?.error?.error?.message || err?.message || '';
  if (err instanceof Anthropic.AuthenticationError) {
    return new Error(say('המפתח לא תקין (401). ודאו שהעתקתם את כל המפתח, שהוא מתחיל ב-sk-ant-api, ושהוא לא נמחק בקונסול.', 'Invalid key (401). Make sure you copied the whole key, that it starts with sk-ant-api, and that it was not deleted in the console.'));
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new Error(`${say('למפתח אין הרשאה', 'The key has no permission')} (403): ${detail}`);
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new Error(`${say('המודל לא זמין בחשבון הזה', 'The model is not available on this account')} (404): ${detail}`);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new Error(say('יותר מדי בקשות ברגע זה (429). חכו דקה ונסו שוב.', 'Too many requests right now (429). Wait a minute and try again.'));
  }
  if (err instanceof Anthropic.BadRequestError && /credit balance/i.test(detail)) {
    return new Error(say('אין קרדיט בחשבון ה-API. טוענים קרדיט ב-console.anthropic.com ← Billing.', 'No credit on the API account. Add credit at console.anthropic.com → Billing.'));
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new Error(say('אין חיבור לשרת של Claude. בדקו את האינטרנט ונסו שוב.', "Can't reach Claude. Check your internet and try again."));
  }
  if (err instanceof Anthropic.APIError) {
    return new Error(`${say('שגיאה מה-API', 'API error')} (${err.status ?? '?'}): ${detail}`);
  }
  return err;
}

async function create(anthropic, params) {
  try {
    return await anthropic.beta.messages.create({
      ...params,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  } catch (err) {
    // חשבונות שעוד לא תומכים ב-fallback מקבלים 400 על הפרמטר - שולחים שוב בלעדיו
    if (err instanceof Anthropic.BadRequestError && /fallback|beta/i.test(err?.error?.error?.message ?? '')) {
      try {
        return await anthropic.messages.create(params);
      } catch (retryErr) {
        throw friendlyError(retryErr);
      }
    }
    throw friendlyError(err);
  }
}

// בקשה קטנה שבודקת שהמפתח, הקרדיט והמודל תקינים
export async function testConnection(settings) {
  const response = await create(client(settings), {
    model: MODEL,
    max_tokens: 200,
    messages: [{ role: 'user', content: 'Reply with one word: OK' }],
    output_config: { effort: 'low' },
  });
  return response.model;
}

async function run(settings, { system, messages, tools, effort = 'medium', fast = false }) {
  const anthropic = client(settings);
  const convo = [...messages];
  for (let i = 0; i < 4; i++) {
    const response = await create(anthropic, {
      model: fast ? FAST_MODEL : MODEL,
      max_tokens: 16000,
      system,
      messages: convo,
      ...(tools ? { tools } : {}),
      ...(fast ? { thinking: { type: 'between_tools' } } : {}),
      output_config: { effort },
    });
    if (response.stop_reason === 'refusal') {
      throw new Error(say('ה-AI סירב לבקשה הזו. נסו לנסח אחרת.', 'The AI declined this request. Try wording it differently.'));
    }
    if (response.stop_reason === 'pause_turn') {
      convo.push({ role: 'assistant', content: response.content });
      continue;
    }
    return response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
  }
  throw new Error(say('החיפוש לקח יותר מדי זמן. נסו שוב.', 'The search took too long. Try again.'));
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    throw new Error(say('לא הצלחתי לקרוא את תשובת ה-AI. נסו לצלם שוב.', "Couldn't read the AI's answer. Try photographing again."));
  }
}

const IDENTIFY_SYSTEM = () => `You are an expert sommelier and wine appraiser for a private wine collector. You get a photo of a wine or champagne bottle and return an accurate info card.

LANGUAGE: every free-text value (country, region, grapes, price_note, tasting_notes, aromas, food_pairing, decant, confidence_note) MUST be written in ${LANG}. Never answer in Russian or any other language. Only "name" and "producer" stay exactly as printed on the label (original language and script).

- Identify the wine from the label: producer, wine/cuvée name, vintage, region, grapes.
- If something is unreadable, infer it from your knowledge and say so in confidence_note. Never invent a vintage you cannot see; use null.
- Estimate the current retail price of one bottle (low-high) from your knowledge.
- Drinking window: first and last ideal year, and peak year.
- Keep it short: tasting_notes 2-3 sentences, price_note up to 10 words, lists up to 5 items.
- country_code: ISO 3166-1 alpha-2 code of the wine's country (e.g. "FR").
- appellation: the short appellation / sub-region name in ${LANG} as people search for it (e.g. ${isEn ? '"Chablis", "Rioja", "Upper Galilee", "Champagne"' : '"שאבלי", "ריוחה", "גליל עליון", "שמפאן"'}); appellation_en: the same in its original Latin spelling (e.g. "Chablis").
- search_tags: up to 8 terms in Hebrew AND in the original/English spelling that someone might search for this wine by (appellation, region, sub-region, classification such as Premier Cru / Grand Cru, main grape, style).
- score: typical critic score for this wine and vintage on the 100-point scale (integer 80-100), from your knowledge of critic consensus; null if you have no basis.
- bottle_box: the tightest rectangle containing the whole bottle (capsule to base) in the FIRST image, as fractions (0-1) of image width/height, x,y = top-left corner. null if no whole bottle is visible. Always include it.

Return only one \`\`\`json block:
{
  "name": "...",
  "producer": "...",
  "type": "red|white|rose|sparkling|champagne|dessert|fortified",
  "vintage": 2019 or null,
  "country": "${isEn ? 'France' : 'צרפת'}",
  "region": "${isEn ? 'Champagne' : 'שמפאן'}",
  "grapes": ["${isEn ? 'Chardonnay' : 'שרדונה'}"],
  "alcohol": 12.5 or null,
  "price_low": number,
  "price_high": number,
  "price_note": "${isEn ? 'Estimate from shop prices' : 'הערכה לפי מחירי חנויות'}",
  "tasting_notes": "...",
  "aromas": ["..."],
  "body": 1-5,
  "sweetness": 1-5,
  "acidity": 1-5,
  "tannins": 1-5,
  "food_pairing": ["..."],
  "drink_from": year,
  "drink_until": year,
  "peak": year,
  "serving_temp": "8-10°C",
  "decant": "..." or null,
  "confidence": "high|medium|low",
  "confidence_note": "...",
  "country_code": "FR",
  "appellation": "${isEn ? 'Chablis' : 'שאבלי'}",
  "appellation_en": "Chablis",
  "search_tags": ["שאבלי", "Chablis", "בורגונדי", "Burgundy", "פרמייה קרו", "Premier Cru"],
  "score": 91,
  "bottle_box": {"x": 0.31, "y": 0.04, "w": 0.38, "h": 0.93}
}`;

const CURRENCY_CODES = { ILS: 'Israeli shekels (ILS)', USD: 'US dollars (USD)', EUR: 'euros (EUR)' };
const HEBREW_FIELDS = ['country', 'region', 'price_note', 'tasting_notes', 'confidence_note', 'decant'];

// תשובה שנכתבה בשפה אחרת (למשל רוסית) במקום בשפת הממשק
function wrongLanguage(info) {
  const text = HEBREW_FIELDS.map((k) => info[k] ?? '').join(' ')
    + [info.aromas, info.food_pairing, info.grapes].flat().filter(Boolean).join(' ');
  if (/[\u0400-\u04FF]/.test(text)) return true;
  const hebrew = (text.match(/[\u0590-\u05FF]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return isEn ? hebrew > latin : latin > hebrew;
}

export async function identifyWine(images, settings) {
  const year = new Date().getFullYear();
  const content = [
    ...images.map((data) => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data },
    })),
    {
      type: 'text',
      text: `Identify this bottle. Current year: ${year}. Prices in ${CURRENCY_CODES[settings.currency] || settings.currency}. Write all descriptive text in ${LANG}.`,
    },
  ];
  // זיהוי בלי חיפוש ברשת; המחיר העדכני מגיע אחר כך ב-refreshPrice
  const messages = [{ role: 'user', content }];
  const ask = () => run(settings, { system: IDENTIFY_SYSTEM(), messages, effort: 'low', fast: settings.fastMode });
  const text = await ask();
  const info = extractJson(text);
  if (!wrongLanguage(info)) return info;
  // נכתב בשפה אחרת: מבקשים שוב, הפעם עם תזכורת מפורשת
  messages.push(
    { role: 'assistant', content: text },
    { role: 'user', content: `The descriptive fields are not in ${LANG}. Return the same JSON with every free-text value translated to ${LANG}. Keep name and producer as on the label.` },
  );
  return extractJson(await ask());
}

const priceSystem = (place, shops) => `You are a wine appraiser. Search the web for the current retail shelf price of one bottle of the requested wine. The collector buys in ${place.label}: prefer shops in ${place.en} (or that deliver there), then the rest of Europe.${shops ? `
The collector's own shops - check these first (search their websites) and name them in price_note when you find the wine there:
${shops}` : ''}
Return only one \`\`\`json block: {"price_low": number, "price_high": number, "price_note": "<up to 10 words IN ${LANG} naming the shops>"}
price_note must be in ${LANG}, never Russian.`;

export async function refreshPrice(wine, settings) {
  const label = [wine.producer, wine.name, wine.vintage ?? 'NV'].filter(Boolean).join(' ');
  const text = await run(settings, {
    system: priceSystem(shopPlace(settings), myShopsText(settings)),
    messages: [{ role: 'user', content: `${label}. Prices in ${CURRENCY_CODES[settings.currency] || settings.currency}.` }],
    tools: [webSearch(settings, 3)],
    effort: 'low',
  });
  const { price_low, price_high, price_note } = extractJson(text);
  if (typeof price_low !== 'number' && typeof price_high !== 'number') {
    throw new Error(say('לא נמצא מחיר ברשת', 'No price found online'));
  }
  const inLang = isEn ? !/[\u0590-\u05FF\u0400-\u04FF]/.test(price_note ?? '') : /[\u0590-\u05FF]/.test(price_note ?? '') && !/[\u0400-\u04FF]/.test(price_note);
  const note = price_note && inLang ? price_note : say('מחיר עדכני מחנויות ברשת', 'Current price from online shops');
  return { price_low, price_high, price_note: note };
}

const ENRICH_SYSTEM = () => `You are a wine expert. For the wine described, return only one \`\`\`json block:
{"country_code": "FR", "country_he": "<country in ${LANG}>", "region_he": "<region in ${LANG}>", "appellation": "<short appellation in ${LANG}, e.g. ${isEn ? 'Chablis' : 'שאבלי'}>", "appellation_en": "<same, original spelling>", "search_tags": ["<up to 8 terms in Hebrew AND original spelling: appellation, region, classification, main grape, style>"], "score": <typical critic score 80-100 for this wine and vintage, or null>}
Text values must be in ${LANG}, never Russian.`;

// השלמת שדות חדשים (דגל, אזור לחיפוש, ציון) ליינות שנשמרו לפני שהשדות האלה נוספו
export async function enrichWine(wine, settings) {
  const desc = {
    producer: wine.producer, name: wine.name, vintage: wine.vintage, type: wine.type,
    region: wine.region, country: wine.country, grapes: wine.grapes,
  };
  const text = await run(settings, {
    system: ENRICH_SYSTEM(),
    messages: [{ role: 'user', content: JSON.stringify(desc) }],
    effort: 'low',
    fast: true,
  });
  const { country_code, country_he, region_he, appellation, appellation_en, search_tags, score } = extractJson(text);
  return { country_code, country_he, region_he, appellation, appellation_en, search_tags, score };
}

function inventoryForPrompt(wines) {
  return wines
    .filter((w) => w.quantity > 0)
    .map((w) => ({
      id: w.id,
      name: w.name,
      producer: w.producer,
      type: w.type,
      vintage: w.vintage,
      region: [w.region, w.country].filter(Boolean).join(', '),
      grapes: w.grapes,
      qty: w.quantity,
      price: w.price_high ? `${w.price_low}-${w.price_high} ${w.currency}` : null,
      drink: w.drink_from ? `${w.drink_from}-${w.drink_until} (peak ${w.peak ?? '?'})` : null,
      notes: w.tasting_notes,
      appellation: w.appellation_en || w.appellation || null,
      critic_score: w.score ?? null,
      my_rating: w.rating || null,
    }));
}

export async function askSommelier(history, wines, settings) {
  const today = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  const place = shopPlace(settings);
  const shops = myShopsText(settings);
  const system = `You are the cellar owner's personal sommelier. Always answer in ${LANG} only (never Russian). Be warm and brief (up to 8 lines unless an analysis is requested).
Recommend only bottles that are in the inventory below; give their full name and vintage, and one sentence on why. If nothing in the inventory fits, say so and suggest what to buy.
Respect the drinking window: prefer bottles at their peak or about to pass it. Today is ${today}.
The owner buys wine in ${place.label}.${shops ? `
The owner's own shops (when buying comes up, start with these and check their websites):
${shops}` : ''}
You have a web search tool. When asked about shops, prices, availability or anything current, search the web and answer with real names, phone numbers and links. Never say you have no internet access.
No heavy Markdown (no tables). Short dash lists are fine.

Current inventory (JSON):
${JSON.stringify(inventoryForPrompt(wines))}`;
  return run(settings, { system, messages: history, tools: [webSearch(settings, 5)] });
}

export async function findPrices(wine, settings) {
  const label = [wine.producer, wine.name, wine.vintage].filter(Boolean).join(' ');
  const place = shopPlace(settings);
  const shops = myShopsText(settings);
  const system = `You are a wine shopping assistant. Always answer in ${LANG} only (never Russian).
Search the web for where the requested wine can be bought today in ${place.label} (local shops or ones that deliver there).
${shops ? `Check the owner's own shops first (search their websites), and only then others:
${shops}
` : ''}Return a short list: shop name, price, link. At the end, if the wine is not available, suggest 2 similar alternatives at a similar price. No tables.`;
  return run(settings, {
    system,
    messages: [{ role: 'user', content: `Where to buy: ${label}. Preferred currency: ${settings.currency}.` }],
    tools: [webSearch(settings)],
  });
}
