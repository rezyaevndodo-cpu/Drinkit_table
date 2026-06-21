'use strict';
const axios = require('axios');
const { API_DRINKIT, MENU_SIZE, WORK_START_HOUR, WORK_END_HOUR } = require('./config');

function fmtOmsk(date) {
  // Локальное Омск-время (UTC+6) в ISO без зоны, обрезанное до секунд
  return new Date(date.getTime() + 6 * 3600000).toISOString().substring(0, 19);
}
function uid(unitId) { return unitId.replace(/-/g, '').toLowerCase(); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatDur(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

async function get(url, token, retries) {
  retries = retries === undefined ? 5 : retries;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        validateStatus: () => true,
      });
      if (r.status === 200) return r.data;
      if (r.status === 429 && attempt < retries) { await sleep(2000 * (attempt + 1)); continue; }
      if (r.status >= 500 && attempt < retries) { await sleep(1000 * (attempt + 1)); continue; }
      // 403 NoAccessToUnit у Drinkit бывает ВРЕМЕННЫМ (мигает при живом доступе).
      // Повторяем с паузой, а не считаем за «нет данных».
      if (r.status === 403 && attempt < retries) {
        const code = r.data && (r.data.code || r.data.Code);
        if (code === 'NoAccessToUnit') { await sleep(1500 * (attempt + 1)); continue; }
      }
      console.warn(`[api] HTTP ${r.status} ${url.slice(0, 90)}`);
      return null;
    } catch (e) {
      if (attempt < retries) { await sleep(1000); continue; }
      console.warn(`[api] Error: ${e.message}`);
      return null;
    }
  }
  return null;
}

// Причины списаний Drinkit → группы
const R_TESTING    = ['DrinkitEmployeeTesting'];
const R_PRODUCTION = ['DrinkitProductionNeeds'];
const R_TRAINING   = ['DrinkitStaffTraining'];
const R_REMAKE     = ['DrinkitRemakeForGuest'];
const R_MARKETING  = ['Marketing'];
const R_QUALITY    = ['ManufactureQualityControl', 'DrinkitMenuDevelopment'];

