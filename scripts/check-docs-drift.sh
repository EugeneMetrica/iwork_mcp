#!/usr/bin/env bash
# check-docs-drift.sh — гейт против расхождения регламента с его копиями/проекциями.
#
# Канон — AGENTS.md. У него есть потребители, которые физически живут отдельно и
# поэтому способны разойтись:
#
#   1) CLAUDE.md — файл, который авто-загружает Claude Code. AGENTS.md он НЕ читает:
#      проверено прогонами `claude -p` с канарейкой (симлинк → знает; только
#      AGENTS.md → не знает). Держим симлинком; байт-в-байт копия допускается
#      (файловые системы без симлинков), разошедшаяся копия — нет.
#
#   2) openspec/config.yaml (если проект использует OpenSpec) — прозаическая
#      ПРОЕКЦИЯ регламента, которую CLI инъектит в артефакты. Автоматически её не
#      вывести, поэтому здесь хранится отпечаток канона: изменили AGENTS.md —
#      перечитайте проекцию и подтвердите.
#
# Usage:
#   bash scripts/check-docs-drift.sh          # проверить (CI)
#   bash scripts/check-docs-drift.sh --accept # подтвердить после сверки проекции
set -euo pipefail

# Корень репозитория; вне git — на уровень выше scripts/.
if root="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  cd "$root"
else
  cd "$(dirname "$0")/.."
fi

CANON="${CANON:-AGENTS.md}"
MIRROR="${MIRROR:-CLAUDE.md}"
CONFIG="${CONFIG:-openspec/config.yaml}"
FINGERPRINT_KEY="# agents-md-sha256:"

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

fail=0

# --- 1. Канон на месте ------------------------------------------------------
if [[ ! -f "$CANON" ]]; then
  echo "✗ $CANON не найден — это канонический регламент проекта" >&2
  exit 1
fi
canon_hash="$(sha256 "$CANON")"

# --- 2. CLAUDE.md идентичен канону -----------------------------------------
if [[ -L "$MIRROR" ]]; then
  target="$(readlink "$MIRROR")"
  if [[ "$target" == "$CANON" || "$target" == "./$CANON" ]]; then
    echo "✓ $MIRROR → $CANON (симлинк)"
  elif [[ "$target" = /* ]]; then
    # Абсолютный симлинк указывает на путь ЭТОЙ машины: git сохранит его как есть,
    # и в любом другом клоне CLAUDE.md станет битой ссылкой — регламент молча
    # перестанет загружаться.
    echo "✗ $MIRROR — симлинк по абсолютному пути '$target': в другом клоне он сломается" >&2
    echo "  почините: ln -sfn $CANON $MIRROR" >&2
    fail=1
  else
    echo "✗ $MIRROR — симлинк на '$target', а должен указывать на '$CANON'" >&2
    echo "  почините: ln -sfn $CANON $MIRROR" >&2
    fail=1
  fi
elif [[ -f "$MIRROR" ]]; then
  if ! diff -q "$CANON" "$MIRROR" >/dev/null; then
    echo "✗ DRIFT: $MIRROR — копия, разошедшаяся с $CANON:" >&2
    diff -u "$CANON" "$MIRROR" | head -40 >&2
    echo "  почините: ln -sfn $CANON $MIRROR   (правки вносятся только в $CANON)" >&2
    fail=1
  else
    echo "✓ $MIRROR совпадает с $CANON байт-в-байт (симлинк надёжнее: ln -sfn $CANON $MIRROR)"
  fi
else
  echo "✗ $MIRROR отсутствует — Claude Code не загрузит регламент ($CANON он не читает)" >&2
  echo "  почините: ln -sfn $CANON $MIRROR" >&2
  fail=1
fi

# --- 3. Отпечаток канона в проекции OpenSpec (если проект её использует) ----
if [[ ! -f "$CONFIG" ]]; then
  if [[ "${1:-}" == "--accept" ]]; then
    echo "✓ $CONFIG нет (проект без OpenSpec) — подтверждать нечего"
    exit 0
  fi
  echo "– $CONFIG нет — проект без OpenSpec, проверка проекции пропущена"
else
  recorded="$(grep -m1 -F "$FINGERPRINT_KEY" "$CONFIG" 2>/dev/null | awk '{print $NF}' || true)"

  if [[ "${1:-}" == "--accept" ]]; then
    if [[ -n "$recorded" ]]; then
      tmp="$(mktemp)"
      sed "s|^${FINGERPRINT_KEY}.*|${FINGERPRINT_KEY} ${canon_hash}|" "$CONFIG" > "$tmp"
      mv "$tmp" "$CONFIG"
    else
      printf '\n%s %s\n' "$FINGERPRINT_KEY" "$canon_hash" >> "$CONFIG"
    fi
    echo "✓ отпечаток обновлён: $canon_hash"
    echo "  закоммитьте $CONFIG вместе с правкой $CANON"
    exit 0
  fi

  if [[ -z "$recorded" ]]; then
    echo "✗ в $CONFIG нет отпечатка '$FINGERPRINT_KEY'" >&2
    echo "  сверьте context/rules с $CANON, затем: mise run drift-accept" >&2
    fail=1
  elif [[ "$recorded" != "$canon_hash" ]]; then
    echo "✗ DRIFT: $CANON изменился, а проекция в $CONFIG не пересмотрена" >&2
    echo "    записан:  $recorded" >&2
    echo "    актуален: $canon_hash" >&2
    echo "  перечитайте context/rules — правило, которое вы поменяли, могло попасть" >&2
    echo "  в проекцию. Затем подтвердите: mise run drift-accept" >&2
    fail=1
  else
    echo "✓ $CONFIG синхронизирован с $CANON ($canon_hash)"
  fi
fi

if [[ "$fail" -ne 0 ]]; then
  echo "DOCS DRIFT GATE FAILED" >&2
  exit 1
fi
echo "DOCS DRIFT GATE PASSED"
