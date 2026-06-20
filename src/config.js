'use strict';
require('dotenv').config();

// ============================================================
// API
// ============================================================
const API_BASE     = 'https://api.dodois.io';
const API_DRINKIT  = `${API_BASE}/drinkit/ru`;

// ============================================================
// Учётные данные (из .env / Railway Variables)
// ============================================================
const CLIENT_ID     = process.env.DODO_CLIENT_ID;      // cpmmr
const CLIENT_SECRET = process.env.DODO_CLIENT_SECRET;
let   REFRESH_TOKEN = process.env.DODO_REFRESH_TOKEN;

// ============================================================
// Точки Drinkit Омск (6 шт)
// ============================================================
const UNITS = [
  { id: '11F00A6199B9E94E3BDFED37F7C00F30', name: 'Дринкит 1-1' },
  { id: '11F0C9FB947C8B6C4DBE16D732F5F700', name: 'Дринкит 1-2' },
  { id: '11F0F762B8FA3B0F3D64A8240B6046C0', name: 'Дринкит 1-3' },
  { id: '11F0C9FBB68E993CC4C10080FB914020', name: 'Дринкит 1-4' },
  { id: '11F0F766B0B6D9A90755B343144CD5B0', name: 'Дринкит 1-5' },
  { id: '11F0F76693C609BB9AA52D3BE0F087B0', name: 'Дринкит 1-6' },
];

// Размер полного меню (для доступности). Доступность = (MENU_SIZE − простой) / MENU_SIZE.
const MENU_SIZE = 190;

// Рабочий день Drinkit: 07:00–22:00 Омск.
const WORK_START_HOUR = 7;
const WORK_END_HOUR   = 22;

// ============================================================
// Метрики (порядок строк в таблице)
// Только доступные через API Drinkit (cpmmr). 20 метрик + рейтинги (когда есть).
// ============================================================
const METRICS = [
  { group: 'Выручка',       key: 'totalRevenue',     label: 'Выручка, ₽',                     fmt: 'money' },
  { group: 'Выручка',       key: 'mobileRevenue',    label: 'Выручка моб. приложение, ₽',     fmt: 'money' },
  { group: 'Заказы',        key: 'totalOrders',      label: 'Заказы',                         fmt: 'int'   },
  { group: 'Заказы',        key: 'mobileOrders',     label: 'Заказы моб. приложение',         fmt: 'int'   },
  { group: 'Заказы',        key: 'mobilePercent',    label: '% заказов моб. приложение',      fmt: 'pct'   },
  { group: 'Заказы',        key: 'avgCheck',         label: 'Средний чек, ₽',                 fmt: 'money' },
  { group: 'Производительность', key: 'laborHours',          label: 'Часы кухни',                fmt: 'hours' },
  { group: 'Производительность', key: 'salesPerLaborHour',   label: 'Производительность, ₽/час', fmt: 'money' },
  { group: 'Производительность', key: 'productsPerLaborHour',label: 'Продуктивность (прод./час)',fmt: 'num1'  },
  { group: 'Скорость',      key: 'trackingTime',     label: 'Время ожидания на трекинге',     fmt: 'time'  },
  { group: 'Скорость',      key: 'serviceTime',      label: 'Сервисное время',                fmt: 'time'  },
  { group: 'Качество',      key: 'rateCustomerExp',  label: 'Рейтинг клиентов',               fmt: 'rate'  },
  { group: 'Качество',      key: 'rateShare',        label: 'Доля оценённых заказов, %',      fmt: 'pct'   },
  { group: 'Меню',          key: 'menuAvailability', label: 'Доступность меню, %',            fmt: 'pct'   },
  { group: 'Меню',          key: 'stoppedProducts',  label: 'Продуктов в стопе',              fmt: 'int'   },
  { group: 'Списания',      key: 'writeOffTotal',    label: 'Списаний всего, ₽',              fmt: 'money' },
  { group: 'Списания',      key: 'writeOffPercent',  label: '% списаний от выручки',          fmt: 'pct'   },
  { group: 'Списания',      key: 'writeOffExpired',  label: 'Списание — срок, ₽',             fmt: 'money' },
  { group: 'Списания',      key: 'writeOffDefect',   label: 'Списание — порча, ₽',            fmt: 'money' },
  { group: 'Списания',      key: 'writeOffHuman',    label: 'Списание — чел. фактор, ₽',      fmt: 'money' },
  { group: 'Списания',      key: 'writeOffMarketing',label: 'Списание — маркетинг, ₽',        fmt: 'money' },
];

// Какие метрики суммируются для «Вся сеть», какие усредняются
const SUM_KEYS = [
  'totalRevenue', 'mobileRevenue', 'totalOrders', 'mobileOrders', 'laborHours',
  'stoppedProducts', 'writeOffTotal', 'writeOffExpired', 'writeOffDefect',
  'writeOffHuman', 'writeOffMarketing',
];
const AVG_KEYS = [
  'avgCheck', 'salesPerLaborHour', 'productsPerLaborHour',
  'rateCustomerExp', 'menuAvailability',
];
const AVG_TIME_KEYS = [ 'trackingTime', 'serviceTime' ];
const AVG_PCT_KEYS  = [ 'mobilePercent', 'rateShare', 'writeOffPercent' ];

module.exports = {
  API_BASE, API_DRINKIT,
  CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN,
  UNITS, MENU_SIZE, WORK_START_HOUR, WORK_END_HOUR,
  METRICS, SUM_KEYS, AVG_KEYS, AVG_TIME_KEYS, AVG_PCT_KEYS,
};