async function getUnitStats(token, unitId, fromDate, toDate) {
  const stats = {};
  const u = uid(unitId);
  const f = fmtOmsk(fromDate);
  const t = fmtOmsk(toDate);

  // 1. Productivity — выручка, часы, производительность, продуктивность
  let sales = 0;
  {
    const d = await get(`${API_DRINKIT}/production/productivity?units=${u}&from=${f}&to=${t}`, token);
    const p = (d?.productivityStatistics || [])[0];
    if (p) {
      sales = Math.round(p.sales || 0);
      stats.totalRevenue        = sales;
      stats.laborHours          = parseFloat((p.laborHours || 0).toFixed(1));
      stats.salesPerLaborHour   = Math.round(p.salesPerLaborHour || 0);
      stats.productsPerLaborHour = parseFloat((p.productsPerLaborHour || 0).toFixed(2));
    }
  }

  // 2. Finances — заказы, моб. приложение, средний чек
  {
    const d = await get(`${API_DRINKIT}/finances/sales/units?units=${u}&from=${f}&to=${t}`, token);
    const unit = (d?.result || [])[0];
    if (unit) {
      const totalOrders = unit.ordersCount || 0;
      const totalSales  = Math.round(unit.sales || 0);
      let mobSales = 0, mobOrders = 0;
      (unit.salesBreakdown || []).forEach(b => {
        if (b.orderSource === 'MobileApp') { mobSales += b.sales; mobOrders += b.ordersCount; }
      });
      if (!stats.totalRevenue) stats.totalRevenue = totalSales;
      stats.totalOrders   = totalOrders;
      stats.mobileRevenue = Math.round(mobSales);
      stats.mobileOrders  = mobOrders;
      stats.mobilePercent = totalOrders > 0 ? `${Math.round(mobOrders / totalOrders * 1000) / 10}%` : '0%';
      stats.avgCheck      = totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0;
      if (!sales) sales = totalSales;
    }
  }

  // 3. Orders handover — время на трекинге, сервисное время
  {
    const d = await get(`${API_DRINKIT}/production/orders-handover-statistics?units=${u}&from=${f}&to=${t}`, token);
    const oh = (d?.ordersHandoverStatistics || [])[0];
    if (oh) {
      stats.trackingTime = formatDur(oh.avgTrackingPendingTime || 0);
      stats.serviceTime  = formatDur(oh.avgOrderHandoverTime || 0);
    }
  }

  // 5. Списания — по причинам
  {
    const wideFrom = new Date(fromDate.getTime() - 86400000);
    const wideTo   = new Date(toDate.getTime() + 86400000);
    const d = await get(`${API_DRINKIT}/accounting/write-offs/products?units=${u}&from=${fmtOmsk(wideFrom)}&to=${fmtOmsk(wideTo)}&take=1000`, token);
    const fromLocal = new Date(fromDate.getTime() + 6 * 3600000);
    const toLocal   = new Date(toDate.getTime() + 6 * 3600000);
    let total = 0, testing = 0, production = 0, training = 0, remake = 0, mkt = 0, quality = 0;
    (d?.writeOffs || []).forEach(w => {
      if (!w.writtenOffAtLocal) return;
      const dt = new Date(w.writtenOffAtLocal + 'Z');
      if (dt < fromLocal || dt >= toLocal) return;
      const rub = (w.pricePerPiece || 0) * (w.quantity || 0);
      total += rub; // всего = ВСЕ причины, чтобы билось с суммой
      if (R_TESTING.includes(w.reason))    testing += rub;
      if (R_PRODUCTION.includes(w.reason)) production += rub;
      if (R_TRAINING.includes(w.reason))   training += rub;
      if (R_REMAKE.includes(w.reason))     remake += rub;
      if (R_MARKETING.includes(w.reason))  mkt += rub;
      if (R_QUALITY.includes(w.reason))    quality += rub;
    });
    stats.writeOffTotal   = Math.round(total);
    stats.woTesting       = Math.round(testing);
    stats.woProduction    = Math.round(production);
    stats.woTraining      = Math.round(training);
    stats.woRemake        = Math.round(remake);
    stats.woMarketing     = Math.round(mkt);
    stats.woQuality       = Math.round(quality);
    stats.writeOffPercent = sales > 0 ? `${Math.round(total / sales * 1000) / 10}%` : '0%';
  }

  // 6. Доступность меню + продуктов в стопе (формула по рабочему времени)
  {
    // Рабочие границы периода в UTC
    const periodFrom = fromDate, periodTo = toDate;
    // окно запроса — не более суток (API лимит). Берём сам период (для дня это ОК).
    const reqTo = toDate > new Date() ? new Date() : toDate;
    const d = await get(`${API_DRINKIT}/production/stop-sales-products?units=${u}&from=${fmtOmsk(fromDate)}&to=${fmtOmsk(reqTo)}`, token);
    const arr = (d?.stopSalesByProducts || []);

    // активные стопы (для счётчика "продуктов в стопе")
    const activeNow = arr.filter(s => !s.endedAtLocal).length;
    stats.stoppedProducts = activeNow;

    // доступность за период: 1 − Σ(простой в рабочие часы) / (MENU_SIZE × рабочее время)
    // рабочие часы в периоде
    const fromLocal = new Date(fromDate.getTime() + 6 * 3600000);
    const toLocal   = new Date(reqTo.getTime() + 6 * 3600000);
    // считаем рабочие секунды в периоде (только 07:00–22:00 каждого дня)
    let workedSec = 0;
    {
      let dCur = new Date(fromLocal);
      while (dCur < toLocal) {
        const dayStart = new Date(Date.UTC(dCur.getUTCFullYear(), dCur.getUTCMonth(), dCur.getUTCDate(), WORK_START_HOUR, 0, 0));
        const dayEnd   = new Date(Date.UTC(dCur.getUTCFullYear(), dCur.getUTCMonth(), dCur.getUTCDate(), WORK_END_HOUR, 0, 0));
        const lo = dayStart > fromLocal ? dayStart : fromLocal;
        const hi = dayEnd < toLocal ? dayEnd : toLocal;
        if (hi > lo) workedSec += (hi - lo) / 1000;
        dCur = new Date(Date.UTC(dCur.getUTCFullYear(), dCur.getUTCMonth(), dCur.getUTCDate() + 1, 0, 0, 0));
      }
    }
    let downSec = 0;
    arr.forEach(s => {
      if (!s.startedAtLocal) return;
      const st = new Date(s.startedAtLocal + 'Z');
      const en = s.endedAtLocal ? new Date(s.endedAtLocal + 'Z') : toLocal;
      // пересечение с рабочими часами по дням
      let dCur = new Date(fromLocal);
      while (dCur < toLocal) {
        const dayStart = new Date(Date.UTC(dCur.getUTCFullYear(), dCur.getUTCMonth(), dCur.getUTCDate(), WORK_START_HOUR, 0, 0));
        const dayEnd   = new Date(Date.UTC(dCur.getUTCFullYear(), dCur.getUTCMonth(), dCur.getUTCDate(), WORK_END_HOUR, 0, 0));
        const wLo = dayStart > fromLocal ? dayStart : fromLocal;
        const wHi = dayEnd < toLocal ? dayEnd : toLocal;
        const lo = st > wLo ? st : wLo;
        const hi = en < wHi ? en : wHi;
        if (hi > lo) downSec += (hi - lo) / 1000;
        dCur = new Date(Date.UTC(dCur.getUTCFullYear(), dCur.getUTCMonth(), dCur.getUTCDate() + 1, 0, 0, 0));
      }
    });
    const capacity = MENU_SIZE * workedSec;
    const pct = capacity > 0 ? Math.max(0, Math.min(100, Math.round((1 - downSec / capacity) * 100))) : 100;
    stats.menuAvailability = `${pct}%`;
  }

  return stats;
}

module.exports = { getUnitStats };
