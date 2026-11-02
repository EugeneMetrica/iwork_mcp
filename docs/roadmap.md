# Дорожная карта iwork-mcp

План следующих итераций после первого среза (`docs/first-slice-plan.md`,
OpenSpec change `first-slice`). Каждая итерация — отдельный OpenSpec change
(`/opsx:propose`), порядок внутри — по приоритету.

## Итерация 2 — Pixelmator: перенос pixelmator-ops в iwork-mcp

Источник: проект Аэрофлот `/Users/imac/lab/Аэрофлот` — skill
`.claude/skills/pixelmator-ops/SKILL.md` и карта AppleScript-команд
`.claude/skills/pixelmator-ops/assets/applescript-map.md`, скрипт
`scripts/pixelmator_ops.py` (Pixelmator Pro 3.8, osascript).

Цель: дополнить iwork-mcp инструментами `pixelmator_*` — тот же
детерминированный CRUD, что у Numbers/Pages/Keynote, но для редактора кадра:
открытие копии документа (SHA-256 + устойчивый `doc-id`), список документов,
слои, точная перекраска по HEX (`select` + `--mode fill`), crop/resize/rotate,
adjustments, merge видимых, remove background, экспорт PNG/JPEG, save-as `.pxd`.

Принципы (наследуются от первого среза):
- JXA по умолчанию, NSAppleScript-мост там, где JXA-словарь сломан,
  UI-scripting — последнее средство (Accessibility);
- экранирование через общий `asLiteral`, таймауты по операции, hang-минимум;
- per-app определение установки (Pixelmator Pro опционален — тулзы
  регистрируются всегда, ошибаются понятным сообщением без приложения);
- регистрация тулв = изменение счётчика → `npm run sync-counts`;
- e2e на Mac с Pixelmator, teardown по правилам `test-isolation`
  (префикс `iwork-mcp-test-`, выгрузка артефактов, quit только своих приложений).

Не в итерации: генеративные шаги (остаются в `/xai-gen` в Аэрофлоте),
кисти/healing — словарь Pixelmator их не даёт детерминированно.

## Итерация 3 — Переход рантайма и сборки на Bun 1.4

Статус 2026-08-30: OpenSpec change `migrate-to-bun-1-4` применён.
Dev/test/build — Bun 1.4 (`bun test` с coverage, `bun build --target node`).
Published bin остаётся Node-совместимым (`npx iwork-mcp`). CI ubuntu —
`oven-sh/setup-bun@v2` 1.4.0, без матрицы Node 18/22. Baseline после
миграции: 69 unit + 85 e2e pass (1 skip: Pages UI-table без AX-окон).
Файлы тестов по-прежнему импортируют `node:test`; их гоняет `bun test`.
Откат — revert package.json / bun.lock / CI / hooks.

## Вне дорожной карты (пока не запланировано)

Полный hang-protocol (alarm/SIGTERM), GUI mutex, allowlist ФС, слияние в
`metrica-pro/mcp`, замена `keynote_ctl.py` в Аэрофлоте (после паритета MCP).
