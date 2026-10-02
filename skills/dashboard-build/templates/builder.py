#!/usr/bin/env python3
"""Скелет сборщика страницы дашборда.

Инварианты (см. references/builder-checklist.md):
  * геометрия выводится из двух констант — PAD (поле доски) и GAP (зазор);
  * все id детерминированные: uuid5 от (роль, имя), PAGE_ID — константа;
  * единицы измерения задаются одним словарём UNITS и проставляются каждому блоку;
  * в конце прогона печатаются самопроверки; при ошибке код возврата 1.

Шаблон платформенно-нейтральный: он собирает описание раскладки, которое затем переносится
в формат целевой BI (для Fastboard см. references/fastboard-page-json.md).

Запуск:
    python3 builder.py --out page.json          # собрать и проверить
    python3 builder.py --out page.json --quiet  # без отчёта
"""
from __future__ import annotations

import argparse
import json
import sys
import uuid
from pathlib import Path

# ─── Константы сетки (единственный источник геометрии) ────────────────────────
BOARD = {"w": 1600, "h": 1200}
PAD = 20   # поле доски со всех четырёх сторон
GAP = 12   # зазор между блоками внутри ряда и между рядами

# ─── Идентичность страницы ────────────────────────────────────────────────────
PAGE_ID = "3f7c1a52-9d4b-4e0a-8b21-6c5e0d9a7f13"   # константа: новый uuid = новая страница
PAGE_NAME = "Выручка и каналы — главный лист"
NAME_SPACE = uuid.UUID("8f1e0c9a-5b1d-4c2f-9a77-0d1c2b3a4e55")  # пространство имён проекта

# ─── Единицы измерения (один словарь на всю страницу) ─────────────────────────
UNITS = {
    "money":   {"formattingType": "numerical", "editText": "млн ₽", "numberOfZeros": 2},
    "count":   {"formattingType": "numerical", "editText": "шт",    "numberOfZeros": 0},
    "percent": {"formattingType": "percent",   "editText": "",      "numberOfZeros": 1},
}


def uid(role: str, name: str) -> str:
    """Детерминированный id: имя (а не порядок) задаёт значение."""
    if not name:
        raise ValueError("пустое имя объекта: id был бы одинаковым у всех")
    return str(uuid.uuid5(NAME_SPACE, f"{role}|{name}"))


def slots(y: int, height: int, count: int) -> list[dict]:
    """Ряд из count блоков: ширина считается от (доска − 2·поле − (n−1)·зазор)/n."""
    inner = BOARD["w"] - 2 * PAD
    width = (inner - (count - 1) * GAP) // count
    out = []
    for i in range(count):
        out.append({"x": PAD + i * (width + GAP), "y": y, "w": width, "h": height})
    return out


def block(role: str, kind: str, title: str, metric: str, unit: str,
          pos: dict, series: list[dict] | None = None, labels: list[str] | None = None,
          overlay: bool = False) -> dict:
    return {
        "id": uid(role, title),
        "role": role,
        "kind": kind,
        "title": title,
        "metric": metric,
        "unit": unit,
        "x": pos["x"], "y": pos["y"], "w": pos["w"], "h": pos["h"],
        "overlay": overlay,
        "mock": True,                      # страница на заглушках — см. isMock ниже
        "series": series or [],
        "labels": labels or [],
    }


MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг"]


