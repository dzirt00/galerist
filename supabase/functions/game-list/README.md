# Список комнат

GET game-list проверяет сессию через Auth и вызывает get_game_list() одним RPC
от имени service_role. SQL возвращает комнаты, число участников и наличие пароля
в одном снимке данных. Ответ содержит только id, seat_count, occupiedSeatCount,
hasPassword. Неверный ответ RPC отклоняется целиком; лишние поля исключаются.

## Публикация

Перед первой публикацией этой версии применить миграцию
supabase/migrations/20261028000000_get_game_list.sql в SQL Editor проекта
в транзакции BEGIN / COMMIT. Если она уже применена, повторять её не нужно.
Затем из корня репозитория:

```powershell
npx supabase functions deploy game-list --project-ref mrbrfnxpepogfhmwvdbx --no-verify-jwt
```

Проверка токена находится внутри withAuthenticatedRequest;
SQL-функция доступна только серверной роли.

## Проверки

Команды запуска Postman simulation и HTTP-тестов описаны в
postman/mocks/web003-supabase/README.md. Проверяются один RPC после Auth
для 3 и 50 комнат, безопасный DTO, пустой список, CORS, ошибки и повтор.
SQL и права проверяются через npm run test:db.
Локальная simulation не измеряет производительность облачной базы.
