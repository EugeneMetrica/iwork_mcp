---
name: opsx-review
description: ОБЯЗАТЕЛЬНЫЙ шлюз независимого ревью для OpenSpec-change — между /opsx:apply и /opsx:archive. Read-only, 7 проходов, вердикт PASS / PASS_WITH_NOTES / FAIL. Цикл opsx (propose → apply → archive) собственного ревью кода НЕ содержит; архивация при FAIL запрещена. Вызывай сразу после того, как /opsx:apply закрыл последнюю задачу в tasks.md, и перед /opsx:archive.
context: fork
agent: sdd-reviewer
argument-hint: "[change-name]"
license: MIT
---

Проведи независимое ревью реализации OpenSpec-change: $ARGUMENTS

> Язык отчёта: русский.

> **Почему этот скилл существует.** В цикле OpenSpec `propose → apply → archive` нет шага
> ревью кода: `/opsx:apply` закрывает чекбоксы в `tasks.md` и останавливается, `/opsx:archive`
> сливает delta-спеки в source-of-truth, ничего не проверяя. Единственное упоминание review
> в генерируемых скиллах — приглашение человеку глазами посмотреть артефакты в `/opsx:propose`.
> Этот скилл закрывает разрыв: **автор реализации не ревьюит сам себя**, ревьюер работает
> в изолированном контексте и read-only.
>
> **Скилл не генерируется CLI.** `openspec update` перезаписывает только `.claude/skills/openspec-*/`
> и `.claude/commands/opsx/` — имя `opsx-review` намеренно не попадает под эти маски и переживает
> апгрейд. По той же причине здесь НЕТ файла команды в `.claude/commands/opsx/` — он лежал бы
> в затираемом каталоге.

## Контекст change

- Change: !`openspec list --json 2>/dev/null | head -40 || echo "openspec CLI недоступен"`
- Артефакты: !`ls openspec/changes/$0/ 2>/dev/null || echo "change $0 не найден — уточни имя через openspec list"`
- Статус задач: !`openspec status --change "$0" --json 2>/dev/null | head -60`
- Diff реализации: !`git diff --stat HEAD~$(git log --oneline --grep="$0" 2>/dev/null | wc -l | tr -d ' ')..HEAD 2>/dev/null | tail -15 || git diff --stat 2>/dev/null | tail -15`

Если store указан (standalone OpenSpec-репозиторий) — добавляй `--store <id>` ко всем командам
`openspec`, как это делают генерируемые скиллы.

## Порядок работы

1. **Определи change.** Имя из `$ARGUMENTS`; если не задано — вывести из контекста или
   `openspec list --json`. Всегда объявляй: «Ревью change: `<name>`».

2. **Загрузи канон проекта** (в этом порядке, что найдётся):
   - `.claude/steering/tech.md`, `structure.md`, `product.md` — если проект гибридный (SDD + OpenSpec);
   - `AGENTS.md` / `CLAUDE.md` — канонический регламент в OpenSpec-only проекте;
   - `openspec/config.yaml` — `context` (указатель на канон) и `rules` по 4 артефактам:
     **правила из `rules.tasks` и `rules.design` — это критерии ревью, а не пожелания.**
   Нарушение канона = CRITICAL независимо от того, как выглядит задача.

3. **Загрузи регламент тестирования** — skill `test-review` (единый источник правды:
   TDD RED→GREEN→REFACTOR, антипаттерны A1–A9 + `no-red-run`, выбор слоя, Playwright-for-UI,
   severity, формат вердикта). Если скилла в проекте нет — применяй правила из `rules.tasks`
   конфига и зафиксируй в отчёте, что канонический регламент недоступен.

4. **Прочитай артефакты change**:
   - `openspec/changes/$0/proposal.md` — зачем и границы (Non-goals!);
   - `openspec/changes/$0/specs/*/spec.md` — **delta-спеки: каждый `#### Scenario:`
     (Given/When/Then) — это acceptance criterion**, по нему и проверяется реализация;
   - `openspec/changes/$0/design.md` — принятые технические решения;
   - `openspec/changes/$0/tasks.md` — что заявлено сделанным.

