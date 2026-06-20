'use strict';
const axios = require('axios');
const cfg   = require('./config');

let cachedToken    = null;
let cacheExpiresAt = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && cacheExpiresAt > now + 60_000) return cachedToken;

  const credentials = Buffer.from(`${cfg.CLIENT_ID}:${cfg.CLIENT_SECRET}`).toString('base64');
  const resp = await axios.post(
    'https://auth.dodois.io/connect/token',
    new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: cfg.REFRESH_TOKEN,
    }).toString(),
    {
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
    }
  );

  cachedToken    = resp.data.access_token;
  cacheExpiresAt = now + 23 * 60 * 60 * 1000;

  if (resp.data.refresh_token) {
    cfg.REFRESH_TOKEN = resp.data.refresh_token;
    console.log('[token] refresh_token обновлён (в памяти)');
  }

  console.log('[token] access_token получен');
  return cachedToken;
}

module.exports = { getAccessToken };
