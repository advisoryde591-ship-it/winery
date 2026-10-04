// חיבור ל-Claude: זיהוי יין מתמונה, סומלייה אישית וחיפוש מחירים.
// הקריאות יוצאות ישירות מהמכשיר עם מפתח ה-API של המשתמש (נשמר מקומית בלבד).
import Anthropic from 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm';

const MODEL = 'claude-opus-5-5';
const WEB_SEARCH_TOOL = { type: 'web_search_20260209', name: 'web_search', max_uses: 4 };

const CURRENCY_NAMES = { ILS: 'שקלים (ILS)', USD: 'דולרים (USD)', EUR: 'יורו (EUR)' };

function client(settings) {
  if (!settings.apiKey) {
    throw new Error('חסר מפתח Claude API. הוסיפו אותו במסך ההגדרות.');
  }
  return new Anthropic({ apiKey: settings.apiKey.trim(), dangerouslyAllowBrowser: true });
}

// שליחה עם fallback בצד השרת, והמשך אוטומטי כשחיפוש ברשת עוצר באמצע (pause_turn).
// הודעת שגיאה ברורה בעברית לפי סוג התקלה מול ה-API
function friendlyError(err) {
  const detail = err?.error?.error?.message || err?.message || '';
  if (err instanceof Anthropic.AuthenticationError) {
    return new Error('המפתח לא תקין (401). ודאו שהעתקתם את כל המפתח, שהוא מתחיל ב-sk-ant-api, ושהוא לא נמחק בקונסול.');
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new Error(`למפתח אין הרשאה (403): ${detail}`);
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new Error(`המודל לא זמין בחשבון הזה (404): ${detail}`);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new Error('יותר מדי בקשות ברגע זה (429). חכו דקה ונסו שוב.');
  }
  if (err instanceof Anthropic.BadRequestError && /credit balance/i.test(detail)) {
    return new Error('אין קרדיט בחשבון ה-API. טוענים קרדיט ב-console.anthropic.com ← Billing.');
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new Error('אין חיבור לשרת של Claude. בדקו את האינטרנט ונסו שוב.');
  }
  if (err instanceof Anthropic.APIError) {
    return new Error(`שגיאה מה-API (${err.status ?? '?'}): ${detail}`);
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
    messages: [{ role: 'user', content: 'ענה במילה אחת: תקין' }],
    output_config: { effort: 'low' },
  });
  return response.model;
}

async function run(settings, { system, messages, tools, effort = 'medium' }) {
  const anthropic = client(settings);
  const convo = [...messages];
  for (let i = 0; i < 4; i++) {
    const response = await create(anthropic, {
      model: MODEL,
      max_tokens: 16000,
      system,
      messages: convo,
      ...(tools ? { tools } : {}),
      output_config: { effort },
    });
    if (response.stop_reason === 'refusal') {
      throw new Error('ה-AI סירב לבקשה הזו. נסו לנסח אחרת.');
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
  throw new Error('החיפוש לקח יותר מדי זמן. נסו שוב.');
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    throw new Error('לא הצלחתי לקרוא את תשובת ה-AI. נסו לצלם שוב.');
  }
}

const IDENTIFY_SYSTEM = `אתה סומלייה מומחה ושמאי יין. מקבלים צילום של בקבוק יין או שמפניה ומחזירים כרטיס מידע מדויק.
- זהה את היין מהתווית: יצרן, שם היין/הקוּבֶה, בציר, אזור, זנים.
- אם משהו לא קריא על התווית - הסק מהידע שלך וציין זאת ב-confidence_note. אל תמציא בציר שלא רואים; אם לא ניתן לדעת, החזר null.
- הערך שווי שוק נוכחי לבקבוק בודד (טווח נמוך-גבוה) לפי הידע שלך, כפי שקונים אותו בחנויות יין.
- חלון שתייה: שנה מוקדמת ושנה מאוחרת לשתייה אידיאלית, ושנת שיא.
- כל הטקסטים החופשיים בעברית. שמות יצרן/יין באותיות המקור.
החזר אך ורק בלוק \`\`\`json אחד בפורמט:
{
  "name": "שם היין",
  "producer": "יצרן",
  "type": "red|white|rose|sparkling|champagne|dessert|fortified",
  "vintage": 2019 או null (NV),
  "country": "מדינה בעברית",
  "region": "אזור / אפלסיון",
  "grapes": ["זן"],
  "alcohol": 13.5 או null,
  "price_low": מספר,
  "price_high": מספר,
  "price_note": "על מה מבוסס המחיר, משפט אחד",
  "tasting_notes": "2-3 משפטים על הטעם",
  "aromas": ["ארומה"],
  "body": 1-5,
  "sweetness": 1-5,
  "acidity": 1-5,
  "tannins": 1-5,
  "food_pairing": ["מנה"],
  "drink_from": שנה,
  "drink_until": שנה,
  "peak": שנה,
  "serving_temp": "למשל 16-18°C",
  "decant": "המלצה על דקנטציה או null",
  "confidence": "high|medium|low",
  "confidence_note": "מה היה קשה לזהות, אם בכלל",
  "bottle_box": {"x": 0.31, "y": 0.04, "w": 0.38, "h": 0.93}
}
bottle_box: המלבן ההדוק ביותר שמכיל את הבקבוק כולו (מהפקק עד התחתית) בתמונה הראשונה, כשברים מרוחב/גובה התמונה (0 עד 1), x,y = הפינה השמאלית-עליונה. אם אין בקבוק שלם בתמונה, null.
`;

export async function identifyWine(images, settings) {
  const year = new Date().getFullYear();
  const content = [
    ...images.map((data) => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data },
    })),
    {
      type: 'text',
      text: `זהה את הבקבוק. השנה הנוכחית ${year}. תן מחירים ב${CURRENCY_NAMES[settings.currency] || settings.currency}.`,
    },
  ];
  // זיהוי מהיר בלי חיפוש ברשת; המחיר העדכני מגיע אחר כך ב-refreshPrice
  const text = await run(settings, {
    system: IDENTIFY_SYSTEM,
    messages: [{ role: 'user', content }],
    effort: 'low',
  });
  return extractJson(text);
}