5. **Прочитай реализацию** — каждый файл, затронутый change (по `tasks.md` и git diff).

6. **Выполни 7 проходов** — [checklists/review-passes.md](checklists/review-passes.md).

7. **Прогони гейты** (read-only, не чинить):
   - командой из `rules.tasks` конфига («Gate before archive: …») — она зеркалит CI;
   - `openspec validate --all --strict` — структура markdown (это НЕ замена сборке/тестам).

8. **Выведи отчёт** и вердикт. **Ничего не модифицируй** — ни кода, ни артефактов, ни чекбоксов.

## Формат отчёта

```markdown
# OpenSpec Review: <change-name>

## Вердикт: PASS / PASS_WITH_NOTES / FAIL

| Проход | Статус | Замечания |
|--------|--------|-----------|
| A. Соответствие delta-спекам | PASS/FAIL | ... |
| B. Архитектура и канон | PASS/FAIL | ... |
| C. Качество кода | PASS/FAIL | ... |
| D. Тесты и TDD-дисциплина | PASS/FAIL | ... |
| E. Безопасность | PASS/FAIL | ... |
| F. Полнота и границы proposal | PASS/FAIL | ... |
| G. Гейты и CI-готовность | PASS/FAIL | ... |

## Сценарии delta-спек

| Capability | Scenario | Статус | Где реализовано / чем покрыто |
|------------|----------|--------|-------------------------------|
| ... | ... | DONE / PARTIAL / MISSING | file:line + test:line |

## Задачи tasks.md

| # | Задача | Отмечена | Фактически | Расхождение |
|---|--------|----------|-----------|-------------|

## Замечания

blocking_issues:
  - rule: A3 | no-red-run | steering:structure.md#layers | rules.tasks:<цитата> | ...
    location: path/to/file.ext:LN
    why: одно предложение — что нарушено и почему блокирует
notes:
  - LOW-наблюдения (не блокируют)

## Гейты
- <команда из rules.tasks>: PASS / FAIL (вывод)
- openspec validate --all --strict: PASS / FAIL

## Решение
[архивировать / исправить блокеры и перезапустить /opsx-review]
```

## Severity и правила вердикта

Канонически — `test-review` §7. Кратко:

- **CRITICAL** (блокирует archive): нарушение канона/steering, красные тесты, security,
  антипаттерны A1/A3/A7/A8/A9, `no-red-run`, UI-фича без зелёного headless-e2e,
  сценарий delta-спеки со статусом MISSING, отмеченная задача, которая фактически не сделана.
- **HIGH**: сценарий PARTIAL, отсутствует тест на сценарий, вышли за Non-goals proposal.
- **LOW**: стиль, naming, A4/A5.

Все проходы PASS и нет CRITICAL/HIGH → `PASS`. Только LOW → `PASS_WITH_NOTES`.
Любой CRITICAL или HIGH → `FAIL` с непустым `blocking_issues`.

## Жёсткие правила

- **СТРОГО READ-ONLY.** Нет Edit/Write, нет коммитов, чекбоксы в `tasks.md` не трогать.
- **`/opsx:archive` при вердикте `FAIL` запрещён.** Сначала исправление блокеров автором,
  затем повторный `/opsx-review`. Архивация сливает delta-спеки в source-of-truth —
  архивировать непроверенное значит закрепить дефект как описание системы.
- **Автор реализации не ревьюит себя.** Скилл запускается в форкнутом контексте субагентом
  `sdd-reviewer`; если субагент недоступен — ревью ведёт отдельная сессия, а не та, что писала код.
- **Зелёный `openspec validate` ≠ рабочий код.** Валидатор проверяет только структуру markdown.
- Ревьюер сообщает о проблемах и не чинит их.