def build() -> dict:
    rows = [
        (120, 4),   # ряд KPI-карточек
        (400, 2),   # два больших графика
        (260, 3),   # три средних блока
        (344, 1),   # таблица на всю ширину
    ]
    y = PAD
    positions: list[list[dict]] = []
    for height, count in rows:
        positions.append(slots(y, height, count))
        y += height + GAP

    kpi, big, mid, table = positions

    blocks = [
        block("kpi", "kpi", "Выручка", "revenue", "money", kpi[0],
              series=[{"name": "Выручка", "value": 13.54}]),
        block("kpi", "kpi", "Заказы", "orders", "count", kpi[1],
              series=[{"name": "Заказы", "value": 99441}]),
        block("kpi", "kpi", "Средний чек", "aov", "money", kpi[2],
              series=[{"name": "Средний чек", "value": 136.2}]),
        block("kpi", "kpi", "Доля повторных", "repeat_share", "percent", kpi[3],
              series=[{"name": "Доля повторных", "value": 3.1}]),

        # оверлей: спарклайн внутри карточки №1 — обязан лежать выше своего фона
        block("overlay", "line", "Спарклайн: Выручка", "revenue", "money",
              {"x": kpi[0]["x"] + 130, "y": kpi[0]["y"] + 50, "w": 240, "h": 52},
              series=[{"name": "Выручка", "value": v} for v in
                      [1.2, 1.4, 1.35, 1.6, 1.75, 1.7, 1.9, 1.85]],
              labels=MONTHS, overlay=True),

        block("chart", "line", "Выручка по месяцам", "revenue", "money", big[0],
              series=[{"name": "Выручка", "value": v} for v in
                      [1.2, 1.4, 1.35, 1.6, 1.75, 1.7, 1.9, 1.85]],
              labels=MONTHS),
        block("chart", "bar", "Выручка по каналам", "revenue", "money", big[1],
              series=[{"name": "Выручка", "value": v} for v in [5.1, 3.2, 2.7, 1.6]],
              labels=["маркетплейс", "сайт", "розница", "партнёры"]),

        block("chart", "pie", "Способы оплаты", "revenue", "money", mid[0],
              series=[{"name": "Способы оплаты", "value": v} for v in [62.0, 21.5, 9.4, 7.1]],
              labels=["карта", "наличные", "перевод", "прочее"]),
        block("chart", "bar", "Топ категорий", "revenue", "money", mid[1],
              series=[{"name": "Топ категорий", "value": v} for v in [3.4, 2.8, 2.1, 1.7, 1.2]],
              labels=["bed_bath_table", "health_beauty", "sports_leisure", "furniture", "computer"]),
        block("chart", "line", "Заказы по неделям", "orders", "count", mid[2],
              series=[{"name": "Заказы", "value": v} for v in [24100, 25800, 24900, 26300]],
              labels=["н-1", "н-2", "н-3", "н-4"]),

        block("table", "table", "Категории: выручка и заказы", "revenue", "money", table[0],
              series=[{"name": "выручка", "value": 3.4}], labels=["bed_bath_table"]),
    ]

    return {
        "page": {
            "id": PAGE_ID,
            "name": PAGE_NAME,
            "target": "fastboard",     # куда переносим; для html-дашборда — "html"
            "board": BOARD,
            "padding": PAD,
            "gap": GAP,
            "isMock": True,            # страница собрана на заглушках, реальных данных нет
            "units": UNITS,
        },
        "blocks": blocks,
    }


