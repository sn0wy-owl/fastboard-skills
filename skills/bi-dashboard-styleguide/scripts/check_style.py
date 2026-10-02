#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""check_style.py — независимая проверка стиля страницы BI-платформы (формат Fastboard).

Читает готовую выгрузку страницы и печатает отчёт по правилам стиля. Ничего не знает о том,
чем страница собрана, поэтому ловит то, чего не видит сборщик: донорские шрифты, включённую
сетку, чужие тексты в настройках, разные настройки у виджетов одного типа.

Запуск:
    python3 check_style.py page.json
    python3 check_style.py page.json --json
    python3 check_style.py page.json --scale 12,14,16,20,28 --base 4
    python3 check_style.py page.json --forbidden "Ось показателей,Итоги,Montserrat"

Код возврата: 1 — есть нарушения, 0 — чисто.
"""
import argparse
import json
import re
import sys

AX3 = ("axisIncisionSettings", "axisIndicatorSettings", "axisAdditionalIndicatorSettings")

DEFAULT_FORBIDDEN = (
    "Ось показателей", "Ось доп. показателей", "Подзаголовок", "Итоги",
    "Montserrat", "Arial", "Roboto",
)

# ключевые настройки, которые обязаны совпадать у виджетов одного типа
SIGNATURE = (
    "viewSettings/header/fontSize",
    "viewSettings/header/fontFamilySettings/isActive",
    "viewSettings/paddingSettings",
    "viewSettings/styleContainerSettings/backgroundSettings/blur",
    "viewSettings/styleContainerSettings/borderSettings/isActive",
    "viewSettings/styleContainerSettings/borderSettings/radius",
    "viewSettings/styleContainerSettings/shadowSettings/isActive",
    "viewSettings/horizontalZoom/isShow",
    "viewSettings/verticalZoom/isShow",
    "viewSettings/legendSettings/isShow",
    "viewSettings/axisIncisionSettings/showAxis",
    "viewSettings/axisIncisionSettings/showGrid",
    "viewSettings/axisIncisionSettings/tickLabel/position",
    "viewSettings/axisIndicatorSettings/showAxis",
    "viewSettings/axisIndicatorSettings/showGrid",
    "viewSettings/axisAdditionalIndicatorSettings/showAxis",
    "viewSettings/axisAdditionalIndicatorSettings/showGrid",
)


def leaves(obj, path="", out=None):
    """Все листья дерева: {путь: значение}."""
    if out is None:
        out = {}
    if isinstance(obj, dict):
        for key, value in obj.items():
            leaves(value, path + "/" + str(key), out)
    elif isinstance(obj, list):
        for i, value in enumerate(obj):
            leaves(value, path + "[%d]" % i, out)
    else:
        out[path] = obj
    return out


def load_page(path):
    data = json.load(open(path, encoding="utf-8"))
    if isinstance(data, dict) and "pagesSettings" in data:
        pages = data["pagesSettings"]
        if not pages:
            raise SystemExit("в файле нет ни одной страницы")
        return pages[0]
    return data


def props(sec):
    """Секция текста может быть плоской или с вложенным properties."""
    if not isinstance(sec, dict):
        return {}
    return sec.get("properties") if isinstance(sec.get("properties"), dict) else sec


def level_of(sec):
    fc = (sec or {}).get("fontColor")
    if isinstance(fc, dict):
        for value in fc.values():
            if isinstance(value, dict) and "level" in value:
                return value["level"]
    return None


def style_of(w):
    return (w.get("viewSettings") or {}).get("styleContainerSettings") or {}


def axes_of(w):
    vs = w.get("viewSettings") or {}
    return [(key, vs.get(key)) for key in AX3 if isinstance(vs.get(key), dict)]


def check(page, scale, base, forbidden):
    ws = page.get("visualizationsV3") or []
    filters = page.get("filtersV3") or []
    groups = page.get("groupsVisualizationsV3") or []
    objs = ws + filters + groups          # фильтры и группа тоже несут стиль: шрифт, фон, паддинги
    rules = []

    def add(name, ok, detail=""):
        rules.append((name, bool(ok), detail))

    # 1. кегли видимых надписей из шкалы
    sizes = set()
    for w in ws:
        vs = w.get("viewSettings") or {}
        ds = w.get("dataSettings") or {}
        header = vs.get("header") or {}
        if header.get("isShow") and header.get("fontSize"):
            sizes.add(header["fontSize"])
        for _, ax in axes_of(w):
            if not ax.get("isShow"):
                continue
            for part in ("label", "tickLabel", "name"):
                sec = ax.get(part)
                pr = props(sec)
                if pr.get("fontSize"):
                    sizes.add(pr["fontSize"])
                value = (sec or {}).get("value")
                if part == "label" and isinstance(value, int) and value:
                    sizes.add(value)
        legend = vs.get("legendSettings") or {}
        if legend.get("isShow") and (legend.get("properties") or {}).get("fontSize"):
            sizes.add(legend["properties"]["fontSize"])
        for ind in ds.get("indicators") or []:
            show_value = (ind.get("settings") or {}).get("showValue") or {}
            if show_value.get("isShow"):
                pr = props(show_value)
                if pr.get("fontSize"):
                    sizes.add(pr["fontSize"])
        label_size = (vs.get("styleSettings") or {}).get("labelSize")
        if isinstance(label_size, dict) and label_size.get("value"):
            sizes.add(label_size["value"])
        if w.get("visualisationType") == "table":
            for sec in ((vs.get("headerSettings") or {}).get("properties"),
                        (vs.get("bodySettings") or {}).get("propertiesIncisions")):
                if isinstance(sec, dict) and sec.get("fontSize"):
                    sizes.add(sec["fontSize"])
        for var in ds.get("variables") or []:
            tps = (((var.get("settings") or {}).get("textPropertiesSettings")) or {})
            if tps.get("fontSize"):
                sizes.add(tps["fontSize"])
    for flt in filters:
        bt = (((flt.get("buttonSettings") or {}).get("textPropertiesSettings")) or {})
        if bt.get("fontSize"):
            sizes.add(bt["fontSize"])
    outside = sorted(s for s in sizes if s not in scale)
    add("кегли всех видимых надписей из шкалы %s" % (list(scale),), not outside, outside or "вне шкалы нет")

    # 2. уровни темы у надписей
    bad_levels = []
    for w in objs:
        for path, value in leaves(w).items():
            if path.rsplit("/", 1)[-1] != "level" or not isinstance(value, int):
                continue
            if value in (1, 2, 3, 4):
                continue
            if value == 5 and "headerSettings/properties/backgroundColor" in path:
                continue
            bad_levels.append("%s %s = level %s" % (w.get("viewSettings", {}).get("name", "?")[:24], path[-40:], value))
    add("уровни темы только 1–4 (level 5 — лишь фон шапки таблицы)", not bad_levels, bad_levels[:4] or "нет")

    # 3. сетка и линии осей
    grid = ["%s / %s" % (w.get("viewSettings", {}).get("name", "?")[:22], key)
            for w in ws for key, ax in axes_of(w)
            if ax.get("showGrid") or ax.get("showAxis")]
    add("сетка и линии осей выключены", not grid, grid[:4] or "нет")

    # 4. шрифт темы
    fonts = []
    for w in objs:
        for path, value in leaves(w.get("viewSettings") or {}).items():
            if path.endswith("fontFamilySettings/fontFamily") and value:
                fonts.append("%s %s" % (w.get("viewSettings", {}).get("name", "?")[:22], value))
            if path.endswith("fontFamilySettings/isActive") and value is True:
                fonts.append("%s isActive" % w.get("viewSettings", {}).get("name", "?")[:22])
        for path, value in leaves(w).items():
            if path.endswith("fontFamilySettings/fontFamily") and value:
                fonts.append("%s %s" % ((w.get("name") or "?"), value))
    add("нет активных шрифтов донора", not fonts, sorted(set(fonts))[:4] or "нет")

    # 5. донорские тексты
    raw = json.dumps(page, ensure_ascii=False)
    found = [word for word in forbidden if word in raw]
    add("в настройках нет донорских текстов", not found, found or "нет")

    # 6. подложка
    blurs = sorted({(style_of(w).get("backgroundSettings") or {}).get("blur") for w in objs}
                   - {None}, key=str)
    add("blur подложки = 0 у всех", set(blurs) <= {0}, blurs or "подложек нет")

    # 7. рамка и радиус
    bset = {(style_of(w).get("borderSettings") or {}).get("isActive",
                                                          "нет") for w in objs}
    brad = {(style_of(w).get("borderSettings") or {}).get("radius") for w in objs}
    brad.discard(None)
    add("рамка выключена, радиус один у всех",
        True not in bset and len(brad) <= 1, {"isActive": sorted(map(str, bset)), "radius": sorted(map(str, brad))})

    # 8. тени
    shadows = {str((style_of(w).get("shadowSettings") or {}).get("isActive")) for w in objs}
    add("тени выключены", shadows <= {"False", "None"}, sorted(shadows))

    # 9. зум
    zooms = ["%s %s" % (w.get("viewSettings", {}).get("name", "?")[:22], key)
             for w in ws for key in ("verticalZoom", "horizontalZoom")
             if isinstance((w.get("viewSettings") or {}).get(key), dict)
             and (w["viewSettings"][key].get("isShow") is True)]
    add("зум и прокрутка погашены", not zooms, zooms[:4] or "нет")

    # 10. легенда
    legend_bad = []
    for w in ws:
        vs = w.get("viewSettings") or {}
        legend = vs.get("legendSettings") or {}
        indicators = (w.get("dataSettings") or {}).get("indicators") or []
        vtype = w.get("visualisationType")
        if vtype == "pie" and legend.get("isShow") is not True:
            legend_bad.append("%s: у круговой легенда выключена" % vs.get("name", "?")[:24])
        if vtype in ("lineAndBar", "table") and len(indicators) == 1 and legend.get("isShow") is True:
            legend_bad.append("%s: легенда у односерийного" % vs.get("name", "?")[:24])
    add("легенда — только у круговой / многосерийных", not legend_bad, legend_bad[:4] or "нет")

    # 11. бары от нуля
    bars = ["%s / %s" % (w.get("viewSettings", {}).get("name", "?")[:22], ind.get("name"))
            for w in ws for ind in ((w.get("dataSettings") or {}).get("indicators") or [])
            if isinstance(ind.get("fictionalMinAndMax"), dict)
            and ind["fictionalMinAndMax"].get("min") not in (0, None)]
    add("столбцы от нуля", not bars, bars[:4] or "нет")

    # 12. линии сплошные
    dotted = ["%s / %s" % (w.get("viewSettings", {}).get("name", "?")[:22], ind.get("name"))
              for w in ws for ind in ((w.get("dataSettings") or {}).get("indicators") or [])
              if (((ind.get("settings") or {}).get("elementSettings") or {}).get("parameters") or {})
              .get("isDotted") is True]
    add("линии сплошные (isDotted=false)", not dotted, dotted[:4] or "нет")

    # 13. панель инструментов
    toolbox = sorted({w.get("viewSettings", {}).get("name", "?")[:24] for w in ws
                      if ((w.get("viewSettings") or {}).get("toolboxSettings") or {}).get("isShow")})
    only_tables = all(w.get("visualisationType") == "table" for w in ws
                      if ((w.get("viewSettings") or {}).get("toolboxSettings") or {}).get("isShow"))
    add("панель инструментов только у таблиц", only_tables, toolbox or "нет")

    # 14. метка ИИ
    ai = [w.get("viewSettings", {}).get("name", "?")[:24] for w in ws
          if (w.get("viewSettings") or {}).get("showAiGenerated") is True]
    add("метка «сделано ИИ» снята", not ai, ai[:4] or "нет")

    # 15. отступы кратны базе
    odd = []
    for w in objs:
        for path, value in leaves(w).items():
            last = path.rsplit("/", 1)[-1]
            if not isinstance(value, int) or value == 0 or value % base == 0:
                continue
            if "zoom" in path.lower():          # спящие настройки зума — не отступы раскладки
                continue
            if last.endswith("Padding") or "/indentation/" in path or "/padding/" in path:
                who = (w.get("viewSettings") or {}).get("name") or w.get("name") or "?"
                odd.append("%s %s = %s" % (who[:20], last, value))
    add("отступы кратны %d" % base, not odd, sorted(set(odd))[:5] or "нет")

    # 16. единообразие виджетов одного типа
    groups = {}
    for w in ws:
        flat = leaves(w)
        signature = {path: json.dumps(flat.get(path), ensure_ascii=False, sort_keys=True) for path in SIGNATURE}
        for key, ax in axes_of(w):
            signature["name:" + key] = json.dumps((ax.get("name") or {}).get("text"))
        signature["zoom"] = json.dumps(((w.get("viewSettings") or {}).get("horizontalZoom") or {}).get("settings"),
                                       sort_keys=True)
        groups.setdefault(w.get("visualisationType"), []).append((w.get("viewSettings", {}).get("name", "?"), signature))
    mixed = {}
    for vtype, items in groups.items():
        first = items[0][1]
        diff = sorted({key for _, sig in items[1:] for key in sig
                       if json.dumps(sig.get(key), sort_keys=True) != json.dumps(first.get(key), sort_keys=True)})
        if diff:
            mixed[vtype] = diff
    add("виджеты одного типа совпадают по настройкам", not mixed, mixed or "нет расхождений")

    return rules


def main():
    ap = argparse.ArgumentParser(description="Проверка стиля страницы BI (формат Fastboard)")
    ap.add_argument("page", help="файл выгрузки страницы (*.json)")
    ap.add_argument("--scale", default="12,14,16,20,28", help="допустимые кегли через запятую")
    ap.add_argument("--base", type=int, default=4, help="база шкалы отступов (по умолчанию 4)")
    ap.add_argument("--forbidden", default="", help="дополнительные стоп-слова через запятую")
    ap.add_argument("--allow-text", default="", help="слова-исключения для стоп-списка, через запятую")
    ap.add_argument("--json", action="store_true", help="отчёт машинно")
    args = ap.parse_args()

    scale = tuple(int(x) for x in re.split(r"[,\s]+", args.scale.strip()) if x)
    forbidden = list(DEFAULT_FORBIDDEN) + [x for x in re.split(r"[,\s]+", args.forbidden.strip()) if x]
    allowed = {x for x in re.split(r"[,\s]+", args.allow_text.strip()) if x}
    forbidden = [word for word in forbidden if word not in allowed]

    page = load_page(args.page)
    rules = check(page, scale, args.base, forbidden)
    failed = [(name, detail) for name, ok, detail in rules if not ok]

    if args.json:
        print(json.dumps({"page": args.page, "rules": [
            {"rule": n, "ok": ok, "detail": d} for n, ok, d in rules],
            "failed": len(failed), "name": page.get("page", {}).get("name")}, ensure_ascii=False, indent=2))
    else:
        print("проверка стиля: %s" % page.get("page", {}).get("name", args.page))
        for name, ok, detail in rules:
            print("   %-6s %s%s" % ("OK" if ok else "ПРОВАЛ", name, "" if ok else " → %s" % (detail,)))
        print("ИТОГ: %s" % ("все правила выполнены (%d)" % len(rules) if not failed
                            else "нарушено правил: %d" % len(failed)))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
