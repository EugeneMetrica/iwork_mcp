# Критерии приёмки дорожной карты iwork-mcp

Источник: `docs/roadmap.md` (итерации 2–3) + цель сессии
«все CRUD и эндпоинты Pages / Numbers / Keynote / Pixelmator работают
на одном MCP и по одной логике». Дата фиксации: 2026-08-30.
Версия пакета на момент фиксации: `0.8.8`.

Каждый пункт — наблюдаемый факт, не намерение.

## G0. Один MCP, одна логика

- [x] Один процесс `iwork-mcp` регистрирует все инструменты четырёх
      приложений (`src/index.ts` вызывает `registerNumbersTools` /
      `registerPagesTools` / `registerKeynoteTools` /
      `registerPixelmatorTools`). Нет второго рантайма в пакете.
- [x] Общий контракт ответа: `{ content: [{ type: "text", text }], isError? }`.
- [x] Общий мост: `runJXA` + `handleJXA` + `asLiteral` /
      `AS_LITERAL_JXA_HELPER`. Pixelmator `runDocAS` — адаптер, не второй движок.
- [x] Zod raw shapes + annotations на каждом инструменте
      (`test/registration.test.ts`).
- [x] `bun run sync-counts` чистый: 141 = 50+26+41+24.

## G1. CRUD по приложениям (поведение, не «имя в списке»)

Доказано двумя слоями: `bun run test:e2e` (85 pass / 1 skip / 0 fail)
и независимый grok-4.3 через `bun scripts/agent-crud.ts` (19/19).

### Numbers

- [x] Create: документ, лист (e2e + agent).
- [x] Read: ячейка, таблица, диапазон (e2e); agent read A1=42.
- [x] Update: запись ячейки, формула, формат (e2e).
- [x] Delete: строка, таблица, close (e2e + agent).
- [x] Save / Export: save/reopen (e2e); Microsoft-формат через teardown.

### Pages

- [x] Create: документ с контентом (e2e + agent).
- [x] Read: body, paragraphs, info, tables (e2e; tables via Invoice template).
- [x] Update: replace/format text, write table cells, resize (e2e).
- [x] Delete: delete text, close (e2e + agent).
- [x] Save / Export: save + export PDF (e2e).
- [~] `pages_add_table` UI-scripting: skip при System Events -1719
      (нет AX-окон / залоченная сессия). Read/write существующих таблиц зелёные.

### Keynote

- [x] Create: презентация, слайд, shape/table (e2e + agent).
- [x] Read: slides, content, shape info, slide table (e2e).
- [x] Update: title/body, theme, layout, write table (e2e + agent).
- [x] Delete: delete slide, close (e2e + agent).
- [x] Save / Export: save-path honest error + export PDF (e2e).

### Pixelmator

- [x] Create/Open: disposable copy (e2e + agent).
- [x] Read: document info (e2e + agent).
- [x] Update: select+recolor, crop, layer add/duplicate (e2e).
- [x] Delete: delete layer, close (e2e + agent).
- [x] Save / Export: `.pxd` в `/tmp` отвергается на границе; PNG export (e2e + agent).

Честно вне CRUD (не блокер): Creator Studio ML, slideshow, Pixelmator denoise.

## G2. Итерация 2 — Pixelmator

- [x] 24 инструмента `pixelmator_*` в том же пакете.
- [x] e2e `test/pixelmator.test.ts` 9/9 pass (2026-08-30).
- [x] Teardown: префикс `iwork-mcp-test-`, PNG-артефакты, quit только своих.

## G3. Итерация 3 — Bun 1.4

- [x] `bun --version` = 1.4.0.
- [x] `packageManager: bun@1.4.0`, `engines.bun >= 1.4.0`; скрипты без `tsx`.
- [x] `bun test` гоняет существующие `node:test` файлы: 69 unit pass.
- [x] `bun build --target node` → исполняемый `dist/index.js`;
      `node dist/index.js` печатает `iwork-mcp server running`.
- [x] Coverage в `bun run test` и `.githooks/pre-push`.
- [x] InMemoryTransport под Bun: registration 141 tools.
- [x] Baseline: unit 69; e2e 85 pass + 1 skip (AX), 0 fail.
- [x] Откат изолирован: package.json + bun.lock + CI + hooks.

## G4. CI

- [x] `.github/workflows/ci.yml`: `oven-sh/setup-bun@v2` 1.4.0, без Node-матрицы.
- [x] `spec-validate` жив (Node 22 + openspec 1.11.0).
- [~] Зелёный прогон на GitHub после push — локально unit+sync-counts зелёные;
      CI на ubuntu подтверждается после пуша (не делался в этой сессии).
- [x] Матрица Node 18/22 снята.

## G5. Агентские e2e на независимом grok-4.3

- [x] Headless `xai/grok-4.3` session `sess_e277ee45-5806-4bcf-aecb-3b163caafb59`.
- [x] Первый прогон агента упал на выдуманных аргументах (не на MCP).
      Канонический `scripts/agent-crud.ts` (живые схемы) — 19/19.
      Агент сам перезапустил харнесс и переписал отчёт: **Overall PASS**.
- [x] Отчёт: `test/artifacts/agent-grok-43.md` (gitignored artifacts).
- [x] Разбор: FAIL агента = ошибка агента (row/column vs `cellRef`,
      `slideIndex` vs `slideNumber`, `PNG` vs `png`). Продукт зелёный.

## G6. Изоляция и безопасность e2e

- [x] Никакого close-all. Teardown только `iwork-mcp-test-`.
- [x] Префикс соблюдён в e2e и agent harness.
- [x] Publish / tags / version bump не делались.

## Как закрывать

1. Юнит: `bun run test` — 69 pass (проверено).
2. e2e Mac: `bun run test:e2e` — 85 pass / 1 skip / 0 fail (проверено).
3. Агент: grok-4.3, отчёт в `test/artifacts/agent-grok-43.md` — PASS.
4. OpenSpec: `migrate-to-bun-1-4` review **PASS_WITH_NOTES**, затем archive.
