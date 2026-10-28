# Изменение вместимости — часть WEB-004

POST с авторизацией Supabase и JSON `{gameId, seatCount}`.
`gameId` — UUID, `seatCount` — число 2, 3 или 4.
`withAuthenticatedRequest` проверяет сессию; обработчик передаёт в
`change_seat_count` параметры `p_game_id`, `p_seat_count` из проверенного тела,
а `p_user_id` — исключительно из Auth. Проверка создателя, занятости и блокировка
комнаты находятся в SQL. Браузер не управляет ID вызывающего пользователя.

Успех: 200 и только `{seat_count}` с подтверждённой запрошенной вместимостью.
Неверное тело/JSON — 400. SQL P0002 — 400 с общей ошибкой
«Невозможно изменить вместимость»: текущая SQL-функция использует один код
для отсутствующей комнаты, чужого пользователя и недопустимого изменения.
Остальные ошибки RPC и неверный/несовпадающий ответ БД — 500.
Auth, настройки, CORS, OPTIONS и неверные методы обрабатывает общая обёртка.
Текст диагностики БД клиенту не передаётся.

## Локальная проверка

В отдельном терминале из корня проекта:

```powershell
postman simulation run postman/simulations/web003.sim.yaml --port 4920 --output ndjson --no-history
```

После события `listening` на порту 4920:

```powershell
deno check --config supabase/functions/change-seat-count/deno.json supabase/functions/change-seat-count/index.ts supabase/functions/change-seat-count/supabase-http.test.ts
deno test --config supabase/functions/change-seat-count/deno.json --allow-net=127.0.0.1 --allow-env=SUPABASE_URL,SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY supabase/functions/change-seat-count/supabase-http.test.ts
npm run check:architecture
```

Остановить запущенную для теста симуляцию через Ctrl+C.

43 шага запускают настоящий HTTP-сервер обработчика и Supabase SDK против
локального fixture: 2/3/4 и повтор, параметры RPC и пользователь из Auth вместо
подставленного ID, разделение ключей, запросы и результаты неправильной формы,
отказы RPC, Auth, настройки, CORS/методы, исключение приватных полей,
недоступный Auth и успешный повтор после восстановления.

Fixture проекта не является официальным mock Supabase; поиск и загрузка mock
владельца не выполнялись. Он написан по SQL-контракту проекта и используемому SDK.
Этот прогон не проверяет настоящую Auth, PostgreSQL/RLS, блокировки или облачный
деплой. Реальные SQL-проверки и конкуренция выполняются через `npm run test:db`.
Фронт и облачный путь изменения вместимости пока не подтверждены.
