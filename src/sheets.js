/**
 * src/sheets.js — Drinkit Омск · Google Sheets writer
 * Design: Apple / Jony Ive — pastel cards + KPI colour zones
 */
'use strict';

const { google } = require('googleapis');
const { METRICS, UNITS } = require('./config');

// ─── Auth ─────────────────────────────────────────────────────
function getAuth() {
  const fs   = require('fs');
  const path = require('path');
  let key;
  const keyPath = path.join(__dirname, '..', 'google-key.json');
  if (fs.existsSync(keyPath)) {
    key = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_B64) {
    // base64-вариант — самый надёжный для Railway (нет проблем с переносами строк)
    const raw = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_B64, 'base64').toString('utf-8');
    key = JSON.parse(raw);
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } else {
    throw new Error('google-key.json не найден и не задан GOOGLE_SERVICE_ACCOUNT_B64');
  }
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// ─── Palette ──────────────────────────────────────────────────
function hex(h) {
  const n = parseInt(h.replace('#', ''), 16);
  return { red: ((n >> 16) & 0xff) / 255, green: ((n >> 8) & 0xff) / 255, blue: (n & 0xff) / 255 };
}

// 0-based column index -> letter (0=A, 1=B, ...)
function colLetter(idx) {
  var s = '';
  idx = idx + 1;
  while (idx > 0) {
    var rem = (idx - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    idx = Math.floor((idx - 1) / 26);
  }
  return s;
}

const T = {
  pageBg:   hex('#EAF4FB'),   // нежно-голубой фон страницы
  surface:  hex('#FFFFFF'),
  surfaceB: hex('#F4FAFD'),   // чуть голубее для зебры
  text1:    hex('#0F2D40'),   // глубокий сине-серый текст
  text2:    hex('#4A6B80'),
  text3:    hex('#9DB8C9'),
  brand:    hex('#3BA7DD'),   // голубой Drinkit
  border:   hex('#D6E8F2'),
  borderM:  hex('#BBD8E8'),
  groupBg:  hex('#DCEEF8'),   // голубая плашка группы
};

// 6 точек — мягкие оттенки голубого/бирюзового
const UNIT_PALETTE = [
  { bg: hex('#E3F2FB'), badge: hex('#3BA7DD') },
  { bg: hex('#E0F4F6'), badge: hex('#27B5C4') },
  { bg: hex('#E8F0FC'), badge: hex('#5B8DEF') },
  { bg: hex('#E2F6F1'), badge: hex('#1FB89A') },
  { bg: hex('#EAF0FA'), badge: hex('#6E92D8') },
  { bg: hex('#E0F0FB'), badge: hex('#2E9BD6') },
];

// ─── KPI zone logic ───────────────────────────────────────────
// Returns 'green' | 'yellow' | 'red' | null
function parseTimeToMin(v) {
  // "0:27:30" -> minutes; or number of seconds
  if (typeof v === 'number') return v / 60;
  if (typeof v !== 'string') return null;
  var parts = v.split(':');
  if (parts.length === 3) {
    return (+parts[0]) * 60 + (+parts[1]) + (+parts[2]) / 60;
  }
  return null;
}
function parsePct(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    var m = v.replace('%', '').replace(',', '.').trim();
    var n = parseFloat(m);
    return isNaN(n) ? null : n;
  }
  return null;
}

// Метрики где снижение = улучшение (списания, время)
function lowerIsBetter(metricKey) {
  return ['writeOffTotal','woTesting','woProduction','woTraining','woRemake',
          'woMarketing','woQuality','writeOffPercent','trackingTime','serviceTime',
          'stoppedProducts'].indexOf(metricKey) !== -1;
}

// Числовое значение метрики для сравнения тренда
function numericValue(metricKey, v) {
  if (v === null || v === undefined || v === '—') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    // время H:MM:SS
    var parts = v.split(':');
    if (parts.length === 3) return (+parts[0])*3600 + (+parts[1])*60 + (+parts[2]);
    var n = parseFloat(v.replace(/\s/g,'').replace('%','').replace(',','.'));
    return isNaN(n) ? null : n;
  }
  return null;
}

