# Локальная проверка game-list (WEB-003)

Mock моделирует GET-запросы Supabase Auth/PostgREST для списка и серверного
чтения хеша, а также POST RPC join_game. Написан локально по миграциям комнат
и присоединения и формату установленного SDK. Mock владельца Supabase не искали и не загружали:
использован локальный fixture проекта, внешние workspace не изменялись.
Это не проверка подлинности токенов, PostgreSQL или RLS.

В одном терминале из корня репозитория:

```powershell
postman simulation run postman/simulations/web003.sim.yaml --port 4918 --output ndjson
```

После события `listening` во втором терминале:

```powershell
deno test --config supabase/functions/create-game/deno.json --allow-net=127.0.0.1 --allow-env=SUPABASE_URL,SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY supabase/functions/game-list/supabase-http.test.ts
```

Используется существующая конфигурация импортов create-game с SDK 2.118.0.
Тест поднимает настоящий HTTP-сервер обработчика game-list, SDK не подменяет.
Все ключи синтетические; URL зависимостей указывает только на loopback.
Переменные окружения восстанавливаются, HTTP-сервер теста закрывается.
Симуляцию после прогона остановить Ctrl+C.

23 сценария проверяют список комнат с разной вместимостью, отдельные счётчики,
признак пароля, заполненную комнату, пустой список, CORS/preflight, методы,
авторизацию, ошибки трёх таблиц (в том числе после готового элемента),
отсутствующие настройки, исключение создания клиента и повтор после отказа.
Проверки захваченных HTTP-запросов подтверждают разделение Auth/service-role
ключей, фильтры по конкретному game_id, ограничение столбцов и отсутствие записи.

Управляющие маршруты `__test/reset` и `__test/state` предназначены только для
локального теста. Состояние хранится под ключом `web003-supabase:state`.
Неизвестные маршруты возвращают 501. Не развёртывать этот fixture публично.
Дополнительный `supabase/functions/join-game/supabase-http.test.ts` проверяет
присоединение (32 шага) и PBKDF2 по независимому результату node:crypto.
Fixture сохраняет членство для повторов; реальную блокировку и конкуренцию
проверяет `npm run test:db`, а не mock.

Дополнительный `supabase/functions/ready-to-game/supabase-http.test.ts` проверяет
готовность (29 шагов). Fixture моделирует RPC ready_to_game и хранит готовность
по паре gameId/userId; реальная SQL-функция проверяется отдельно тестами БД.
Команды и границы проверки — в `supabase/functions/ready-to-game/README.md`.

Дополнительный `supabase/functions/get-game-players/supabase-http.test.ts` проверяет
чтение состава (36 шагов) на отдельном порту 4919. Fixture моделирует RPC
get_game_players, используя readyMembers: проверяет членство и возвращает
user_id/is_ready выбранной комнаты в порядке user_id. Команды и границы —
в `supabase/functions/get-game-players/README.md`.

Симуляция не доказывает права реальной БД, её согласованность при конкурентных
изменениях, облачный деплой или браузерный путь. Они проверяются отдельно.
