# Настройки комнаты — часть WEB-004

POST с Bearer-токеном Supabase и JSON `{gameId, seatCount, turnDurationMinutes}`.
Вместимость — 2/3/4, длительность — целые минуты 1–10. Оба поля обязательны.
`withAuthenticatedRequest` получает пользователя из Auth. Обработчик вызывает
`change_settings_game(p_game_id, p_user_id, p_seat_count, p_turn_duration_minutes)`
серверной ролью. SQL проверяет создателя, блокирует строку комнаты и сохраняет
оба поля одной операцией. Уменьшение ниже занятости отклоняется. Повтор безопасен,
в том числе изменение только таймера при прежней вместимости.

Успех: 200, `{seat_count, turnDurationMinutes}`. Обработчик проверяет совпадение
обоих значений с запросом и исключает остальные поля SQL-ответа.
Неверное тело/JSON — 400. SQL P0002 — 400 с общей ошибкой
«Невозможно изменить настройки комнаты». Остальные ошибки/неверный ответ БД — 500.
Auth, CORS, OPTIONS и запрет других методов обеспечивает общая HTTP-обёртка.

Сохранённые минуты также возвращаются в `join-game` и `game-list`. UI хранит
выбор отдельно от подтверждённых настроек, сохраняет выбор при отказе и обновляет
обе настройки в лобби/списке только после корректного ответа. Сохранение настройки
не запускает отсчёт. Паузы, серверный таймер, боты и Realtime не входят в этот блок.

## Локальная проверка

```powershell
postman simulation run postman/simulations/web003.sim.yaml --port 4920 --output ndjson --no-history
```

После `listening` в другом терминале:

```powershell
deno test --config supabase/functions/change-settings-game/deno.json --allow-net=127.0.0.1 --allow-env=SUPABASE_URL,SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY supabase/functions/change-settings-game/supabase-http.test.ts
npm run test:db
npm run verify:web
npm run check:architecture
```

Остановить симуляцию через Ctrl+C. HTTP-тест использует настоящий обработчик и SDK
против mock проекта; это не официальный mock Supabase и не доказательство
облачных Auth/RLS/SQL. SQL и конкуренция проверяются в одноразовом PostgreSQL 17.

## Публикация этой версии

Предыдущая миграция `20261028000200_create_games.sql` должна быть применена.
Применить **один раз** `supabase/migrations/20261028000300_change_seat_count.sql`
в SQL Editor проекта внутри `BEGIN; … COMMIT;`. Она создаёт `change_settings_game`,
удаляет прежнюю SQL-функцию `change_seat_count` и обновляет чтение настроек.
Миграцию и обработчики обновлять в одном окне обслуживания: прежний обработчик
вместимости после замены SQL-функции работать не будет.

```powershell
npx supabase functions deploy change-settings-game --project-ref mrbrfnxpepogfhmwvdbx --no-verify-jwt
npx supabase functions deploy join-game --project-ref mrbrfnxpepogfhmwvdbx --no-verify-jwt
npx supabase functions deploy game-list --project-ref mrbrfnxpepogfhmwvdbx --no-verify-jwt
```

Проверка токена сохранена внутри обработчиков. Обновить UI и проверить: вход в
комнату с сохранёнными 3 минутами → создатель сохраняет 7 при прежней вместимости →
повторный вход и обновление списка показывают 7. Обычный участник получает отказ;
недопустимая вместимость не меняет ни одно поле. Старый endpoint `change-seat-count`
новым UI не используется. Этот документ описывает публикацию, но не подтверждает
её выполнение.
