/**
 * src/tokenStore.js — durable-хранилище Dodo IS refresh-токена.
 *
 * Dodo IS выдаёт одноразовый refresh_token — при каждом обновлении
 * access_token сервер выдаёт НОВЫЙ refresh_token, а старый перестаёт
 * работать. Раньше актуальный токен жил только в памяти процесса
 * (см. src/token.js), и любой рестарт/редеплой Railway откатывал его
 * к устаревшему значению из DODO_REFRESH_TOKEN — таблица переставала
 * обновляться намертво (именно так один раз уже падала таблица Dodo Омск).
 *
 * Теперь актуальный refresh_token хранится в скрытой вкладке "_auth"
 * той же Google Таблицы, куда пишется статистика — это переживает
 * любые рестарты процесса.
 */
'use strict';

const { google } = require('googleapis');
const { getAuth } = require('./sheets');

const TAB_NAME = '_auth';

async function getSheetsClient() {
  const auth   = getAuth();
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

async function ensureAuthTab(sheets, spreadsheetId) {
  const meta     = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets.find(s => s.properties.title === TAB_NAME);
  if (existing) return existing.properties.sheetId;

  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        addSheet: {
          properties: { title: TAB_NAME, hidden: true, gridProperties: { rowCount: 5, columnCount: 2 } },
        },
      }],
    },
  });
  return res.data.replies[0].addSheet.properties.sheetId;
}

async function getStoredRefreshToken() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) return null;

  try {
    const sheets = await getSheetsClient();
    await ensureAuthTab(sheets, spreadsheetId);
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${TAB_NAME}!B1`,
    });
    const val = res.data.values && res.data.values[0] && res.data.values[0][0];
    return val || null;
  } catch (e) {
    console.error('[tokenStore] чтение refresh_token не удалось:', e.message);
    return null;
  }
}

async function saveRefreshToken(refreshToken) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) return;

  try {
    const sheets = await getSheetsClient();
    await ensureAuthTab(sheets, spreadsheetId);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB_NAME}!A1:B2`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [
          ['refresh_token', refreshToken],
          ['updated_at', new Date().toISOString()],
        ],
      },
    });
    console.log('[tokenStore] refresh_token сохранён в Google Таблице');
  } catch (e) {
    console.error('[tokenStore] запись refresh_token не удалась:', e.message);
  }
}

module.exports = { getStoredRefreshToken, saveRefreshToken };
