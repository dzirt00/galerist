# Добавление бота — серверный HTTP-блок WEB-004

POST с Bearer-токеном Supabase и JSON `{gameId, requestId}`; оба поля — UUID.
Пользователь определяется `withAuthenticatedRequest` через Auth. Обработчик
вызывает `add_bot(p_game_id, p_user_id, p_request_id)` отдельным service-role
клиентом; переданные браузером userId/seat_id не используются.
Права, вместимость и сохранение результата повтора принадлежат SQL-команде.

Успех: HTTP 200 `{gameId, seat_id}`. `seat_id` не сравнивается с requestId.
Сохранённый результат повтора проходит ту же проверку DTO и совпадения gameId.
Ожидаемый JSON-отказ `LOBBY_NOT_OPEN` для запрошенной комнаты даёт 409.
SQL-коды 22023/P0002/42501/P1002 преобразуются в 400/404/403/409 с подготовленным
текстом. Неизвестные ошибки, неверные DTO и чужой gameId дают 500.
Внутренняя диагностика и дополнительные поля RPC в ответ не копируются.

## Локальная проверка

В отдельном терминале из корня проекта:

```powershell
postman simulation run postman/simulations/web003.sim.yaml --port 4921 --no-history --output ndjson
```

После события listening:

```powershell
deno check --config supabase/functions/add-bot/deno.json supabase/functions/add-bot/index.ts supabase/functions/add-bot/supabase-http.test.ts
deno test --allow-env --allow-net --config supabase/functions/add-bot/deno.json supabase/functions/add-bot/supabase-http.test.ts supabase/functions/_shared/validation.test.ts
```

Остановить симуляцию через Ctrl+C после проверки.
HTTP-тест запускает настоящий обработчик на временном локальном порту и
использует настоящий SDK против fixture Auth/PostgREST. Проверяет параметры,
разделение ключей, повтор ID запроса, ошибки, DTO, CORS и отказ зависимостей.
Fixture написан в проекте по SQL-контракту и существующим SDK-вызовам;
это не официальный mock Supabase. Он возвращает заданные ответы RPC,
не реализует SQL-транзакцию и не доказывает идемпотентность хранения.
Настоящие блокировки, вместимость и атомарность отдельно проверяет test:db.

2026-11-11 обработчик опубликован в проект mrbrfnxpepogfhmwvdbx, версия 1,
ACTIVE. С отдельного разрешения пользователя verify_jwt=false; проверка
Auth.getUser внутри обработчика сохранена. Облачные OPTIONS/GET/POST без токена
и POST с неверным токеном вернули 204/405/401/401 с CORS. Миграция
20261110000200 применена и зарегистрирована в истории.

Клиентская кнопка и чтение
состава с ботами реализованы и проверены с mock invoke в
apps/web/test/add-bot.test.ts: подтверждённое перечитывание без Realtime,
ожидание и блокировка, одинаковый запрос при повторе, новый ID после успеха,
некорректные ответы, ошибка генерации ID, ошибка чтения и размонтирование.
Общий npm run verify:web включает эти сценарии. Они не доказывают успешное
добавление с настоящей пользовательской сессией, доставку Realtime и работу
двух браузеров; этот ручной прогон остаётся впереди.
