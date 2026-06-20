'use strict';

const DAY_NAMES = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                     'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

/**
 * Дни от startUtc до сегодня включительно (Омск UTC+6).
 * Каждый день: 01:00 UTC → следующий 01:00 UTC
 */
function getDaysFrom(startUtc) {
  const days = [];
  const now  = new Date();

  // Начало дня по Омску. Drinkit работает 07:00–22:00, ночью заказов нет,
  // поэтому граница 07:00 (01:00 UTC) даёт те же суммы что 00:00.
  const todayStart = new Date(now);
  todayStart.setUTCHours(1, 0, 0, 0);
  if (todayStart > now) todayStart.setUTCDate(todayStart.getUTCDate() - 1);

  // Последний ЗАВЕРШЁННЫЙ день — это вчера. Текущий день не выводим,
  // пока он не закончился (иначе в таблице полу-данные за сегодня).
  const lastComplete = new Date(todayStart);
  lastComplete.setUTCDate(lastComplete.getUTCDate() - 1);

  let cur = new Date(startUtc);
  while (cur <= lastComplete) {
    const next = new Date(cur);
    next.setUTCDate(next.getUTCDate() + 1);
    const omskDate = new Date(cur.getTime() + 6 * 3_600_000);
    const dd  = String(omskDate.getUTCDate()).padStart(2, '0');
    const mm  = String(omskDate.getUTCMonth() + 1).padStart(2, '0');
    const dow = DAY_NAMES[omskDate.getUTCDay()];
    days.push({ from: new Date(cur), to: new Date(next), label: `${dow} ${dd}.${mm}` });
    cur = new Date(next);
  }
  return days;
}

/**
 * Недели (Пн–Вс) начиная от startUtc.
 */
function getWeeksFrom(startUtc) {
  const weeks = [];
  const now   = new Date();
  let cur = new Date(startUtc);

  const dow = cur.getUTCDay();
  const toMon = dow === 0 ? -6 : 1 - dow;
  cur.setUTCDate(cur.getUTCDate() + toMon);
  cur.setUTCHours(1, 0, 0, 0);

  const fmt = (d) =>
    `${String(d.getUTCDate()).padStart(2,'0')}.${String(d.getUTCMonth()+1).padStart(2,'0')}`;

  // Выводим неделю только если она ПОЛНОСТЬЮ завершилась (конец недели <= now).
  // Текущую незавершённую неделю не показываем — иначе полу-данные.
  while (cur < now) {
    const next = new Date(cur);
    next.setUTCDate(next.getUTCDate() + 7);
    if (next > now) break; // неделя ещё не закончилась
    const omskFrom = new Date(cur.getTime()  + 6 * 3_600_000);
    const omskTo   = new Date(next.getTime() + 6 * 3_600_000 - 86_400_000);
    weeks.push({
      from:  new Date(cur),
      to:    new Date(next),
      label: `${fmt(omskFrom)}–${fmt(omskTo)}`,
    });
    cur = new Date(next);
  }
  return weeks;
}

/**
 * Все месяцы с мая 2026 до текущего включительно (накопительно).
 */
function getMonths() {
  const months = [];
  const now = new Date();
  const omskNow = new Date(now.getTime() + 6 * 3_600_000);
  const endYear  = omskNow.getUTCFullYear();
  const endMonth = omskNow.getUTCMonth(); // 0-based

  // стартуем с мая 2026
  let y = 2026, m = 4; // май
  while (y < endYear || (y === endYear && m <= endMonth)) {
    const from = new Date(Date.UTC(y, m, 1, 1, 0, 0));
    const to   = new Date(Date.UTC(m === 11 ? y + 1 : y, (m + 1) % 12, 1, 1, 0, 0));
    months.push({ from, to, label: `${MONTH_NAMES[m]} ${y}` });
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return months;
}

/**
 * Все 12 месяцев 2025 года — для листа «Архив 2025».
 */
function getMonths2025() {
  const months = [];
  for (let m = 0; m < 12; m++) {
    const from = new Date(Date.UTC(2025, m, 1, 1, 0, 0));
    const to   = new Date(Date.UTC(m === 11 ? 2026 : 2025, (m + 1) % 12, 1, 1, 0, 0));
    months.push({ from, to, label: `${MONTH_NAMES[m]} 2025` });
  }
  return months;
}

module.exports = { getDaysFrom, getWeeksFrom, getMonths, getMonths2025 };