function kpiZone(metricKey, value) {
  if (value === null || value === undefined || value === '—') return null;

  // Выручка на час работы: <2000 red, 2000-2200 yellow, >=2200 green
  if (metricKey === 'salesPerLaborHour') {
    var n = typeof value === 'number' ? value : parseFloat(String(value).replace(/\s/g, ''));
    if (isNaN(n) || n === 0) return null;
    if (n < 2000) return 'red';
    if (n < 2200) return 'yellow';
    return 'green';
  }

  // Время выполнения заказа: <30 green, 30-35 yellow, >35 red
  if (metricKey === 'avgFulfillmentTime') {
    var min = parseTimeToMin(value);
    if (min === null || min === 0) return null;
    if (min < 30) return 'green';
    if (min <= 35) return 'yellow';
    return 'red';
  }

  // Доля долгих заказов доставка/ресторан: <20 green, 20-30 yellow, >30 red
  if (metricKey === 'lateDeliveryPercent' || metricKey === 'lateRestaurantPercent') {
    var p = parsePct(value);
    if (p === null) return null;
    if (p < 20) return 'green';
    if (p <= 30) return 'yellow';
    return 'red';
  }

  // KitchenCost / DeliveryCost: <=12.5 green, 12.5-15 yellow, >=15 red
  if (metricKey === 'kcPercent' || metricKey === 'deliveryCost') {
    var c = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
    if (isNaN(c) || c === 0) return null;
    if (c <= 12.5) return 'green';
    if (c < 15)    return 'yellow';
    return 'red';
  }

  // Списания (порча/просрочка/ЧФ): >2000 red, иначе green
  if (metricKey === 'writeOffTotal') {
    var w = typeof value === 'number' ? value : parseFloat(String(value).replace(/\s/g, ''));
    if (isNaN(w)) return null;
    return w > 2000 ? 'red' : 'green';
  }

  // Время выдачи в ресторане: <=13 мин green, 14 мин yellow, >15 мин red
  if (metricKey === 'avgRestHandover') {
    var min = parseTimeToMin(value);
    if (min === null || min === 0) return null;
    if (min <= 13) return 'green';
    if (min < 15)  return 'yellow';
    return 'red';
  }

  // Сертификаты опоздания: >5 red, иначе green
  if (metricKey === 'certificates') {
    var c = typeof value === 'number' ? value : parseFloat(String(value));
    if (isNaN(c)) return null;
    return c > 5 ? 'red' : 'green';
  }

  // Рейтинги (0-100): >=85 green, 70-85 yellow, <70 red
  if (metricKey === 'rateCustomerExp' || metricKey === 'rateStandards') {
    var r = typeof value === 'number' ? value : parseFloat(String(value));
    if (isNaN(r) || r === 0) return null;
    if (r >= 85) return 'green';
    if (r >= 70) return 'yellow';
    return 'red';
  }

  // Стопы — зона определяется по stopsDurationSec в writeTab
  if (metricKey === 'stopsDuration') {
    return null;
  }

  return null;
}

// ─── Cell builder ─────────────────────────────────────────────
function cell(value, opts) {
  opts = opts || {};
  var bold     = opts.bold || false;
  var fontSize = opts.fontSize || 10;
  var fgColor  = opts.fgColor || T.text1;
  var bgColor  = opts.bgColor || T.surface;
  var hAlign   = opts.hAlign || 'LEFT';
  var wrap     = opts.overflow ? 'OVERFLOW_CELL' : (opts.wrap ? 'WRAP' : 'CLIP');

  return {
    userEnteredValue: value === null || value === undefined
      ? {}
      : typeof value === 'number'
        ? { numberValue: value }
        : { stringValue: String(value) },
    userEnteredFormat: {
      backgroundColor:     bgColor,
      horizontalAlignment: hAlign,
      verticalAlignment:   'MIDDLE',
      wrapStrategy:        wrap,
      textFormat: {
        bold: bold, fontSize: fontSize,
        fontFamily: 'Google Sans',
        foregroundColor: fgColor,
      },
      padding: { top: 4, right: 8, bottom: 4, left: 8 },
    },
  };
}

function filler(bg) { return cell(null, { bgColor: bg || T.surface }); }

// ─── Reset / create tab ───────────────────────────────────────
async function resetTab(sheets, spreadsheetId, title) {
  const meta     = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets.find(s => s.properties.title === title);
  if (existing) {
    // НЕ очищаем лист здесь — данные перезапишутся через updateCells.
    // Очистка раньше приводила к пустому листу при падении записи.
    return existing.properties.sheetId;
  }
  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
  });
  return res.data.replies[0].addSheet.properties.sheetId;
}

