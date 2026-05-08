/**
 * Локальный backend: курсы ЦБР (кэш SQLite), health, заглушка прогнозов.
 * Запуск: npm run server (порт 3001 по умолчанию).
 */
'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const PORT = Number(process.env.PORT || 3001);
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const dbPath = process.env.SQLITE_PATH || path.join(DATA_DIR, 'local.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS fx_rates (
    date TEXT NOT NULL,
    currency TEXT NOT NULL,
    rate REAL NOT NULL,
    source TEXT,
    PRIMARY KEY (date, currency)
  );
`);

const selectFx = db.prepare('SELECT rate FROM fx_rates WHERE currency = ? AND date = ?');
const upsertFx = db.prepare(`
  INSERT INTO fx_rates (date, currency, rate, source)
  VALUES (@date, @currency, @rate, @source)
  ON CONFLICT(date, currency) DO UPDATE SET
    rate = excluded.rate,
    source = excluded.source
`);

function toNextMondayISO() {
  const d = new Date();
  const next = new Date(d);
  next.setDate(d.getDate() + ((8 - d.getDay()) % 7));
  next.setHours(0, 0, 0, 0);
  return next.toISOString().slice(0, 10);
}

const app = express();
app.use(cors({ origin: true }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, sqlite: dbPath });
});

app.get('/api/forecasts', (req, res) => {
  const week = String(req.query.week || toNextMondayISO());
  res.json({
    week,
    userId: '',
    forecasts: {},
    source: 'disabled',
    message:
      'Локальный worker прогнозов не включён; используются исторические muWeek/sigmaWeek в UI.'
  });
});

app.get('/api/fx', async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const currency = String(req.query.currency || '').toUpperCase();
    const dateISO = String(req.query.dateISO || new Date().toISOString());
    if (!currency) return res.status(400).json({ error: 'currency required' });

    const dateOnly = dateISO.split('T')[0];
    try {
      const row = selectFx.get(currency, dateOnly);
      if (row && typeof row.rate === 'number') {
        return res.status(200).json({ rate: row.rate, source: 'cache' });
      }
    } catch (e) {
      /* ignore cache read errors */
    }

    const start = new Date(dateISO);
    for (let back = 0; back < 7; back++) {
      const d = new Date(start);
      d.setDate(d.getDate() - back);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const url = `https://www.cbr-xml-daily.ru/archive/${y}/${m}/${day}/daily_json.js`;
      try {
        const r = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!r.ok) continue;
        const j = await r.json();
        const v = j && j.Valute && j.Valute[currency];
        if (
          v &&
          typeof v.Value === 'number' &&
          typeof v.Nominal === 'number' &&
          v.Nominal > 0
        ) {
          const rate = v.Value / v.Nominal;
          const cacheDate = d.toISOString().split('T')[0];
          try {
            upsertFx.run({
              date: cacheDate,
              currency,
              rate,
              source: 'CBR'
            });
          } catch (e) {
            /* ignore cache write */
          }
          return res.status(200).json({
            rate,
            source: 'CBR',
            date: `${y}-${m}-${day}`
          });
        }
      } catch (e) {
        /* try next day */
      }
    }
    return res.status(404).json({ error: 'Rate not found' });
  } catch (e) {
    const msg = e && e.message ? e.message : 'Unknown error';
    return res.status(500).json({ error: msg });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  /* eslint-disable no-console */
  console.log(`Локальный API: http://127.0.0.1:${PORT}`);
});
