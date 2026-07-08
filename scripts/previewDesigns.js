'use strict';
/**
 * Одноразовый скрипт: рисует 3 варианта дизайна в отдельных вкладках
 * реальной Google Таблицы (на тестовых, но правдоподобных цифрах), чтобы
 * выбрать один вживую — без изменений в продовой sheets.js/данных.
 *
 * Запуск: node scripts/previewDesigns.js
 * Удалить вкладки-превью после выбора: node scripts/previewDesigns.js clean
 */
require('dotenv').config();
const { google } = require('googleapis');

function getAuth() {
  const fs = require('fs');
  const path = require('path');
  let key;
  const keyPath = path.join(__dirname, '..', 'google-key.json');
  if (fs.existsSync(keyPath)) {
    key = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_B64) {
    key = JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_B64, 'base64').toString('utf-8'));
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } else {
    throw new Error('Нет google-key.json / GOOGLE_SERVICE_ACCOUNT_B64');
  }
  return new google.auth.GoogleAuth({ credentials: key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
}

function hex(h) {
  const n = parseInt(h.replace('#', ''), 16);
  return { red: ((n >> 16) & 0xff) / 255, green: ((n >> 8) & 0xff) / 255, blue: (n & 0xff) / 255 };
}
const WHITE = hex('#FFFFFF');

// ─── 3 варианта темы ────────────────────────────────────────────
const THEMES = {
  A: {
    label: '🎨 Дизайн A · Нейтральный + синий акцент',
    icon: '💧',
    T: {
      pageBg: hex('#F5F5F7'), surface: hex('#FFFFFF'), surfaceB: hex('#FAFAFB'),
      text1: hex('#1D1D1F'), text2: hex('#6E6E73'), text3: hex('#AEAEB2'),
      brand: hex('#0A84FF'), border: hex('#E5E5EA'), borderM: hex('#D1D1D6'),
      groupBg: hex('#F0F0F2'), groupFg: hex('#9A9AA0'),
      titleBg: hex('#F5F5F7'), titleFg: hex('#1D1D1F'),
      zoneGreenBg: hex('#E3F4E9'), zoneGreenFg: hex('#1CA161'),
      zoneYellowBg: hex('#FFF6E0'), zoneYellowFg: hex('#E0A100'),
      zoneRedBg: hex('#FDE7E7'), zoneRedFg: hex('#E62E2E'),
    },
    UNIT_PALETTE: [
      { bg: hex('#EAF4FF'), badge: hex('#0A84FF') },
      { bg: hex('#E8FBFA'), badge: hex('#20B8B0') },
      { bg: hex('#EFECFE'), badge: hex('#7B6EF6') },
      { bg: hex('#E7FBF4'), badge: hex('#12B886') },
      { bg: hex('#EAF6FF'), badge: hex('#3AA0E8') },
      { bg: hex('#F2F2F5'), badge: hex('#8E8E93') },
    ],
  },
  B: {
    label: '🎨 Дизайн B · Глубокий океан (градиент синего)',
    icon: '🌊',
    T: {
      pageBg: hex('#F2F6FA'), surface: hex('#FFFFFF'), surfaceB: hex('#F7FAFC'),
      text1: hex('#0B1F33'), text2: hex('#4E6C82'), text3: hex('#A8BDC9'),
      brand: hex('#0B3D66'), border: hex('#E1EAF0'), borderM: hex('#C7D8E3'),
      groupBg: hex('#0B3D66'), groupFg: hex('#CFE3F2'),
      titleBg: hex('#0B3D66'), titleFg: hex('#FFFFFF'),
      zoneGreenBg: hex('#E3F4E9'), zoneGreenFg: hex('#1CA161'),
      zoneYellowBg: hex('#FFF6E0'), zoneYellowFg: hex('#E0A100'),
      zoneRedBg: hex('#FDEDEA'), zoneRedFg: hex('#D9480F'),
    },
    UNIT_PALETTE: [
      { bg: hex('#EAF6FF'), badge: hex('#8ED0FF') },
      { bg: hex('#E3F0FC'), badge: hex('#5CB3F5') },
      { bg: hex('#DCE9F9'), badge: hex('#2E9BE6') },
      { bg: hex('#D3E0F2'), badge: hex('#1478C9') },
      { bg: hex('#CBD8ED'), badge: hex('#0B5CA8') },
      { bg: hex('#C3D0E6'), badge: hex('#0B3D66') },
    ],
  },
  C: {
    label: '🎨 Дизайн C · Мягкая мультипалитра',
    icon: '🌈',
    T: {
      pageBg: hex('#FAFAFA'), surface: hex('#FFFFFF'), surfaceB: hex('#F6F6F7'),
      text1: hex('#1D1D1F'), text2: hex('#6E6E73'), text3: hex('#AEAEB2'),
      brand: hex('#007AFF'), border: hex('#EDEDED'), borderM: hex('#D9D9DE'),
      groupBg: hex('#F2F2F3'), groupFg: hex('#9A9AA0'),
      titleBg: hex('#FAFAFA'), titleFg: hex('#1D1D1F'),
      zoneGreenBg: hex('#E3F4E9'), zoneGreenFg: hex('#1CA161'),
      zoneYellowBg: hex('#FFF6E0'), zoneYellowFg: hex('#E0A100'),
      zoneRedBg: hex('#FDE7E7'), zoneRedFg: hex('#E62E2E'),
    },
    UNIT_PALETTE: [
      { bg: hex('#EAF2FF'), badge: hex('#3D7DFF') },
      { bg: hex('#F3EEFF'), badge: hex('#8B5CF6') },
      { bg: hex('#FFF0F6'), badge: hex('#EC4899') },
      { bg: hex('#FFF6E9'), badge: hex('#F59E0B') },
      { bg: hex('#EAFBF0'), badge: hex('#10B981') },
      { bg: hex('#E9FBFA'), badge: hex('#14B8A6') },
    ],
  },
};

// ─── Мок-метрики (представительный набор, чтобы показать KPI-зоны) ──
const MOCK_METRICS = [
  { group: 'Выручка',          key: 'totalRevenue',      label: 'Выручка, ₽',                  lowerBetter: false, zone: null },
  { group: 'Заказы',           key: 'totalOrders',       label: 'Заказы',                       lowerBetter: false, zone: null },
  { group: 'Заказы',           key: 'avgCheck',          label: 'Средний чек, ₽',                lowerBetter: false, zone: null },
  { group: 'Производительность', key: 'salesPerLaborHour', label: 'Производительность, ₽/час',  lowerBetter: false, zone: 'salesPerLaborHour' },
  { group: 'Производительность', key: 'kcPercent',        label: 'KitchenCost, %',               lowerBetter: true,  zone: 'kcPercent' },
  { group: 'Меню',             key: 'menuAvailability',  label: 'Доступность меню, %',           lowerBetter: false, zone: 'menuAvailability' },
  { group: 'Списания',         key: 'writeOffTotal',     label: 'Списаний всего, ₽',             lowerBetter: true,  zone: 'writeOffTotal' },
];

function zoneFor(key, v) {
  if (key === 'salesPerLaborHour') return v < 2000 ? 'red' : v < 2200 ? 'yellow' : 'green';
  if (key === 'kcPercent')         return v === 0 ? null : v <= 12.5 ? 'green' : v < 15 ? 'yellow' : 'red';
  if (key === 'menuAvailability')  return v >= 95 ? 'green' : v >= 85 ? 'yellow' : 'red';
  if (key === 'writeOffTotal')     return v > 2000 ? 'red' : 'green';
  return null;
}

const UNIT_NAMES = ['Дринкит 1-1','Дринкит 1-2','Дринкит 1-3','Дринкит 1-4','Дринкит 1-5','Дринкит 1-6'];
const DAY_LABELS = ['Пн 29.06','Вт 30.06','Ср 01.07','Чт 02.07','Пт 03.07','Сб 04.07'];

function seedRandom(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

function mockStats(unitIdx, dayIdx) {
  const rnd = seedRandom(unitIdx * 97 + dayIdx * 13 + 7);
  const revenue = Math.round(28000 + rnd() * 22000);
  const orders  = Math.round(140 + rnd() * 90);
  return {
    totalRevenue: revenue,
    totalOrders: orders,
    avgCheck: Math.round(revenue / orders),
    salesPerLaborHour: Math.round(1800 + rnd() * 700),
    kcPercent: Math.round((9 + rnd() * 9) * 10) / 10,
    menuAvailability: Math.round(80 + rnd() * 20),
    writeOffTotal: Math.round(rnd() * 3500),
  };
}

function cell(value, opts) {
  opts = opts || {};
  return {
    userEnteredValue: value === null || value === undefined ? {}
      : typeof value === 'number' ? { numberValue: value } : { stringValue: String(value) },
    userEnteredFormat: {
      backgroundColor: opts.bgColor || WHITE,
      horizontalAlignment: opts.hAlign || 'LEFT',
      verticalAlignment: 'MIDDLE',
      wrapStrategy: 'CLIP',
      textFormat: {
        bold: !!opts.bold, fontSize: opts.fontSize || 10,
        fontFamily: 'Google Sans',
        foregroundColor: opts.fgColor || hex('#1D1D1F'),
      },
      padding: { top: 4, right: 8, bottom: 4, left: 8 },
    },
  };
}
function filler(bg) { return cell(null, { bgColor: bg }); }

async function resetTab(sheets, spreadsheetId, title) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets.find(s => s.properties.title === title);
  if (existing) return existing.properties.sheetId;
  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
  });
  return res.data.replies[0].addSheet.properties.sheetId;
}

