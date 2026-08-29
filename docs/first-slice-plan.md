# Первый срез iwork_mcp: быстрые фиксы + перенос из Аэрофлота + линт/e2e

Код в этом документе не описывается как уже сделанный — это план первого среза.

Рабочий каталог: `/Users/imac/work/mcp/iwork` (отдельный git, origin `EugeneMetrica/iwork_mcp`). В `metrica-pro/mcp` не вливаем. `openspec/` в `iwork/` этим срезом не трогаем.

## Что можно взять быстро

Из `keynote-ops` Аэрофлота — не весь `keynote_ctl.py`, а контракт, который уже доказан на RU Keynote:

1. **Нормализация имён** — NFC + NBSP `\xa0` + `—` → `-` (`_norm` из `keynote_ctl.py`).
2. **Карта RU↔EN** для тем и макетов: `Простая белая`/`White`, `Пустой`/`Blank`, `Заголовок и пункты`/`Bullets`, `Только заголовок`/`Title`.
3. **Таймауты по операции**, не 30 с на всё: create/image 90 с, export 180 с.
4. **Размер дека при create** — 1920×1080 (как ctl).
5. **Hang-минимум** — после timeout не retry тот же AE; человекочитаемое «hung». Полный perl-alarm/SIGTERM — не в этом срезе.
6. **Цвет текста title/body** и `add-movie` — не в этом срезе (нужен отдельный tool + проверка sdef).

## Что чинить сразу (баги)

| Приоритет | Баг | Где |
|---|---|---|
| P0 | AppleScript quoting: JS `\"` вместо AS `""` → инъекция/поломка имён | `keynote.ts` master slides / set layout / add slide / compound; `pages.ts` `asQuote`; `numbers.ts` chart `doc.name()` без quote |
| P0 | `install` при битом JSON затирает весь Claude Desktop config | `src/install.ts` |
| P0 | Integration `after` закрывает **все** открытые документы без сохранения | `test/{numbers,pages,keynote}.test.ts` |
| P1 | `isCreatorStudio()` = «любой CS на диске», не per-app | `src/jxa.ts` |
| P1 | CS `save` без `filePath` врёт `{saved:true}` | save tools в трёх файлах |
| P1 | Таймаут osascript → сырое `exit null` | `runJXA` в `jxa.ts` |

## Что вынести (дубли, без большого рефакторинга)

Не пилить `numbers.ts` на модули в этом срезе. Только то, что копипаста один-в-один:

- `handleJXA` + `toolResult` — три копии в `tools/{numbers,pages,keynote}.ts` → `src/handle-jxa.ts`
- `asLiteral()` (удваивать `"`, резать CR/LF) — один модуль, импорт в Keynote AS-bridge, Pages `asQuote`, Numbers chart
- `isCreatorStudio(app?: IWorkApp)` рядом с уже существующим `resolveAppName`

Слои «runtime / locale / fs policy / tools» — следующий change, не этот.

## Линтеры и pre-push на этом Mac

Сейчас у nested `iwork/.git` **нет** `core.hooksPath`. Хуки монорепо `mcp/.githooks` iwork не видят.

В самом `iwork`:

- ESLint (typescript-eslint, `strictTypeChecked`) + `npm run lint` = `eslint src test`
- `npm run typecheck` = `tsc --noEmit`
- `npm test` — unit, как сейчас (ubuntu CI без изменений по сути)
- `npm run test:e2e` — нынешний `test:integration`, но **только свои** доки (префикс `iwork-mcp-test-`)
- `.githooks/pre-commit` — lint + typecheck
- `.githooks/pre-push` — lint + typecheck + unit; на Darwin ещё `test:e2e` (если Keynote/Pages/Numbers есть, иначе skip)
- `git config core.hooksPath .githooks` — локально, в README одна строка

GitHub CI: ubuntu как сейчас (build + unit). e2e в облако не тащим — нет iWork. Локальный Mac = единственный e2e-gate.

Не гонять e2e, пока не починен close-all: иначе сотрётся чужая работа в Keynote.

## Порядок работ

1. P0 quoting + install + безопасный teardown тестов + unit на quoting/install.
2. Вынести `handleJXA` / `asLiteral` / `isCreatorStudio(app)`.
3. Locale matcher + timeouts + width/height на Keynote create.
4. ESLint + hooks + `test:e2e` только своих доков.
5. На этой машине: unit, lint, затем e2e Keynote smoke (create → list layouts с RU/EN alias → close только теста).

## Вне среза

- `add-movie`, palette / `set-text-color`
- полный hang-protocol (alarm-quit / SIGTERM)
- mutex GUI
- allowlist ФС
- merge в `metrica-pro/mcp`
- замена `keynote_ctl.py`
