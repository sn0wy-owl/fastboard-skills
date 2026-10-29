---
name: fastboard-ui-browser
description: "Use when working with Fastboard through browser/UI: place widgets, edit a page on the user's stand, inspect data/model settings, handle SQL-form traps, configure RLS/SLS/PLS, apply beauty rules, find SVG icons, or insert SVG into FB. Trigger for «работай через браузер», «поставь виджет», «настрой в конструкторе», «найди SVG», «добавь значки этапов», «вставь SVG в FB», and browser image search. Complements fastboard-dashboard-creator and fastboard-widget-sql; do not use for standalone image editing."
version: 1.0.0
---

# FastBoard: UI / браузерный путь

Навык Грачьи (курс Stepik 246949 + практика UI), **встроенный** в пакет как сосед
`fastboard-dashboard-creator`. Не заменяет MCP Style Packs / `get_data` smoke —
дополняет, когда нужно кликать UI или нет MCP.

**Предпочтительно для сборки/полировки по промпту:**  
[`../fastboard-dashboard-creator/SKILL.md`](../fastboard-dashboard-creator/SKILL.md) +  
[`../fastboard-widget-sql/SKILL.md`](../fastboard-widget-sql/SKILL.md).

**Этот skill** — механика конструктора, ловушки SQL-формы, карта платформы, API round-trip из вкладки.

## Перед началом

1. Инстанс — **целевой стенд пользователя** (не хардкодить demo/stage URL в артефакты). Вход выполняет пользователь (пароли не вводить). Проверь авторизацию скриншотом.
2. Уточни: цель и аудитория, источник данных, KPI/разрезы, референс стиля.
3. Документация: https://help.fastboard.online/

## Порядок работы («чистый» подход из курса)

1. **Макет на виртуальных данных.** Черновики → расставь виджеты → согласуй скриншотом ДО данных.
2. **Данные.** Диспетчер → скрипт загрузки → модель (связи) → **обязательно** «Сохранить модель».
3. **Реальные данные** на виджетах + SQL-форма при необходимости → [references/sql-patterns.md](references/sql-patterns.md).
4. **Интерактивность.** Фильтры, события, drill-down.
5. **Оформление.** «Правила красоты» ниже; для Soft SaaS Cards при наличии MCP — pack `soft-saas` из creator-skill.
6. **Проверка.** Режим просмотра + фильтры; при MCP — ещё `get_data` / [`../fastboard-check/SKILL.md`](../fastboard-check/SKILL.md).

## Механика UI (критично для браузера)

- Виджет/таблица модели: **клик по иконке → клик по холсту** (синтетический drag&drop не работает).
- Клик по точке данных = фильтр (чип сверху). Выделять виджет — по заголовку контейнера.
- Виджеты: Комбинированная, Водопад, Таблица, Тепловая карта, Круговая, Пузырьковая, Медиа-блок (KPI/текст/{{var0}}), Дерево, iFrame, Потоки, SVG, Гант, What-If; фильтры: кнопки, список, период.
- Правая панель виджета: Данные / Вид / События. Пустой холст: проект / страница / палитры / темы.
- Сохранение: дискета — отдельно «Сохранить проект» и «Сохранить модель».

## Ловушки (проверено на практике)

- Excel → все колонки Nullable(String): `sum(toFloat64OrZero(T.Поле))`, сортировка `ORDER BY toInt32OrZero(...)`.
- SQL-редактор: Enter принимает автодополнение — WHERE/GROUP BY/ORDER BY **одной строкой**, потом Escape.
- Ошибка синтаксиса сбрасывает несохранённые секции — править и сохранять по одной.
- Диалект ClickHouse; SELECT/FROM/базовый GROUP BY генерирует платформа.
- Месяцы-строки → сортируй по числовому номеру месяца.
- Новый виджет может упасть «под шапку» при прокрутке — не кликать повторно; список виджетов слева → координаты в Вид.
- Комбо: линия + «Доп. показатель» может не попасть в запрос (баг) — проверять SQL-viewer.
- >7 сегментов — не pie; топ-N — bar по убыванию + лимит в UI.
- ПКМ «Скопировать стиль» тащит и заголовки — восстановить после.
- «Строка итогов» таблицы игнорирует WHERE SQL-формы.
- Водопад: только План/Факт через ƒ; отрицательные накопительные уровни не рисуются.

Подробнее: [references/ui-practice.md](references/ui-practice.md).

## SVG-изображения в FB

Перед поиском или вставкой SVG прочитай [references/svg-images.md](references/svg-images.md).
При доступном браузере ищи изображения через него, открывай и проверяй сам SVG,
а не только превью. Если браузер недоступен или источник не открывается, запроси
у пользователя `.svg` или исходный SVG-код; не подменяй файл emoji или PNG молча.
В FB используй проверенный механизм медиа-блока: переменная `var0`,
`settings.vectorSettings.isVector=true`, `svgContent` и шаблон `{{var0}}`.
После сохранения проверь SVG в браузере; без браузера явно отметь отсутствие
визуальной проверки.

## Правила красоты

- User story сверху вниз: фильтры → KPI → динамика → структура → таблицы.
- Z-паттерн; светло-серый фон страницы, белые карточки; заголовок у каждого виджета.
- Одна палитра на проект; акцент — только главному KPI.
- Свои группы цветов: hex **строчными без #**, apply по blur (Tab).
- 5–9 виджетов на страницу; детали — отдельные страницы / попапы.
- Для Soft SaaS / product: единые chart headers (**18 bold**), dual KPI — см. creator-skill rules.

## Справочники

| Файл | Содержание |
|------|------------|
| [references/sql-patterns.md](references/sql-patterns.md) | SQL в форме виджета, календарь смещений, sumIf |
| [references/platform-map.md](references/platform-map.md) | Роли, SLS/PLS/RLS, коннекторы, CRON |
| [references/ui-practice.md](references/ui-practice.md) | Живые ловушки UI (memory Грачьи) |
| [references/course-knowledge.md](references/course-knowledge.md) | Конспект курса Stepik |
| [references/api-roundtrip.md](references/api-roundtrip.md) | REST из вкладки: visualisations, layers, цвета |
| [references/api-import.md](references/api-import.md) | Экспорт/импорт проекта, schema visualisations_v3 |
| [references/svg-images.md](references/svg-images.md) | Поиск SVG в браузере, запрос файлов у пользователя, вставка в FB и проверка |

SQL-слоты API/MCP (канон): [`../fastboard-widget-sql/SKILL.md`](../fastboard-widget-sql/SKILL.md).
