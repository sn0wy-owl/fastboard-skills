# SQL в виджетах FastBoard (диалект ClickHouse)

Каждый виджет с реальными данными шлёт свой запрос в проектную БД (ClickHouse). Итоговые запросы всех виджетов видны в правой панели SQL; клик по виджету оставляет только его запрос.

Пользователь пишет ТОЛЬКО: выражения разрезов, выражения показателей, WHERE / GROUP BY / HAVING / ORDER BY. Платформа сама генерирует: скелет SELECT, секцию FROM (из модели данных), базовую группировку по разрезам, применение текущей выборки (фильтров).

Порядок операторов: WHERE → GROUP BY → HAVING → ORDER BY.

## Базовые паттерны

- Формат даты для РФ: `formatDateTime(date, '%d.%m.%Y')` — результат строка! Для сортировки добавь `GROUP BY date ORDER BY date` (гранулярность совпадает — значения не множатся).
- Средний чек: `SUM(receipts.sum) / COUNT(DISTINCT receipt_id) AS "Средний чек"`.
- Исключить возвраты: `WHERE operation_type <> 'Возврат'`.
- Порог по показателю: `HAVING COUNT(DISTINCT receipt_id) > 200`.
- Доля по условию: `sumIf(receipts.sum, operation_type = 'Возврат') / sum(receipts.sum)`.
- Сортировка по позиции: `ORDER BY 1`, `ORDER BY 2 DESC` — обязательна при drill-down (в запрос попадает только текущий разрез, прямое имя поля может отсутствовать).
- Лимит (топ-N) — включай в интерфейсе (тумблер «Лимит»), не в SQL.
- Строковые колонки из Excel: `toFloat64OrZero(x)`, `toInt32OrZero(x)`, `toDateOrNull(x)`.

## Показатель «на дату» рядом с показателями за период

В KPI (медиа-блоке) под капотом LIMIT 1: достаточно `GROUP BY date ORDER BY date DESC`.
В общем случае (в одном запросе с периодными показателями):

```sql
arraySum(
  arrayMap(
    (p_period, p_entity, p_value),
    lambda(),
    if(p_period = MAX(month_id) AND p_entity = 'Задолженность', p_value, 0),
    groupArray(month_id),
    groupArray(entity),
    groupArray(value)
  )
) AS "Задолженность на дату"
```

Период должен быть числовым (year, month_id = YYYYMM, date_id = YYYYMMDD). GROUP BY/ORDER BY не нужны.

## Сравнение с прошлым периодом: календарь со смещениями

Лучший способ (устойчив к граничным датам 29–31 числа): справочник-календарь с полем offset ('0', '-1M', '-1Y', ...), join к фактам по `date_id UInt32 = toYYYYMMDD(date)`, фильтр «Календарь» — по полю calendar.date.

```sql
sumIf(receipts.sum, offset = '0')  / pow(10,6) AS curr_revenue,
sumIf(receipts.sum, offset = '-1M') / pow(10,6) AS prev_revenue,
curr_revenue / prev_revenue - 1 AS delta
```

Минусы: каждый показатель обязан уточнять offset; календарь множит строки по числу смещений — загружай только нужные offset и осторожнее с большими данными.

## Скрипт загрузки (структура)

```
Table "имя"
Delete @@@ DROP TABLE IF EXISTS "имя" @@@            -- или ALTER для инкремента
Create @@@ CREATE TABLE IF NOT EXISTS "имя" (...) ENGINE = MergeTree() ORDER BY tuple() @@@
Source "подключение"
Read @@@ SELECT ... @@@
Optimize @@@ OPTIMIZE TABLE "имя" DEDUPLICATE @@@     -- опционально
```

Режимы: DROP (пересоздание) / ALTER (инкрементальная загрузка; при изменении CREATE обязательно согласовывать структуру). Можно читать таблицы других проектов через внутренний ClickHouse (`"uuid_проекта".таблица`). Русские имена транслитерируются автоматически (Kanal_prodazh, Summa_rub).
