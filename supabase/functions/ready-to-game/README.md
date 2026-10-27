# Изменение готовности участника (часть WEB-004)

POST с авторизацией Supabase и JSON `{gameId, isReady}`. `gameId` — UUID,
`isReady` — boolean; false допустим. Обёртка withAuthenticatedRequest проверяет
токен. ID пользователя берётся только из Auth, переданный клиентом ID игнорируется.
Серверный клиент вызывает SQL ready_to_game(p_game_id, p_user_id, p_is_ready).
Успех — 200 и `{isReady}`; ответ БД проверяется на форму и совпадение готовности.

Ошибки: 400 — неверный JSON/payload или SQL 22023; 401 — нет действительной
авторизации; 404 — SQL P0002 (нет комнаты/участия); 405 — неверный метод;
503 — недоступность Auth; 500 — остальные серверные ошибки и неверный DTO.
Внутренние сообщения БД в ответ не включаются. OPTIONS возвращает 204 с CORS.

## Локальные проверки

Из корня проекта запустить симуляцию и дождаться события listening:

```powershell
postman simulation run postman/simulations/web003.sim.yaml --port 4918 --output ndjson --no-history
```

В другом терминале:

```powershell
deno check --config supabase/functions/ready-to-game/deno.json supabase/functions/ready-to-game/index.ts supabase/functions/ready-to-game/supabase-http.test.ts
deno test --config supabase/functions/ready-to-game/deno.json --allow-net=127.0.0.1 --allow-env=SUPABASE_URL,SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY supabase/functions/ready-to-game/supabase-http.test.ts supabase/functions/join-game/supabase-http.test.ts supabase/functions/game-list/supabase-http.test.ts
npm run test:db
npm run check:architecture
```

После HTTP-тестов остановить симуляцию через Ctrl+C. Все ключи синтетические,
внешние сервисы не вызываются. SQL-тесты используют временный PostgreSQL в Docker.
HTTP-тест использует настоящий SDK и HTTP-сервер обработчика, проверяет вызовы
Auth/REST RPC по журналу fixture. Mock написан в проекте по локальной SQL-схеме
и SDK, не получен от владельца Supabase. Это не доказательство облачного Auth,
PostgREST, RLS, публикации функции или работы интерфейса в браузере.

29 HTTP-сценариев проверяют true/false и повтор, пользователя из Auth,
неверные входы, отказ постороннему, коды SQL/Auth, неверный DTO,
отсутствующие настройки, CORS/методы, лишние приватные поля ответа,
недоступность upstream и восстановление после отказа.
