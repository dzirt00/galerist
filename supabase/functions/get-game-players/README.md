# Чтение состава лобби — часть WEB-004

POST с авторизацией Supabase и JSON `{gameId}` (UUID комнаты).
`withAuthenticatedRequest` проверяет токен. Сервер вызывает
`get_game_players(p_game_id, p_user_id)`, передавая пользователя только из Auth.
SQL проверяет участие и возвращает состав выбранной комнаты.

Успех: 200 и `{gameId, players: [{user_id, isReady}]}`. Готовность — boolean.
Обработчик проверяет форму записей БД и выбирает только публичные поля.
Ошибки: 400 — JSON/payload или SQL 22023; 401 — нет действительной сессии;
404 — SQL P0002 (комната/участие не найдены); 405 — неверный метод;
503 — Auth недоступна; 500 — настройки, прочие ошибки БД или неверный ответ БД.
OPTIONS возвращает 204, ответы содержат CORS. Диагностика БД не раскрывается.

## Локальные проверки

В отдельном терминале из корня проекта (для этого теста используется порт 4919):

```powershell
postman simulation run postman/simulations/web003.sim.yaml --port 4919 --output ndjson --no-history
```

После события `listening`:

```powershell
deno check --config supabase/functions/get-game-players/deno.json supabase/functions/get-game-players/index.ts supabase/functions/get-game-players/supabase-http.test.ts
deno test --config supabase/functions/get-game-players/deno.json --allow-net=127.0.0.1 --allow-env=SUPABASE_URL,SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY supabase/functions/get-game-players/supabase-http.test.ts
npm run test:db
npm run check:architecture
```

Остановить эту симуляцию через Ctrl+C после тестов. Прежние HTTP-тесты
game-list/join-game/ready-to-game используют отдельный порт 4918.

36 шагов теста используют настоящий HTTP-сервер обработчика и Supabase SDK.
Проверяются состав и DTO, готовность true/false при свежем чтении, один участник,
изоляция комнат, пользователь из Auth вместо подставленного ID, HTTP-запросы
и разделение ключей, некорректные payload и записи БД, отсутствие частичного
списка при повреждённой записи, исключение приватных полей, ошибки Auth/RPC,
методы, CORS, настройки и восстановление после недоступного upstream.

Fixture написан в проекте по миграции и установленному SDK, не получен от
владельца Supabase. Тест не подтверждает облачную Auth/RLS, реальное выполнение
SQL, конкурентную согласованность, публикацию или браузерный путь. SQL-функция
проверяется отдельно в `supabase/tests/get-game-players.sql` на PostgreSQL.
Обновление данных fixture между чтениями не является прогоном двух браузеров.
