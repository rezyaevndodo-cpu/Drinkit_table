'use strict';
require('dotenv').config();
const express = require('express');
const cron    = require('node-cron');
const { runUpdate, getStatus } = require('./src/update');

const app  = express();
const PORT = parseInt(process.env.PORT || '8080', 10);

// Health-check / статус
app.get('/', function(req, res) {
  res.json({ service: 'Drinkit Омск — таблица статистики', status: getStatus() });
});

// Ручной запуск обновления: GET /run
app.get('/run', function(req, res) {
  runUpdate().catch(console.error);
  res.json({ started: true, message: 'Обновление запущено' });
});

app.listen(PORT, function() {
  console.log('[server] Запущен на порту ' + PORT);

  // CRON: 07:30 по Омску = 01:30 UTC (на 30 мин позже Dodo, чтобы не пересекались по API)
  cron.schedule('30 1 * * *', function() {
    console.log('[cron] 07:30 Омск — запуск обновления таблицы Drinkit');
    runUpdate().catch(console.error);
  }, { timezone: 'UTC' });

  console.log('[server] Cron установлен: ежедневно 07:30 Омск (01:30 UTC)');
  console.log('[server] Ручной запуск: GET /run');
});
