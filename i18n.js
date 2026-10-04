// שפת הממשק: עברית (ברירת מחדל) או אנגלית. המפתחות הם הטקסט בעברית, והערכים התרגום לאנגלית.
// השפה נקראת מההגדרות כבר בטעינה, כדי שכל טקסט שנבנה בזמן הטעינה ייצא בשפה הנכונה.

function readLang() {
  try {
    return JSON.parse(localStorage.getItem('cellar.settings') || '{}').language === 'en' ? 'en' : 'he';
  } catch {
    return 'he';
  }
}

export const lang = readLang();
export const isEn = lang === 'en';
export const locale = isEn ? 'en-GB' : 'he-IL';

const EN = {
  // סוגי יין וקבוצות
  'אדום': 'Red',
  'לבן': 'White',
  'רוזה': 'Rosé',
  'מבעבע': 'Sparkling',
  'שמפניה': 'Champagne',
  'קינוח': 'Dessert',
  'מחוזק': 'Fortified',
  'שמפניה ומבעבע': 'Champagne & sparkling',
  'קינוח ומחוזק': 'Dessert & fortified',

  // כותרות מסכים וסרגל תחתון
  'המרתף שלי': 'My Cellar',
  'הוספת בקבוק': 'Add a bottle',
  'מה לשתות?': 'What to drink?',
  'רשימת קניות': 'Shopping list',
  'הגדרות': 'Settings',
  'מרתף': 'Cellar',
  'הוספה': 'Add',
  'מה לשתות': 'Drink',
  'קניות': 'Shopping',

  // סנכרון
  'השינוי יסונכרן כשיחזור החיבור': 'The change will sync when the connection is back',
  'המחיקה תסונכרן כשיחזור החיבור': 'The deletion will sync when the connection is back',
  'שגיאת סנכרון:': 'Sync error:',
  'שגיאת סנכרון (': 'Sync error (',
  'מתחבר…': 'Connecting…',
  'מסונכרן ✓': 'Synced ✓',
  'ממתין לחיבור לאינטרנט…': 'Waiting for an internet connection…',
  'אין חיבור כרגע. השינויים יסונכרנו כשיחזור.': 'No connection right now. Changes will sync when it is back.',
  'אין הרשאה למרתף. בדקו את הקוד ואת כללי האבטחה ב-Firebase.': 'No access to this cellar. Check the code and the Firebase security rules.',
  'אין חיבור לשרת. בדקו את האינטרנט ונסו שוב.': 'Cannot reach the server. Check your internet and try again.',

  // מטבע
  'שערי המרה: $1 = ₪': 'Exchange rates: $1 = ₪',
  '(משוער, לא עודכן מהרשת)': '(approximate, not updated online)',

  // יין ומצב שתייה
  'יין ללא שם': 'Unnamed wine',
  'עבר את השיא': 'Past its peak',
  'לשתות בהקדם': 'Drink soon',
  'בשיא ✨': 'At its peak ✨',
  'לחכות עד': 'Wait until',
  'מוכן לשתייה': 'Ready to drink',
  'לא הצלחתי לקרוא את התמונה': "Couldn't read the photo",

  // מרתף
  'בקבוקים': 'bottles',
  'שווי משוער': 'Estimated value',
  'לשתות עכשיו': 'Drink now',
  'הוסף בקבוק': 'Add a bottle',
  'שתיתי בקבוק': 'I drank a bottle',
  'תוצאות': 'results',
  'נגמר ונוסף לרשימת הקניות': 'is finished and was added to the shopping list',
  'חיפוש: יין, יצרן, אזור (שאבלי, ריוחה…)': 'Search: wine, producer, region (Chablis, Rioja…)',
  'לפי אזור': 'By region',
  '→ כל המרתף': '← Whole cellar',
  'מיון': 'Sort',
  '🏆 לפי דירוג': '🏆 By ranking',
  'לפי מתי לשתות': 'By when to drink',
  'לפי שווי': 'By value',
  'נוספו לאחרונה': 'Recently added',
  'לפי שם': 'By name',
  'אין כאן יינות.': 'No wines here.',
  'המרתף ריק. לחצו על "הוספה" וצלמו את הבקבוק הראשון 🍷': 'The cellar is empty. Tap "Add" and photograph your first bottle 🍷',

  // הוספה וזיהוי
  'החלפת תמונה': 'Change photo',
  '📷 תווית קדמית': '📷 Front label',
  '➕ תווית אחורית (רשות)': '➕ Back label (optional)',
  'מזהה את היין… בדרך כלל 10–20 שניות.': 'Identifying the wine… usually 10–20 seconds.',
  '🔄 בודק מחיר עדכני ברשת…': '🔄 Checking the current price online…',
  'צלמו את התווית הקדמית של הבקבוק. אפשר להוסיף גם צילום של התווית האחורית לזיהוי מדויק יותר.': 'Photograph the front label. You can add the back label too for a more accurate match.',
  'רוצים לבחור תמונה מהגלריה? לחצו לחיצה ארוכה ← "ספריית תמונות".': 'Want a photo from your gallery? Long-press → "Photo Library".',
  '🔍 זהה את היין': '🔍 Identify the wine',
  'הוספה ידנית בלי AI': 'Add manually without AI',

  // שדות כרטיס יין
  'יצרן': 'Producer',
  'שם היין': 'Wine name',
  'בציר': 'Vintage',
  'מדינה': 'Country',
  'אזור': 'Region',
  'אפלסיון (לקבוצות וחיפוש)': 'Appellation (for groups and search)',
  'ציון מבקרים (80-100)': 'Critic score (80-100)',
  'זנים (מופרדים בפסיק)': 'Grapes (comma separated)',
  'מחיר מינימום': 'Min price',
  'מחיר מקסימום': 'Max price',
  'לשתות משנת': 'Drink from',
  'לשתות עד שנת': 'Drink until',
  'שנת שיא': 'Peak year',
  'טמפרטורת הגשה': 'Serving temperature',
  'מיקום במרתף (מדף/תא)': 'Location in cellar (shelf/slot)',
  'כמות': 'Quantity',
  '✕ סגירה': '✕ Close',
  'שמירה': 'Save',
  'הדירוג וההערות שלי': 'My rating and notes',
  'דירוג': 'Rating',
  'הערות': 'Notes',
  '✏️ עריכת פרטים': '✏️ Edit details',
  'סוג': 'Type',
  'טעמים': 'Tasting notes',
  '🔎 איפה לקנות ובכמה': '🔎 Where to buy and for how much',
  'בקבוק חדש': 'New bottle',
  'פרטי יין': 'Wine details',
  '🔁 היין הזה כבר במרתף (': '🔁 This wine is already in the cellar (',
  'בקבוקים). בשמירה הוא יתווסף לאותה שורה ולא ייפתח כיין נפרד.': 'bottles). Saving adds it to the same entry instead of a separate wine.',
  '↩️ תמונה מקורית': '↩️ Original photo',
  '✨ רקע נקי': '✨ Clean background',
  '🏅 ציון מבקרים:': '🏅 Critic score:',
  'פרופיל': 'Profile',
  'גוף': 'Body',
  'מתיקות': 'Sweetness',
  'חומציות': 'Acidity',
  'טאנינים': 'Tannins',
  'מתי לשתות': 'When to drink',
  '· שיא ב-': '· peak in ',
  '· הגשה ב-': '· serve at ',
  'מתאים ל…': 'Pairs with…',
  '🤖 רמת ביטחון בזיהוי:': '🤖 Identification confidence:',
  '. כדאי לבדוק את הפרטים.': '. Worth checking the details.',
  'נמוכה': 'low',
  'בינונית': 'medium',
  'נפתחו': 'Opened',
  'בקבוקים. אחרון:': 'bottles. Last:',
  '🗑️ מחיקה מהמרתף': '🗑️ Delete from cellar',
  '🔁 היין כבר היה במרתף. עכשיו יש': '🔁 This wine was already in the cellar. Bottles now:',
  'נוסף למרתף 🍷': 'Added to the cellar 🍷',
  'למחוק את היין מהמרתף?': 'Delete this wine from the cellar?',
  'מנקה רקע…': 'Cleaning the background…',
  'מכין את מנוע הסרת הרקע… בפעם הראשונה זה מוריד כ-40MB ולוקח עד דקה.': 'Preparing the background remover… the first time it downloads about 40MB and takes up to a minute.',
  'לא הצלחתי לנקות את הרקע. נסו שוב עם חיבור טוב לאינטרנט.': "Couldn't clean the background. Try again with a good internet connection.",
  'מחפש ברשת…': 'Searching online…',
  'קישור': 'link',

  // סומלייה
  'חושב… 🍷': 'Thinking… 🍷',
  'מה לפתוח הערב?': 'What to open tonight?',
  'ליד סטייק': 'With steak',
  'ליד דגים': 'With fish',
  'לחגיגה 🥂': 'To celebrate 🥂',
  'מה דחוף לשתות?': 'What should I drink soon?',
  'ניתוח המרתף': 'Cellar analysis',
  'שלח': 'Send',
  'שאלו את הסומלייה…': 'Ask the sommelier…',
  'מה כדאי לפתוח הערב? תעדיף בקבוקים שבחלון השתייה שלהם או שעומדים לעבור את השיא.': 'What should I open tonight? Prefer bottles in their drinking window or about to pass their peak.',
  'אני מכין סטייק על האש. איזה יין מהמרתף הכי מתאים?': "I'm grilling steak. Which wine from my cellar fits best?",
  'ארוחת דגים ופירות ים - מה להגיש?': 'Fish and seafood dinner - what should I serve?',
  'יש לנו חגיגה. איזו שמפניה או מבעבע לפתוח?': "We're celebrating. Which champagne or sparkling wine should I open?",
  'אילו בקבוקים צריך לשתות בשנה הקרובה לפני שיעברו את השיא?': 'Which bottles should I drink in the next year before they pass their peak?',
  'תן לי ניתוח של המרתף: איזון בין סוגים, מה חסר ומה כדאי לקנות.': 'Analyse my cellar: balance between types, what is missing and what to buy.',

  // קניות וחנויות
  'הסרה מהרשימה': 'Remove from list',
  'כשבקבוק נגמר (הכמות יורדת ל-0) הוא נכנס לכאן אוטומטית. בוחרים כמה להזמין ושולחים הזמנה לחנות בוואטסאפ או במייל בלחיצה אחת.': 'When a bottle runs out (quantity drops to 0) it lands here automatically. Choose how many to order and send the order to a shop by WhatsApp or email in one tap.',
  'אין כרגע מה להזמין 👌': 'Nothing to order right now 👌',
  '🏪 החנויות שלי': '🏪 My shops',
  'החנות שלי': 'My shop',
  'שם החנות': 'Shop name',
  'למשל: Oinou Yinesthai': 'e.g. Oinou Yinesthai',
  'וואטסאפ (עם קידומת מדינה)': 'WhatsApp (with country code)',
  'מייל (רשות)': 'Email (optional)',
  'אתר (רשות, לבדיקת מחירים)': 'Website (optional, for price checks)',
  'ביטול': 'Cancel',
  '✏️ עריכה': '✏️ Edit',
  '🗑️ מחיקה': '🗑️ Delete',
  '🌐 אתר': '🌐 Website',
  '➕ הוספת חנות': '➕ Add a shop',
  'ההזמנה תישלח ל:': 'The order will be sent to:',
  'הוסיפו חנות כדי לשלוח אליה הזמנה.': 'Add a shop to send an order to.',
  'למחוק את': 'Delete',
  'מהחנויות שלי?': 'from my shops?',
  'כתבו את שם החנות': 'Enter the shop name',
  'נשמרה': 'saved',
  'לחנות שנבחרה אין מספר וואטסאפ - בחרו איש קשר בוואטסאפ': 'The selected shop has no WhatsApp number - pick a contact in WhatsApp',
  'ההזמנה הועתקה 📋': 'Order copied 📋',
  'לא הצלחתי להעתיק': "Couldn't copy",
  '📲 שליחת הזמנה בוואטסאפ': '📲 Send order on WhatsApp',
  '✉️ שליחת הזמנה במייל': '✉️ Send order by email',
  '📋 העתקת ההזמנה': '📋 Copy order',

  // הגדרות
  'חיבור ל-AI': 'AI connection',
  'מפתח Claude API': 'Claude API key',
  'המפתח נשמר רק במכשיר שלכם. מקבלים מפתח ב-console.anthropic.com.': 'The key is stored only on your device. Get one at console.anthropic.com.',
  'חיפוש מחירים עדכניים ברשת אחרי הזיהוי': 'Look up current prices online after identifying',
  'זיהוי מהיר (מומלץ). כבוי = זיהוי איטי יותר אבל מדויק יותר לתוויות קשות': 'Fast identification (recommended). Off = slower but more accurate on hard labels',
  'מטבע': 'Currency',
  '₪ שקל': '₪ Shekel',
  '$ דולר': '$ Dollar',
  '€ יורו': '€ Euro',
  'הזמנות': 'Orders',
  'איפה אתה קונה יין': 'Where you buy wine',
  '🇮🇱 ישראל': '🇮🇱 Israel',
  '🇨🇾 קפריסין': '🇨🇾 Cyprus',
  '🇬🇷 יוון': '🇬🇷 Greece',
  '🇬🇧 בריטניה': '🇬🇧 United Kingdom',
  '🇺🇸 ארצות הברית': '🇺🇸 United States',
  '🇫🇷 צרפת': '🇫🇷 France',
  '🇮🇹 איטליה': '🇮🇹 Italy',
  '🇩🇪 גרמניה': '🇩🇪 Germany',
  'עיר (רשות)': 'City (optional)',
  'למשל: Limassol': 'e.g. Limassol',
  'את החנויות שמזמינים מהן מוסיפים במסך 🛒 קניות.': 'Add the shops you order from on the 🛒 Shopping screen.',
  'שם המזמין': 'Your name (for orders)',
  'כמות ברירת מחדל להזמנה חוזרת': 'Default reorder quantity',
  'נשמר ✓': 'Saved ✓',
  '🔌 בדיקת חיבור ל-AI': '🔌 Test AI connection',
  'השדה של המפתח ריק. הדביקו את המפתח ונסו שוב.': 'The key field is empty. Paste your key and try again.',
  'בודק…': 'Checking…',
  '✅ החיבור תקין. המפתח נשמר ואפשר לצלם בקבוקים.': '✅ Connected. The key is saved and you can photograph bottles.',
  'שפה': 'Language',
  '🌐 שפה / Language': '🌐 Language / שפה',

  // מרתף משותף
  '👫 מרתף משותף': '👫 Shared cellar',
  'המרתף המשותף עוד לא הופעל. צריך לחבר פרויקט Firebase (פעם אחת).': 'The shared cellar is not set up yet. A Firebase project needs to be connected (once).',
  'המרתף הזה משותף. כל מי שמחובר עם אותו קוד רואה את אותם יינות, וכל שינוי מתעדכן אצל כולם.': 'This cellar is shared. Everyone connected with the same code sees the same wines, and every change updates for all.',
  '🔄 סנכרון מחדש': '🔄 Sync again',
  '📤 שליחת הקוד לאשתי / לבן משפחה': '📤 Send the code to a family member',
  'ניתוק מהמרתף המשותף': 'Leave the shared cellar',
  'לנתק את הטלפון הזה מהמרתף המשותף? היינות יישארו בטלפון, אבל שינויים כבר לא יסונכרנו.': 'Disconnect this phone from the shared cellar? The wines stay on the phone, but changes will no longer sync.',
  'מרתף משותף מאפשר לכמה טלפונים לראות ולעדכן את אותו מרתף.': 'A shared cellar lets several phones see and update the same cellar.',
  '➕ יצירת מרתף משותף מהיינות שלי': '➕ Create a shared cellar from my wines',
  'קיבלת קוד מרתף? הדביקו אותו כאן:': 'Got a cellar code? Paste it here:',
  '🔗 הצטרפות למרתף': '🔗 Join cellar',
  'מעלה את המרתף…': 'Uploading the cellar…',
  '✓ נוצר מרתף משותף. שלחו את הקוד לבני הבית': '✓ Shared cellar created. Send the code to your family',
  'לא הצלחתי ליצור:': "Couldn't create it:",
  'הקוד קצר מדי. העתיקו את כל הקוד שקיבלתם.': 'The code is too short. Copy the whole code you received.',
  'המרתף עם הקוד הזה ריק. להצטרף בכל זאת?': 'The cellar with this code is empty. Join anyway?',
  'לפני הצטרפות למרתף משותף': 'Before joining a shared cellar',
  '✓ הצטרפת למרתף המשותף (': '✓ You joined the shared cellar (',
  'יינות)': 'wines)',
  'הקוד לא נכון או שאין הרשאה.': 'Wrong code or no access.',
  'לא הצלחתי להתחבר:': "Couldn't connect:",
  'הצטרפות למרתף היין שלנו 🍷': 'Join our wine cellar 🍷',
  '1. פתחי ב-Safari:': '1. Open in Safari:',
  '2. שיתוף ←': '2. Share →',
  'הוסף למסך הבית': 'Add to Home Screen',
  ', ופתחי את האפליקציה מהאייקון': ', then open the app from the icon',
  '3. הגדרות ← מרתף משותף ← הדביקי את הקוד:': '3. Settings → Shared cellar → paste the code:',
  'ההודעה עם הקוד הועתקה 📋': 'Message with the code copied 📋',
  'הקוד:': 'Code:',

  // גיבוי, העברה ואחסון
  'לפני ייבוא': 'Before import',
  '✓ הועברו': '✓ Transferred',
  'יינות למרתף': 'wines to the cellar',
  'הקובץ לא נקרא. ודאו שבחרתם את קובץ ה-cellar שנשמר.': "Couldn't read the file. Make sure you picked the saved cellar file.",
  'לפני איחוד כפולים': 'Before merging duplicates',
  '🔁 איחדתי': '🔁 Merged',
  'יין כפול': 'duplicate wine',
  'יינות כפולים': 'duplicate wines',
  'גיבוי יומי': 'Daily backup',
  'לפני שחזור': 'Before restore',
  '✓ שוחזרו': '✓ Restored',
  'יינות': 'wines',
  'יינות ·': 'wines ·',
  'שחזור': 'Restore',
  'עוד אין גיבויים אוטומטיים.': 'No automatic backups yet.',
  'לשחזר את המרתף לגיבוי הזה? המצב הנוכחי יישמר קודם כגיבוי נוסף.': 'Restore the cellar to this backup? The current state is saved as another backup first.',
  'נפתח מתוך': 'Opened from',
  '📱 אייקון במסך הבית': '📱 Home Screen icon',
  '🧭 דפדפן Safari': '🧭 Safari browser',
  'יינות שמורים כאן': 'Wines stored here',
  'לא ניתן לקרוא': "Can't read",
  'גיבויים אוטומטיים': 'Automatic backups',
  '(הגדול:': '(largest:',
  'אין': 'None',
  'הגנה ממחיקה אוטומטית': 'Protection from automatic deletion',
  '✓ פעילה': '✓ On',
  'לא פעילה': 'Off',
  '⚠️ ב-Safari המידע נשמר בנפרד מהאפליקציה שבמסך הבית, ו-iOS עלול למחוק אותו אחרי 7 ימים בלי שימוש. עדיף לעבוד רק מהאייקון שבמסך הבית.': '⚠️ In Safari, data is stored separately from the Home Screen app, and iOS may delete it after 7 days without use. Use only the Home Screen icon.',
  'כדי לזהות יינות מתמונה, הוסיפו מפתח Claude API בהגדרות ⚙️': 'To identify wines from photos, add a Claude API key in Settings ⚙️',
  'האפליקציה לא נטענה עד הסוף.': "The app didn't finish loading.",
  'היינות שלך שמורים בטלפון ולא נמחקו. זה קורה לפעמים מיד אחרי עדכון.': 'Your wines are stored on the phone and were not deleted. This sometimes happens right after an update.',
  'טעינה מחדש': 'Reload',
  '📱 להעביר את המרתף לאפליקציה שבמסך הבית?': '📱 Move the cellar to the Home Screen app?',
  'באייפון, Safari והאפליקציה שבמסך הבית שומרים מידע בנפרד. מעבירים פעם אחת:': 'On iPhone, Safari and the Home Screen app keep separate data. Transfer once:',
  'לוחצים כאן על "שמירת קובץ העברה" ←': 'Tap "Save transfer file" here →',
  'שמירה בקבצים': 'Save to Files',
  'פותחים את האפליקציה מהאייקון ← לוחצים "ייבוא קובץ העברה" ובוחרים את הקובץ.': 'Open the app from its icon → tap "Import transfer file" and pick the file.',
  '💾 שמירת קובץ העברה': '💾 Save transfer file',
  '📥 היינות שלך שמורים ב-Safari?': '📥 Are your wines saved in Safari?',
  'פתחו את האתר ב-Safari ולחצו שם "שמירת קובץ העברה". אחר כך חזרו לכאן ובחרו את הקובץ:': 'Open the site in Safari and tap "Save transfer file" there. Then come back here and pick the file:',
  '📂 ייבוא קובץ העברה': '📂 Import transfer file',
  'מצב האחסון בטלפון': 'Storage on this phone',
  'גיבוי': 'Backup',
  '⬇️ ייצוא גיבוי / קובץ העברה': '⬇️ Export backup / transfer file',
  '⬆️ ייבוא גיבוי / קובץ העברה': '⬆️ Import backup / transfer file',
  'גיבויים אוטומטיים בטלפון': 'Automatic backups on this phone',
  'האפליקציה שומרת עותק של המרתף פעם ביום ולפני כל שינוי אוטומטי. אם משהו נעלם, אפשר לשחזר מכאן.': 'The app saves a copy of the cellar once a day and before any automatic change. If something disappears, restore it from here.',
};

// מחזיר את הטקסט בשפת הממשק, ושומר על רווחים בתחילת/סוף המחרוזת
export function t(text) {
  if (!isEn) return text;
  const key = text.trim();
  const en = EN[key];
  if (en == null) return text;
  const lead = text.match(/^\s*/)[0];
  const trail = text.match(/\s*$/)[0];
  return lead + en + trail;
}

// תרגום הטקסטים הקבועים בדף (index.html) בטעינה
export function translatePage() {
  document.documentElement.lang = lang;
  document.documentElement.dir = isEn ? 'ltr' : 'rtl';
  if (!isEn) return;
  document.title = t(document.title);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (/[א-ת]/.test(node.textContent)) node.textContent = t(node.textContent);
  }
  for (const el of document.querySelectorAll('[placeholder],[aria-label],[title],[data-q]')) {
    for (const attr of ['placeholder', 'aria-label', 'title', 'data-q']) {
      const v = el.getAttribute(attr);
      if (v && /[א-ת]/.test(v)) el.setAttribute(attr, t(v));
    }
  }
}