// ─── Write one tab ────────────────────────────────────────────
async function writeTab(sheetsClient, spreadsheetId, tabName, labels, allUnitData) {
  const sheetId  = await resetTab(sheetsClient, spreadsheetId, tabName);
  const colCount = 1 + labels.length; // метрика + периоды (без спарклайна)

  const rows     = [];
  const requests = [];
  let   rowIdx   = 0;

  const BORDER_HAIR = { style: 'SOLID',       width: 1, color: T.border  };
  const BORDER_MED  = { style: 'SOLID_MEDIUM', width: 2, color: T.borderM };

  function borderBottom(ri, style) {
    requests.push({ updateBorders: {
      range: { sheetId, startRowIndex: ri, endRowIndex: ri + 1, startColumnIndex: 0, endColumnIndex: colCount },
      bottom: style || BORDER_HAIR,
    }});
  }

  // ── Title row — надпись над столбцом метрик (столбец A), без merge на всю ширину
  const dataCols = labels.length;        // число колонок-периодов
  const sparkColIdx = 1 + dataCols;      // индекс колонки спарклайна (0-based)
  rows.push({ values: [
    cell(`☕️ Drinkit Омск · ${tabName}`, { bold: true, fontSize: 12, bgColor: T.pageBg, fgColor: T.text1 }),
    ...Array.from({ length: colCount - 1 }, () => filler(T.pageBg)),
  ]});
  requests.push({ updateBorders: {
    range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: colCount },
    top: { style: 'SOLID_MEDIUM', width: 3, color: T.brand }, bottom: BORDER_HAIR,
  }});
  rowIdx++;

  // ── Column headers (без колонки динамики)
  rows.push({ values: [
    cell('МЕТРИКА', { fontSize: 9, bgColor: T.surface, fgColor: T.text3 }),
    ...labels.map(l => cell(l, { bold: true, fontSize: 10, bgColor: T.surface, fgColor: T.text2, hAlign: 'RIGHT' })),
  ]});
  borderBottom(rowIdx, BORDER_MED);
  rowIdx++;

  // ── Units
  allUnitData.forEach(({ unitName, periods }, unitIndex) => {
    const isNetwork = unitName === 'Вся сеть';
    // «Вся сеть» — серая шапка вместо цветной палитры
    const palette = isNetwork
      ? { bg: { red: 0.55, green: 0.55, blue: 0.57 }, badge: { red: 0.4, green: 0.4, blue: 0.42 } }
      : UNIT_PALETTE[unitIndex % UNIT_PALETTE.length];

    // Unit header — название в столбце A (отдельная ячейка), merge со столбца B
    rows.push({ values: [
      cell(unitName, { bold: true, fontSize: 11, bgColor: palette.bg, fgColor: isNetwork ? { red: 1, green: 1, blue: 1 } : T.text1 }),
      cell('', { bgColor: palette.bg }),
      ...Array.from({ length: colCount - 2 }, () => filler(palette.bg)),
    ]});
    requests.push({
      mergeCells: { range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 1, endColumnIndex: colCount }, mergeType: 'MERGE_ALL' },
    });
    requests.push({ updateBorders: {
      range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 0, endColumnIndex: colCount },
      top: { style: 'SOLID_MEDIUM', width: 3, color: palette.badge }, bottom: BORDER_MED,
    }});
    rowIdx++;

    let lastGroup = '';
    let stripe    = 0;

    for (const metric of METRICS) {
      if (metric.group !== lastGroup) {
        rows.push({ values: [
          cell(metric.group.toUpperCase(), { fontSize: 8, bgColor: T.groupBg, fgColor: T.text3 }),
          ...Array.from({ length: colCount - 1 }, () => filler(T.groupBg)),
        ]});
        borderBottom(rowIdx);
        rowIdx++;
        lastGroup = metric.group;
      }

      const bg    = stripe % 2 === 0 ? T.surface : T.surfaceB;
      const isRev = metric.key === 'totalRevenue';

      const dataRow = [
        cell(metric.label, { fontSize: 10, bgColor: bg, fgColor: T.text1 }),
        ...periods.map(p => {
          const val = p.stats[metric.key];
          const v   = val !== undefined && val !== null ? val : '—';
          // Без KPI-зон: ровный чистый стиль. Выручка — чуть жирнее.
          return cell(v, {
            fontSize: isRev ? 11 : 10,
            bold: isRev,
            bgColor: bg,
            fgColor: v === '—' ? T.text3 : T.text1,
            hAlign: 'RIGHT',
          });
        }),
      ];

      rows.push({ values: dataRow });
      borderBottom(rowIdx);
      rowIdx++;
      stripe++;
    }

    // Thick separator after unit
    requests.push({ updateBorders: {
      range: { sheetId, startRowIndex: rowIdx - 1, endRowIndex: rowIdx, startColumnIndex: 0, endColumnIndex: colCount },
      bottom: BORDER_MED,
    }});
  });

  // ── Сначала разъединяем ВСЕ старые merge — иначе нельзя сузить колонки
  // и старые merge ломают новую разметку.
  {
    const meta = await sheetsClient.spreadsheets.get({ spreadsheetId });
    const sheet = meta.data.sheets.find(s => s.properties.sheetId === sheetId);
    const existingMerges = (sheet && sheet.merges) || [];
    if (existingMerges.length) {
      await sheetsClient.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: existingMerges.map(m => ({ unmergeCells: { range: m } })) },
      });
    }
  }

  // Расширяем/сужаем сетку листа ТОЧНО под число строк и колонок.
  // Важно сузить до colCount — иначе старые колонки справа от прошлых запусков
  // остаются и выглядят как задвоение «Динамики».
  const neededRows = Math.max(rows.length + 20, 100);
  const neededCols = colCount; // ровно: метрика + периоды + динамика
  try {
    // Сначала ужимаем до 1 строки/колонки чтобы сбросить старое, потом ставим нужное.
    await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{
        updateSheetProperties: {
          properties: { sheetId, gridProperties: { columnCount: neededCols, rowCount: neededRows } },
          fields: 'gridProperties.columnCount,gridProperties.rowCount',
        }
      }]},
    });
  } catch (e) {
    console.error('[sheets] resize warning:', e.message);
  }

  // Очищаем ВЕСЬ лист перед записью (значения и формат), чтобы не осталось
  // старых колонок/строк от предыдущих запусков с другим числом периодов.
  try {
    await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{
        updateCells: {
          range: { sheetId },  // весь лист
          fields: 'userEnteredValue,userEnteredFormat',
        }
      }]},
    });
  } catch (e) {
    console.error('[sheets] clear warning:', e.message);
  }

  // ── Write cell values + formats
  await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{
      updateCells: {
        rows,
        fields: 'userEnteredValue,userEnteredFormat',
        start:  { sheetId, rowIndex: 0, columnIndex: 0 },
      },
    }]},
  });

  // ── Step 1: remove freeze
  await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 0, frozenColumnCount: 0 } },
        fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount',
      }
    }]},
  });

  // ── Step 2: merges + borders
  if (requests.length) {
    await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
  }

  // ── Step 3: freeze + dimensions
  await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [
      { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 2, frozenColumnCount: 1 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' }},
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 36 }, fields: 'pixelSize' }},
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 30 }, fields: 'pixelSize' }},
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 2, endIndex: rowIdx }, properties: { pixelSize: 24 }, fields: 'pixelSize' }},
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 250 }, fields: 'pixelSize' }},
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: colCount }, properties: { pixelSize: 115 }, fields: 'pixelSize' }},
    ]},
  });

  console.log(`[sheets] ✓ «${tabName}» — ${rows.length} строк`);
}

