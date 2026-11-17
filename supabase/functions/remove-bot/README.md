# Удаление бота — серверный блок WEB-007

POST с Bearer-токеном и JSON `{gameId, requestId, seat_id}` (UUID).
Личность берётся из Auth; клиентский userId не используется.
Обработчик вызывает `remove_bot` с p_user_id из Auth и тремя параметрами запроса
через service_role. SQL владеет проверкой прав/цели/статуса, блокировкой комнаты,
удалением конкретного места и сохранённым результатом повтора.

Успех: HTTP 200 `{gameId}`. LOBBY_NOT_OPEN — 409. SQL-коды
22023/P0002/42501/P1002 преобразуются в 400/404/403/409.
Неизвестный code, неверный ответ или чужой gameId не становятся успехом.
Дополнительные поля и SQL/SDK-диагностика не передаются клиенту.

Локальный стенд (после события listening запускаются тесты):

```powershell
postman simulation run postman/simulations/web003.sim.yaml --port 4923 --no-history --output ndjson
deno check --config supabase/functions/remove-bot/deno.json supabase/functions/remove-bot/index.ts supabase/functions/remove-bot/supabase-http.test.ts
deno test --allow-env --allow-net --config supabase/functions/remove-bot/deno.json supabase/functions/remove-bot/supabase-http.test.ts supabase/functions/remove-bot/contract.test.ts supabase/functions/_shared/validation.test.ts
```

2026-11-17: Deno check и все 7 тестов (40 HTTP-шагов) прошли.
Настоящий HTTP-обработчик и SDK обращались к существующему локальному fixture
Auth/PostgREST; захваченные вызовы проверяют идентификаторы, Auth и разделение
ключей. В simulation-журнале наблюдались 22 запроса к remove_bot.
Стенд задаёт ответы зависимости, не исполняет SQL и не доказывает идемпотентность
БД. Последняя, блокировки, атомарность и RLS проверены отдельно через
`npm run test:db` на одноразовом PostgreSQL 17.

Фронтовый `verify:web` прошёл: 327 тестов, lint без ошибок (5 предупреждений),
production build успешен. 5 тестов удаления покрывают отправку, подтверждённое
перечитывание без Realtime, потерянный ответ с подтверждённым отсутствием цели,
восстановление чтения и повтор запроса, запрет клика по другому боту при
сохранённом запросе. Они используют mock SDK и не заменяют ручной браузерный
прогон или проверку реальной доставки Realtime.

2026-11-17 по запросу пользователя миграция 20261117000000 применена к
mrbrfnxpepogfhmwvdbx через Supabase CLI 2.109.0. Dry-run показал только эту
миграцию. Облачное чтение подтвердило запись истории, remove_bot, RLS журнала,
серверные EXECUTE/INSERT и отсутствие клиентских EXECUTE/SELECT.
remove-bot опубликована через --use-api, ACTIVE v1, verify_jwt=false,
по существующей схеме lobby-функций с обязательным Auth.getUser внутри
withAuthenticatedRequest. OPTIONS/GET/POST без токена/POST с неверным токеном
вернули 204/405/401/401 с CORS. Игровые данные при проверке не менялись.
Фронт не публиковался; успешное удаление с настоящей сессией и два браузера
после публикации пока не проверены.
