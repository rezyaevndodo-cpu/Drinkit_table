'use strict';
require('dotenv').config();
const { getAccessToken } = require('./token');
const { getUnitStats }   = require('./api');
const { writeToSheets }  = require('./sheets');
const { getDaysFrom, getWeeksFrom, getMonths } = require('./periods');
const { UNITS, SUM_KEYS, AVG_KEYS, AVG_TIME_KEYS, AVG_PCT_KEYS } = require('./config');

let isRunning  = false;
let lastRunAt  = null;
let lastStatus = 'Ожидание первого запуска';

function getStatus() { return { isRunning, lastRunAt, lastStatus }; }

async function runUpdate() {
  if (isRunning) { console.log('[update] Уже выполняется, пропускаем'); return; }
  isRunning  = true;
  lastStatus = 'Запущено...';
  console.log('\n[update] ══ Старт обновления ══', new Date().toISOString());

  try {
    const token = await getAccessToken();

    // Накопительно с 1 мая 2026 (как Dodo)
    const START_DATE = new Date('2026-05-01T01:00:00Z');
    const days   = getDaysFrom(START_DATE);
    const weeks  = getWeeksFrom(START_DATE);
    const months = getMonths();
    console.log(`[update] Периодов: ${days.length} дней, ${weeks.length} недель, ${months.length} месяцев`);

    const statsMap = new Map();

    for (let i = 0; i < UNITS.length; i++) {
      const unit = UNITS[i];
      console.log(`[update] Точка ${i + 1}/${UNITS.length}: ${unit.name}`);
      lastStatus = `Собираю ${unit.name} (${i + 1}/${UNITS.length})`;

      const unitMap = new Map();
      statsMap.set(unit.name, unitMap);

      for (const period of [...days, ...weeks, ...months]) {
        const s = await getUnitStats(token, unit.id, period.from, period.to);
        unitMap.set(period.label, s);
      }
      await new Promise(r => setTimeout(r, 800)); // пауза против rate limit
    }

    // Агрегат «Вся сеть»
    const allPeriods = [...days, ...weeks, ...months];
    const networkMap = new Map();
    statsMap.set('Вся сеть', networkMap);
    for (const period of allPeriods) {
      networkMap.set(period.label, aggregateNetwork(statsMap, period.label));
    }

    lastStatus = 'Записываю в Google Sheets...';
    await writeToSheets({ days, weeks, months }, statsMap);

    lastRunAt  = new Date().toISOString();
    lastStatus = `Обновлено в ${lastRunAt}`;
    console.log('[update] ══ Готово ══');
  } catch (err) {
    lastStatus = `Ошибка: ${err.message}`;
    console.error('[update] ОШИБКА:', err);
  } finally {
    isRunning = false;
  }
}

// ── Агрегация «Вся сеть» ──────────────────────────────────
function timeToSec(str) {
  if (typeof str !== 'string') return null;
  const p = str.split(':');
  if (p.length === 3) return (+p[0]) * 3600 + (+p[1]) * 60 + (+p[2]);
  return null;
}
function secToTime(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}
function pctToNum(str) {
  if (typeof str === 'number') return str;
  if (typeof str !== 'string') return null;
  const n = parseFloat(str.replace('%', '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

function aggregateNetwork(statsMap, periodLabel) {
  const agg = {};
  const units = [];
  for (const [name, map] of statsMap) {
    if (name === 'Вся сеть') continue;
    const s = map.get(periodLabel);
    if (s) units.push(s);
  }
  if (!units.length) return agg;

  for (const key of SUM_KEYS) {
    let sum = 0, has = false;
    units.forEach(u => { if (typeof u[key] === 'number') { sum += u[key]; has = true; } });
    if (has) agg[key] = Math.round(sum * 100) / 100;
  }
  for (const key of AVG_KEYS) {
    const vals = units.map(u => u[key]).filter(v => typeof v === 'number' && v > 0);
    if (vals.length) agg[key] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 100) / 100;
  }
  for (const key of AVG_TIME_KEYS) {
    const secs = units.map(u => timeToSec(u[key])).filter(v => v !== null && v > 0);
    if (secs.length) agg[key] = secToTime(secs.reduce((a, b) => a + b, 0) / secs.length);
  }
  for (const key of AVG_PCT_KEYS) {
    const nums = units.map(u => pctToNum(u[key])).filter(v => v !== null);
    if (nums.length) agg[key] = `${Math.round(nums.reduce((a, b) => a + b, 0) / nums.length * 10) / 10}%`;
  }
  // продуктов в стопе — сумма
  let stopped = 0;
  units.forEach(u => { if (typeof u.stoppedProducts === 'number') stopped += u.stoppedProducts; });
  agg.stoppedProducts = stopped;

  return agg;
}

module.exports = { runUpdate, getStatus };

if (require.main === module) {
  runUpdate().catch(console.error);
}
