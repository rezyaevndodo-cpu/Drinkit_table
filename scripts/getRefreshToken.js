'use strict';
// Одноразовый скрипт для ручного получения refresh_token через OAuth (PKCE).
// Использование:
//   node scripts/getRefreshToken.js url        -> печатает ссылку авторизации
//   node scripts/getRefreshToken.js exchange <code>  -> обменивает код на токены
require('dotenv').config();
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const axios  = require('axios');
const cfg    = require('../src/config');

const VERIFIER_FILE = path.join(__dirname, '.verifier.tmp');

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function main() {
  const mode = process.argv[2];

  if (mode === 'url') {
    const verifier  = base64url(crypto.randomBytes(32));
    const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
    fs.writeFileSync(VERIFIER_FILE, verifier, 'utf-8');

    const params = new URLSearchParams({
      client_id: cfg.CLIENT_ID,
      response_type: 'code',
      redirect_uri: cfg.DODO_REDIRECT_URI,
      scope: cfg.DODO_SCOPE,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    console.log(`${cfg.DODO_ACCOUNT_BASE}/connect/authorize?${params.toString()}`);
    return;
  }

  if (mode === 'exchange') {
    const code = process.argv[3];
    if (!code) { console.error('Нужен код: node scripts/getRefreshToken.js exchange <code>'); process.exit(1); }
    const verifier = fs.readFileSync(VERIFIER_FILE, 'utf-8');

    const credentials = Buffer.from(`${cfg.CLIENT_ID}:${cfg.CLIENT_SECRET}`).toString('base64');
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: cfg.DODO_REDIRECT_URI,
      code_verifier: verifier,
      scope: cfg.DODO_SCOPE,
    });

    const res = await axios.post(`${cfg.DODO_ACCOUNT_BASE}/connect/token`, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
    });
    console.log('ACCESS_TOKEN=' + res.data.access_token);
    console.log('REFRESH_TOKEN=' + res.data.refresh_token);
    return;
  }

  console.error('Использование: node scripts/getRefreshToken.js url | exchange <code>');
  process.exit(1);
}

main().catch(e => {
  console.error('Ошибка:', e.response ? JSON.stringify(e.response.data) : e.message);
  process.exit(1);
});
