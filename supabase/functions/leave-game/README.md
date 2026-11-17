# Выход обычного участника — серверный блок WEB-007

POST с Bearer-токеном и JSON `{gameId, requestId}` (UUID). Auth определяет
пользователя; переданный клиентом userId не используется. Обработчик вызывает
`leave_game(p_game_id, p_user_id, p_request_id)` через service_role.
SQL отвечает за права, открытый статус лобби, блокировку комнаты, удаление места
и сохранённый результат повтора. Выход создателя относится к WEB-008.

Успех: HTTP 200 `{gameId}`. LOBBY_NOT_OPEN для запрошенной комнаты — 409.
SQL-коды 22023/P0002/42501/P1002 дают 400/404/403/409. Неизвестные ошибки,
неверные ответы, несовпадение gameId и неизвестный code дают безопасный 500.
Дополнительные поля SQL-ответа не передаются клиенту.

Локальный запуск зависимости в отдельном терминале:

```powershell
postman simulation run postman/simulations/web003.sim.yaml --port 4923 --no-history --output ndjson
```

После события listening:

```powershell
deno check --config supabase/functions/leave-game/deno.json supabase/functions/leave-game/index.ts supabase/functions/leave-game/supabase-http.test.ts
deno test --allow-env --allow-net --config supabase/functions/leave-game/deno.json supabase/functions/leave-game/supabase-http.test.ts supabase/functions/_shared/validation.test.ts
```

Тест запускает настоящий HTTP-обработчик и SDK против существующего проектного
fixture Auth/PostgREST. Повторяет запрос с тем же ID, проверяет RPC/ключи,
подменённый userId, валидацию, отказы и восстановление после недоступного Auth.
Стенд переиспользован без поиска официального mock Supabase. Он задаёт ответы
HTTP и не исполняет транзакции: хранение, повтор после нового входа, блокировки
и атомарность отдельно проверяются `npm run test:db` в PostgreSQL.
Эти тесты не подтверждают облачный Auth/деплой, браузерный путь или реальную
доставку Realtime и отзыв авторизации уже открытого канала.

2026-11-17 миграция 20261116000100 применена к связанному проекту
mrbrfnxpepogfhmwvdbx через CLI 2.109.0. Ранее вручную применённая готовность
ботов сверена по облачному определению add_bot и зарегистрирована в истории
как 20261116000000. Повторный dry-run показал только миграцию выхода.
Облачное чтение подтвердило команду, RLS журнала, серверные права и запрет
клиентского EXECUTE/чтения/вставки журнала, а также триггер DELETE.

leave-game опубликована через --use-api, ACTIVE v1, verify_jwt=false,
по существующей схеме lobby-функций с обязательным Auth.getUser внутри
withAuthenticatedRequest. OPTIONS/GET/POST без токена/POST с неверным токеном
вернули 204/405/401/401 с CORS. Запросы не выполняли игровых изменений.
Успешный выход с настоящей сессией и двухклиентный прогон пока не подтверждены.
