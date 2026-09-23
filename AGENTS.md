RULES_SPEC.md — источник истины для игровых правил.
Не угадывать данные со статусом needs_decision.
Игровая логика живёт только в packages/game-engine.
Состояние игры неизменяемое: функции возвращают новое состояние.
Изменение правила включает тесты и обновление статуса спецификации.
После изменения движка запускать typecheck и test.
После изменения интерфейса запускать lint, test и build.
Не использовать оригинальные защищённые ассеты и оформление игры.

Если пользователь говорит «давай задачу», использовать `.agents/skills/galerist-task-cycle/SKILL.md`: пользователь пишет код, ассистент выдаёт одну задачу, проверяет реализацию, пишет тесты и обновляет RULES_SPEC.md.

npm run typecheck --workspace=@galerist/game-engine
npm run test --workspace=@galerist/game-engine

npm run lint --workspace=@galerist/web
npm run test --workspace=@galerist/web
npm run build --workspace=@galerist/web
