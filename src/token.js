'use strict';
const axios = require('axios');
const cfg   = require('./config');
const tokenStore = require('./tokenStore');

let cachedToken     = null;
let cacheExpiresAt  = 0;
let cachedRefresh   = null;
let loadedFromStore = false;

async function loadRefreshTokenOnce() {
  if (loadedFromStore) return;
  loadedFromStore = true;
  const stored = await tokenStore.getStoredRefreshToken();
  // Токен из Google Таблицы — самый свежий (пережил рестарты), поэтому
  // приоритетнее статичного значения из переменной окружения, которое
  // используется только как бутстрап при самом первом запуске.
  cachedRefresh = stored || cfg.REFRESH_TOKEN;
}

async function refreshWith(refreshToken) {
  const credentials = Buffer.from(`${cfg.CLIENT_ID}:${cfg.CLIENT_SECRET}`).toString('base64');
  return axios.post(
    'https://auth.dodois.io/connect/token',
    new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
    {
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
    }
  );
}

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && cacheExpiresAt > now + 60_000) return cachedToken;

  await loadRefreshTokenOnce();

  let resp;
  try {
    resp = await refreshWith(cachedRefresh);
  } catch (e) {
    // Если сохранённый в таблице токен вдруг оказался невалиден, пробуем
    // один раз откатиться на токен из переменной окружения — на случай
    // ручного восстановления.
    if (cachedRefresh !== cfg.REFRESH_TOKEN && cfg.REFRESH_TOKEN) {
      console.warn('[token] сохранённый refresh_token не сработал, пробую значение из .env');
      resp = await refreshWith(cfg.REFRESH_TOKEN);
    } else {
      throw e;
    }
  }

  cachedToken    = resp.data.access_token;
  cacheExpiresAt = now + 23 * 60 * 60 * 1000;

  if (resp.data.refresh_token && resp.data.refresh_token !== cachedRefresh) {
    cachedRefresh = resp.data.refresh_token;
    cfg.REFRESH_TOKEN = resp.data.refresh_token;
    // Сохраняем НАДЁЖНО — переживёт рестарт/редеплой Railway.
    await tokenStore.saveRefreshToken(resp.data.refresh_token);
  }

  console.log('[token] access_token получен');
  return cachedToken;
}

module.exports = { getAccessToken };