// ─── Main export ──────────────────────────────────────────────
async function writeToSheets(periods, statsMap) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID не задан в .env');

  const auth   = getAuth();
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  for (const [tabName, periodList] of [
    ['По дням',    periods.days],
    ['По неделям', periods.weeks],
    ['По месяцам', periods.months],
  ]) {
    if (!periodList || !periodList.length) continue; // не трогаем лист если нет данных
    const labels   = periodList.map(p => p.label);
    const unitList = [...UNITS, { name: 'Вся сеть', id: '__network__' }];
    const unitData = unitList.map(u => ({
      unitName: u.name,
      periods:  periodList.map(p => ({
        label: p.label,
        stats: (statsMap.get(u.name) || new Map()).get(p.label) || {},
      })),
    }));
    await writeTab(sheets, spreadsheetId, tabName, labels, unitData);
  }

  // ── Лист «Архив 2025» (если переданы данные) ──────────────
  if (periods.archive2025 && periods.archive2025.length) {
    const labels   = periods.archive2025.map(p => p.label);
    const unitList = [...UNITS, { name: 'Вся сеть', id: '__network__' }];
    const unitData = unitList.map(u => ({
      unitName: u.name,
      periods:  periods.archive2025.map(p => ({
        label: p.label,
        stats: (statsMap.get(u.name) || new Map()).get(p.label) || {},
      })),
    }));
    await writeTab(sheets, spreadsheetId, 'Архив 2025', labels, unitData);
  }
}

module.exports = { writeToSheets };