async function writePreviewTab(sheets, spreadsheetId, themeKey) {
  const theme = THEMES[themeKey];
  const { T, UNIT_PALETTE, label, icon } = theme;
  const tabName = label;
  const sheetId = await resetTab(sheets, spreadsheetId, tabName);
  const colCount = 1 + DAY_LABELS.length;
  const rows = [];
  const requests = [];
  let rowIdx = 0;

  const BORDER_HAIR = { style: 'SOLID', width: 1, color: T.border };
  const BORDER_MED  = { style: 'SOLID_MEDIUM', width: 2, color: T.borderM };
  function borderBottom(ri, style) {
    requests.push({ updateBorders: {
      range: { sheetId, startRowIndex: ri, endRowIndex: ri + 1, startColumnIndex: 0, endColumnIndex: colCount },
      bottom: style || BORDER_HAIR,
    }});
  }

  // Заголовок
  rows.push({ values: [
    cell(`${icon} Drinkit Омск · ПРЕВЬЮ (тестовые цифры)`, { bold: true, fontSize: 12, bgColor: T.titleBg, fgColor: T.titleFg }),
    ...Array.from({ length: colCount - 1 }, () => filler(T.titleBg)),
  ]});
  requests.push({ updateBorders: {
    range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: colCount },
    top: { style: 'SOLID_MEDIUM', width: 3, color: T.brand }, bottom: BORDER_HAIR,
  }});
  rowIdx++;

  // Заголовки колонок
  rows.push({ values: [
    cell('МЕТРИКА', { fontSize: 9, bgColor: T.surface, fgColor: T.text3 }),
    ...DAY_LABELS.map(l => cell(l, { bold: true, fontSize: 10, bgColor: T.surface, fgColor: T.text2, hAlign: 'RIGHT' })),
  ]});
  borderBottom(rowIdx, BORDER_MED);
  rowIdx++;

  UNIT_NAMES.forEach((unitName, unitIndex) => {
    const palette = UNIT_PALETTE[unitIndex % UNIT_PALETTE.length];
    rows.push({ values: [
      cell(unitName, { bold: true, fontSize: 11, bgColor: palette.bg, fgColor: T.text1 }),
      cell('', { bgColor: palette.bg }),
      ...Array.from({ length: colCount - 2 }, () => filler(palette.bg)),
    ]});
    requests.push({ mergeCells: { range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 1, endColumnIndex: colCount }, mergeType: 'MERGE_ALL' } });
    requests.push({ updateBorders: {
      range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 0, endColumnIndex: colCount },
      top: { style: 'SOLID_MEDIUM', width: 3, color: palette.badge }, bottom: BORDER_MED,
    }});
    rowIdx++;

    let lastGroup = '', stripe = 0;
    for (const metric of MOCK_METRICS) {
      if (metric.group !== lastGroup) {
        rows.push({ values: [
          cell(metric.group.toUpperCase(), { fontSize: 8, bgColor: T.groupBg, fgColor: T.groupFg || T.text3 }),
          ...Array.from({ length: colCount - 1 }, () => filler(T.groupBg)),
        ]});
        borderBottom(rowIdx);
        rowIdx++;
        lastGroup = metric.group;
      }
      const bg = stripe % 2 === 0 ? T.surface : T.surfaceB;
      const isRev = metric.key === 'totalRevenue';
      const dataRow = [
        cell(metric.label, { fontSize: 10, bgColor: bg, fgColor: T.text1 }),
        ...DAY_LABELS.map((_, dayIdx) => {
          const v = mockStats(unitIndex, dayIdx)[metric.key];
          const zone = metric.zone ? zoneFor(metric.zone, v) : null;
          let cellBg = bg, cellFg = T.text1, bold = isRev;
          if (zone === 'green')  { cellBg = T.zoneGreenBg;  cellFg = T.zoneGreenFg;  bold = true; }
          if (zone === 'yellow') { cellBg = T.zoneYellowBg; cellFg = T.zoneYellowFg; bold = true; }
          if (zone === 'red')    { cellBg = T.zoneRedBg;    cellFg = T.zoneRedFg;    bold = true; }
          return cell(v, { fontSize: isRev ? 11 : 10, bold, bgColor: cellBg, fgColor: cellFg, hAlign: 'RIGHT' });
        }),
      ];
      rows.push({ values: dataRow });
      borderBottom(rowIdx);
      rowIdx++;
      stripe++;
    }
    requests.push({ updateBorders: {
      range: { sheetId, startRowIndex: rowIdx - 1, endRowIndex: rowIdx, startColumnIndex: 0, endColumnIndex: colCount },
      bottom: BORDER_MED,
    }});
  });

  // unmerge old
  {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = meta.data.sheets.find(s => s.properties.sheetId === sheetId);
    const existingMerges = (sheet && sheet.merges) || [];
    if (existingMerges.length) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: existingMerges.map(m => ({ unmergeCells: { range: m } })) } });
    }
  }

  const neededRows = Math.max(rows.length + 10, 60);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ updateSheetProperties: { properties: { sheetId, gridProperties: { columnCount: colCount, rowCount: neededRows } }, fields: 'gridProperties.columnCount,gridProperties.rowCount' } }] },
  });
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ updateCells: { range: { sheetId }, fields: 'userEnteredValue,userEnteredFormat' } }] },
  });
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ updateCells: { rows, fields: 'userEnteredValue,userEnteredFormat', start: { sheetId, rowIndex: 0, columnIndex: 0 } } }] },
  });
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 0, frozenColumnCount: 0 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } }] },
  });
  if (requests.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  }
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [
      { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 2, frozenColumnCount: 1 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 36 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 30 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 2, endIndex: rowIdx }, properties: { pixelSize: 24 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 220 }, fields: 'pixelSize' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: colCount }, properties: { pixelSize: 105 }, fields: 'pixelSize' } },
    ]},
  });

  console.log(`[preview] ✓ «${tabName}» готов`);
}

async function clean(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const toDelete = meta.data.sheets.filter(s => Object.values(THEMES).some(t => t.label === s.properties.title));
  if (!toDelete.length) { console.log('Нечего удалять.'); return; }
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: toDelete.map(s => ({ deleteSheet: { sheetId: s.properties.sheetId } })) },
  });
  console.log(`Удалено вкладок: ${toDelete.length}`);
}

async function main() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID не задан в .env');
  const auth = getAuth();
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  if (process.argv[2] === 'clean') {
    await clean(sheets, spreadsheetId);
    return;
  }

  for (const key of Object.keys(THEMES)) {
    await writePreviewTab(sheets, spreadsheetId, key);
  }
  console.log('\nГотово! Открой таблицу и посмотри вкладки Дизайн A / B / C.');
}

main().catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