# ─── Самопроверки ─────────────────────────────────────────────────────────────
def self_check(page: dict) -> list[str]:
    errors: list[str] = []
    board, pad, gap = page["page"]["board"], page["page"]["padding"], page["page"]["gap"]
    blocks = page["blocks"]

    xs_min = min(b["x"] for b in blocks)
    xs_max = max(b["x"] + b["w"] for b in blocks)
    ys_min = min(b["y"] for b in blocks)
    ys_max = max(b["y"] + b["h"] for b in blocks)
    print(f"  поля доски: слева {xs_min}, справа {board['w'] - xs_max}, "
          f"сверху {ys_min}, снизу {board['h'] - ys_max} (ожидается {pad} со всех сторон)")
    if {xs_min, board["w"] - xs_max, ys_min, board["h"] - ys_max} != {pad}:
        errors.append("поля доски не равны константе PAD")

    ids = [b["id"] for b in blocks]
    for i in ids:
        try:
            uuid.UUID(i)
        except ValueError:
            errors.append(f"id не uuid: {i}")
    if len(set(ids)) != len(ids):
        errors.append("id блоков не уникальны")
    if len(set(ids)) != len({(b["role"], b["title"]) for b in blocks}):
        errors.append("роль+имя не задают id однозначно")

    for b in blocks:
        if b["unit"] not in page["page"]["units"]:
            errors.append(f"{b['title']}: единица «{b['unit']}» не объявлена в UNITS")
        if not b["title"] or not b["metric"]:
            errors.append(f"{b['id']}: пустой заголовок или метрика")
        if b["x"] < pad or b["x"] + b["w"] > board["w"] - pad:
            errors.append(f"{b['title']}: выходит за доску по горизонтали")
        if b["y"] < pad or b["y"] + b["h"] > board["h"] - pad:
            errors.append(f"{b['title']}: выходит за доску по вертикали")
        if page["page"]["isMock"] and not b["mock"]:
            errors.append(f"{b['title']}: на макетной странице блок не помечен заглушкой")

    # зазоры внутри рядов
    rows: dict[int, list[dict]] = {}
    for b in blocks:
        if not b["overlay"]:
            rows.setdefault(b["y"], []).append(b)
    for y, row in sorted(rows.items()):
        row.sort(key=lambda b: b["x"])
        gaps = [row[i + 1]["x"] - (row[i]["x"] + row[i]["w"]) for i in range(len(row) - 1)]
        if any(g != gap for g in gaps):
            errors.append(f"ряд y={y}: зазоры {gaps} вместо {gap}")
    print(f"  ряды: {[(y, len(r)) for y, r in sorted(rows.items())]}")

    # перекрытия (оверлеи перекрывать свой фон вправе)
    for i, a in enumerate(blocks):
        for b in blocks[i + 1:]:
            if a["overlay"] or b["overlay"]:
                continue
            if (a["x"] < b["x"] + b["w"] and b["x"] < a["x"] + a["w"]
                    and a["y"] < b["y"] + b["h"] and b["y"] < a["y"] + a["h"]):
                errors.append(f"пересечение: «{a['title']}» и «{b['title']}»")

    # оверлей выше своего фона (в терминах layering-порядка: оверлеи идут после фонов)
    order = [b["id"] for b in blocks]
    for o in (b for b in blocks if b["overlay"]):
        host = [b for b in blocks if not b["overlay"]
                and b["x"] <= o["x"] and b["y"] <= o["y"]
                and o["x"] + o["w"] <= b["x"] + b["w"] and o["y"] + o["h"] <= b["y"] + b["h"]]
        if not host:
            errors.append(f"оверлей «{o['title']}» не лежит внутри своего фона")
        elif order.index(o["id"]) < order.index(host[0]["id"]):
            errors.append(f"оверлей «{o['title']}» нарисован ниже своего фона")

    second = build()
    if [b["id"] for b in second["blocks"]] != ids:
        errors.append("ids не воспроизводимы: второй прогон дал другой набор")
    return errors


def main() -> int:
    ap = argparse.ArgumentParser(description="Сборщик страницы дашборда (скелет)")
    ap.add_argument("--out", default="page.json", help="куда записать результат")
    ap.add_argument("--quiet", action="store_true", help="не печатать отчёт самопроверок")
    args = ap.parse_args()

    page = build()
    errors = self_check(page)
    if not args.quiet:
        print(f"  блоков: {len(page['blocks'])}, страница {page['page']['name']!r}")
        print(f"  id страницы: {page['page']['id']} (константа, менять нельзя)")

    out = Path(args.out)
    out.write_text(json.dumps(page, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  записано: {out} ({out.stat().st_size} байт)")

    if errors:
        print("\nСАМОПРОВЕРКИ: ошибки", file=sys.stderr)
        for e in errors:
            print(f"  ✗ {e}", file=sys.stderr)
        return 1
    print("  самопроверки: ок" if not args.quiet else "")
    return 0


if __name__ == "__main__":
    sys.exit(main())
