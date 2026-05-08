# Локальный запуск без Vercel/Supabase

1. Установка зависимостей: `npm install`
2. В одном терминале: `npm run server` — API на `http://127.0.0.1:3001`, SQLite-файл `data/local.db`.
3. В другом: `npm start` — CRA использует `proxy` на тот же порт, запросы вида `/api/fx` уходят на локальный сервер.

Либо одной командой: `npm run dev:full`.

### Переменные

- `PORT` — порт сервера (по умолчанию 3001).
- `SQLITE_PATH` — путь к файлу БД вместо `data/local.db`.
- `REACT_APP_API_BASE` — если фронт открыт не через CRA (статика), укажите базовый URL API, например `http://127.0.0.1:3001`.

### Устаревший облачный runtime

Код Vercel serverless + интеграции Supabase для этих эндпоинтов перенесён в `deploy-archive/vercel-supabase-api/`.
