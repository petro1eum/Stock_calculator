# Архив облачного runtime (Vercel + Supabase)

Каталог `vercel-supabase-api/` содержит прежние serverless-обработчики для Vercel (`api/*.ts`), которые обращались к Supabase. Они **не используются** основным приложением после перехода на локальный сервер (`server/index.js`) и SQLite.

Если нужно снова запустить что-то из этого кода — установите `@supabase/supabase-js` и `@vercel/node` в отдельном окружении и настройте переменные Supabase.

## Скрипты `scripts-legacy/`

- `fill-costs-direct.js`
- `refresh_portfolio_cov.js`

Требуют пакет `@supabase/supabase-js` и учётные данные проекта.