const PRICE_SYSTEM = `אתה שמאי יין. חפש ברשת את מחיר המדף הנוכחי של בקבוק בודד מהיין המבוקש, בחנויות יין (עדיפות לחנויות בישראל).
החזר אך ורק בלוק \`\`\`json אחד: {"price_low": מספר, "price_high": מספר, "price_note": "משפט קצר בעברית: מאילו חנויות המחיר"}`;

export async function refreshPrice(wine, settings) {
  const label = [wine.producer, wine.name, wine.vintage ?? 'NV'].filter(Boolean).join(' ');
  const text = await run(settings, {
    system: PRICE_SYSTEM,
    messages: [{ role: 'user', content: `${label}. מחירים ב${CURRENCY_NAMES[settings.currency] || settings.currency}.` }],
    tools: [{ ...WEB_SEARCH_TOOL, max_uses: 3 }],
    effort: 'low',
  });
  const { price_low, price_high, price_note } = extractJson(text);
  if (typeof price_low !== 'number' && typeof price_high !== 'number') {
    throw new Error('לא נמצא מחיר ברשת');
  }
  return { price_low, price_high, price_note };
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
      drink: w.drink_from ? `${w.drink_from}-${w.drink_until} (שיא ${w.peak ?? '?'})` : null,
      notes: w.tasting_notes,
      my_rating: w.rating || null,
    }));
}

export async function askSommelier(history, wines, settings) {
  const today = new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
  const system = `אתה הסומלייה האישי של בעל המרתף. ענה בעברית, בחום ובקצרה (עד 8 שורות אלא אם התבקש ניתוח).
המלץ רק על בקבוקים שקיימים במלאי למטה, ציין את שמם המלא ובציר, והסבר במשפט למה. אם אין במלאי משהו מתאים, אמור זאת והצע מה לקנות.
התחשב בחלון השתייה: עדיפות לבקבוקים בשיא או כאלה שעומדים לעבור אותו. היום ${today}.
אל תשתמש ב-Markdown כבד (בלי טבלאות). רשימות קצרות עם מקפים זה בסדר.

המלאי הנוכחי (JSON):
${JSON.stringify(inventoryForPrompt(wines))}`;
  return run(settings, { system, messages: history });
}

export async function findPrices(wine, settings) {
  const label = [wine.producer, wine.name, wine.vintage].filter(Boolean).join(' ');
  const system = `אתה עוזר קניות ליין. חפש ברשת היכן אפשר לקנות את היין המבוקש היום, עדיפות לחנויות שמשלוחות לישראל.
החזר בעברית רשימה קצרה: שם החנות, מחיר, קישור. בסוף - אם היין לא זמין, הצע 2 חלופות דומות במחיר דומה. בלי טבלאות.`;
  return run(settings, {
    system,
    messages: [{ role: 'user', content: `איפה לקנות: ${label}. מטבע מועדף: ${settings.currency}.` }],
    tools: [WEB_SEARCH_TOOL],
  });
}
