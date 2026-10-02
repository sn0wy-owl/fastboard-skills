#!/usr/bin/env python3
"""Независимая проверка собранной страницы (результат сборщика).

Смотрит то, что сборщик может не заметить в собственном коде: поля и зазоры, выход за доску,
пересечения, пустые/неуникальные id, единицы, пометку «макет».

Запуск:
    python3 check_page.py page.json [--json]
Код возврата 1, если есть ошибки.
"""
from __future__ import annotations

import argparse
import json
import sys
import uuid
from pathlib import Path


def overlaps(a: dict, b: dict) -> bool:
    return (a["x"] < b["x"] + b["w"] and b["x"] < a["x"] + a["w"]
            and a["y"] < b["y"] + b["h"] and b["y"] < a["y"] + a["h"])


def check(page: dict) -> list[str]:
    errs: list[str] = []
    meta = page.get("page") or {}
    blocks = page.get("blocks") or []
    if not blocks:
        return ["в файле нет блоков"]

    board = meta.get("board") or {}
    pad, gap = meta.get("padding"), meta.get("gap")
    if not board.get("w") or not board.get("h"):
        return ["page.board.w/h не заданы"]
    if pad is None or gap is None:
        errs.append("page.padding / page.gap не заданы: геометрия не выводится из констант")

    try:
        uuid.UUID(str(meta.get("id")))
    except (ValueError, TypeError):
        errs.append("page.id не uuid (или отсутствует) — импорт создаст новую страницу")

    ids = [b.get("id") for b in blocks]
    for i in ids:
        if not i:
            errs.append("блок с пустым id")
            continue
        try:
            uuid.UUID(str(i))
        except ValueError:
            errs.append(f"id не uuid: {i}")
    if len(set(ids)) != len(ids):
        errs.append("id блоков не уникальны")

    if pad is not None:
        xs_min = min(b["x"] for b in blocks)
        xs_max = max(b["x"] + b["w"] for b in blocks)
        ys_min = min(b["y"] for b in blocks)
        ys_max = max(b["y"] + b["h"] for b in blocks)
        pads = {"слева": xs_min, "справа": board["w"] - xs_max,
                "сверху": ys_min, "снизу": board["h"] - ys_max}
        if set(pads.values()) != {pad}:
            errs.append(f"поля доски не равны page.padding={pad}: {pads}")

    for b in blocks:
        for k in ("x", "y", "w", "h"):
            if not isinstance(b.get(k), int) or b[k] <= 0:
                errs.append(f"{b.get('title', b.get('id'))}: {k} не положительное целое")
        if not b.get("title") or not b.get("metric"):
            errs.append(f"{b.get('id')}: пустой заголовок или метрика")
        if b.get("x", 0) < 0 or b.get("y", 0) < 0 or b.get("x", 0) + b.get("w", 0) > board["w"] \
                or b.get("y", 0) + b.get("h", 0) > board["h"]:
            errs.append(f"{b.get('title')}: выходит за границы доски")
        units = (meta.get("units") or {})
        if b.get("unit") not in units:
            errs.append(f"{b.get('title')}: единица «{b.get('unit')}» не объявлена в page.units")
        if not isinstance(b.get("mock"), bool):
            errs.append(f"{b.get('title')}: не указано, заглушка это или реальные данные")
        if meta.get("isMock") and not b.get("mock"):
            errs.append(f"{b.get('title')}: страница помечена макетной, блок — нет")

    if gap is not None:
        rows: dict[int, list[dict]] = {}
        for b in blocks:
            if not b.get("overlay"):
                rows.setdefault(b["y"], []).append(b)
        for y, row in sorted(rows.items()):
            row.sort(key=lambda b: b["x"])
            gaps = [row[i + 1]["x"] - (row[i]["x"] + row[i]["w"]) for i in range(len(row) - 1)]
            if any(g != gap for g in gaps):
                errs.append(f"ряд y={y}: зазоры {gaps} вместо {gap}")
        bands = sorted({(b["y"], b["y"] + b["h"]) for b in blocks if not b.get("overlay")})
        for i in range(len(bands) - 1):
            d = bands[i + 1][0] - bands[i][1]
            if d != gap:
                errs.append(f"зазор между рядами y={bands[i][1]}..{bands[i + 1][0]} равен {d}, ожидался {gap}")

    for i, a in enumerate(blocks):
        for b in blocks[i + 1:]:
            if a.get("overlay") or b.get("overlay"):
                continue
            if overlaps(a, b):
                errs.append(f"пересечение: «{a.get('title')}» и «{b.get('title')}»")

    for o in (b for b in blocks if b.get("overlay")):
        host = [b for b in blocks if not b.get("overlay") and b["x"] <= o["x"] and b["y"] <= o["y"]
                and o["x"] + o["w"] <= b["x"] + b["w"] and o["y"] + o["h"] <= b["y"] + b["h"]]
        if not host:
            errs.append(f"оверлей «{o.get('title')}» не лежит внутри своего фона")

    for b in blocks:
        s, l = b.get("series") or [], b.get("labels") or []
        if s and l and len(s) != len(l):
            errs.append(f"{b.get('title')}: значений {len(s)}, подписей {len(l)}")

    return errs


def main() -> int:
    ap = argparse.ArgumentParser(description="Проверка собранной страницы дашборда")
    ap.add_argument("path", help="JSON, записанный сборщиком")
    ap.add_argument("--json", action="store_true", help="машинный вывод")
    args = ap.parse_args()

    doc = json.loads(Path(args.path).read_text(encoding="utf-8"))
    errs = check(doc)
    if args.json:
        print(json.dumps({"ok": not errs, "errors": errs}, ensure_ascii=False, indent=2))
    elif errs:
        print(f"ОШИБКИ ({len(errs)}):")
        for e in errs:
            print(f"  ✗ {e}")
    else:
        n = len(doc.get("blocks") or [])
        print(f"ок: {n} блоков, поля и зазоры совпадают с константами, id уникальны, "
              f"единицы объявлены, макет помечен")
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
