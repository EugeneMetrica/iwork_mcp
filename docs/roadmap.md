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

Цель: Node.js/npm → Bun 1.4 как рантайм и сборщик (см. глобальный стек:
Bun — целевой JS/TS runtime, skill `bun`).

- `package.json`: engines/`packageManager` на Bun; скрипты — `bun run` вместо
  node+npx-цепочек; `tsx` и `typescript`-обвязка сборки заменяются
  `bun build` (tsc остаётся только для `--noEmit`-типизации, если понадобится);
- тесты: `node:test` → `bun:test` (юнит + e2e), `--test`-глобы → bun-раннер;
  `tsx`-импорт из тестов уходит;
- тестовое покрытие: до миграции зафиксировать текущий зелёный baseline
  (58 unit + 77 e2e), после — не хуже; добавить coverage-гейт
  (`bun test --coverage`) в pre-push и CI;
- CI: self-hosted раннеры получают Bun 1.4 (роль `gha-runner`), матрица
  Node 18/22 заменяется на bun-джобу; GitHub CI остаётся ubuntu;
- MCP SDK (`@modelcontextprotocol/sdk`) под Bun — проверить совместимость
  (stdio-транспорт, InMemoryTransport для тестов) до переключения;
- публикация: `npm publish` с bun-built артефактами, `bin`-шей без изменения
  контракта `iwork-mcp install`.

Порядок: baseline → bun:test → bun build → CI → publish-проверка. Откат на
любом шаге — revert package.json/CI (изменения изолированы от src/).

## Вне дорожной карты (пока не запланировано)

Полный hang-protocol (alarm/SIGTERM), GUI mutex, allowlist ФС, слияние в
`metrica-pro/mcp`, замена `keynote_ctl.py` в Аэрофлоте (после паритета MCP).
