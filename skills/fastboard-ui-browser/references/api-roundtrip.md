# FastBoard API — round-trip JSON для браузерной диагностики

База API `/back`. fetch из вкладки приложения с `credentials:'include'`.
**Сессия**: 401 → сначала `POST /back/api/auth/refresh` (201 — чинит сессию, случается каждые ~10-20 мин); если не помог — пользователь перелогинивается (двойной вход) + reload вкладки.
Диалог «Восстановить?» → **Нет**. «Режим просмотра»: ⚙ на правом рэйле → тумблер.
**URL**: прямой заход на /{pid}/board/{pageId} редиректит в «Черновики» — заходить через список проектов (карточка проекта) или SPA-переключение вкладок страниц. Консоль ETL: /{pid}/console — работает напрямую.
**Координаты computer-кликов**: окно может быть шире скриншота (CSS 1984 vs скрин 1568) — при промахах клик через find/ref.

## КЛЮЧЕВЫЕ ЭНДПОИНТЫ
- GET/PUT виджеты: GET `/v3/project/{pid}/page/{pg}/visualisations` → **{visualisations:[...]}**; PUT `/v3/project/{pid}/visualisations` {payload:[{pageId,visualisations:ПОЛНЫЙ_МАССИВ}]} (новые виджеты = клоны с новыми id прямо в массиве).
- Слои: GET `/v3/project/{pid}/page/{pg}/layers` → {layers:[ids]}; PUT `/v3/project/{pid}/layers` {payload:[{pageId,layers}]} — новые id ДОБАВИТЬ, иначе виджеты не видны.
- Страницы: GET/PUT `/v2/project/{pid}/pages` {projectPages:[...]} — размер страницы в page.boardSettings.sizes{width,height}.
- Палитра: GET `/v2/project/{pid}/palettes` → {projectPalette:[pal]}; PUT — тело **{projectPalettes:[pal]}** (не projectPalette!). Добавление цвета: push в pal.groups[0].colors {h,l,s,id:uuid,hex,opacity:100,name:''} (h/s/l в градусах/%). После PUT ids могут пересоздаться — перечитать палитру перед ссылками.
- get_data: POST `/v1/models/get_data` {project,sql,modelId} — произвольный SELECT для отладки (вложенные подзапросы разрешены).
- CH: POST `/v2/ch` {db,q} — READONLY (db = pid с подчёркиваниями).
- Перехват SQL виджетов: monkey-patch window.fetch (body с 'get_data'), затем SPA-переключить вкладки страниц (полный reload убивает патч; данные кэшируются — повторное переключение не рефетчит).

## СОРТИРОВКА ВИДЖЕТОВ (главное открытие!)
`sqlData.filterAndGroupRequest` — строка, дописываемая к сгенерированному SQL ПОСЛЕ GROUP BY: `"ORDER BY 1 ASC"`, `"ORDER BY 2 DESC"`, или ЛЮБОЕ выражение `"ORDER BY max(tupleElement(<тот же arrayJoin>,N)) ASC"`. Дефолт для графиков: ORDER BY 2 DESC (первый индикатор), без него GROUP BY даёт хэш-порядок.
**ВАЖНО**: выражение в ORDER BY должно использовать ТОТ ЖЕ arrayJoin, что и индикаторы (добавить ord в общий tuple) — отдельный arrayJoin в ORDER BY считается неверно.
Произвольный порядок строк: в исходный tuple добавить поле ord, `ORDER BY max(tupleElement(...,N_ord)) ASC`.

## ДАННЫЕ В ВИДЖЕТАХ
- Поля head-таблицы модели: incision customRequest 'assumeNotNull(tbl.col)', fieldName='tbl.col'; индикаторы 'sum(tbl.col)'.
- **Другие таблицы — подзапросы** (валидатор пропускает, вложенные SELECT тоже):
  - строки с сортировкой: `tupleElement(arrayJoin((SELECT groupArray(tuple(t.segment, toFloat64(t.y), toFloat64(t.ord))) FROM (SELECT ... FROM "tbl" WHERE ... ORDER BY ord) AS t)),1)`; индикатор max(...,2).
  - скаляр (KPI): `max((SELECT any(value) FROM "kpi" WHERE metric LIKE '...%'))`.
  - **строковые колонки таблиц**: формат в SQL — `concat('+', replaceOne(toString(round(t.g, 1)), '.', ','), '%')` → «+13,9%» (float артефакты 9.699999 лечит round; точку в запятую replaceOne).
- KPI-переменная текст-виджета: dataSettings.variables[0].customRequest (top-level!), шаблон в viewSettings.text.text: `«${{var0}} трлн»`; numberOfZeros в variables[0].settings.formatting.formats.
- `[` запрещён валидатором; `"year"` в кавычках = строка-литерал (писать t.col).
- editText (formatting.formats.editText {text,isActive}) — СУФФИКС после числа через пробел («26 %»); плейсхолдеров нет, префикс невозможен.

## ЦВЕТА
- Серия lineAndBar: indicator.settings.elementSettings.colorBySettings{isActive:true, elementColor:{palId:{type:'color',colorId,groupId}}} (indicator.color НЕ работает).
- Парные бары vs стек: indicator.settings.elementSettings.parametersBar.stackNumber — одинаковый=стек, разные (1/2)=парные группы; barMaxWidth {label:16,value:'px'}.
- **Цвет текста колонки таблицы**: у индикатора settings.properties: `isActiveFontColor:true` (ВЫКЛЮЧАТЕЛЬ — без него ничего не красится!) + fontColorBy={type:'condition', byCondition:{alias:'fontColor', colors:[{value:{palId:{type:'color',colorId,groupId}}}], sqlCondition:"if(1 = 1, '1', '1')"}} — sqlCondition возвращает '1'/'2' = НОМЕР цвета из colors[]. Аналогично isActiveBackgroundColor+backgroundColorBy. props.fontColor как hex НЕ работает в таблицах.
- Текст-виджет: viewSettings.text.{fontColor:'#hex', fontSize, fontStyle.bold, padding, lineHeight, alignment} — работает напрямую. Текст рендерится со сдвигом ~+17px вниз от positionConfig.y — учитывать при наложении виджетов.
- Легенда: viewSettings.legendSettings.isShow.
- Заголовок/подзаголовок графика: viewSettings.header.text / description.text.

## ЭКСПОРТ/ИМПОРТ СТРАНИЦ (перенос между проектами, С МОДЕЛЯМИ)
- Экспорт: POST `/v2/project/pages/{pid}/export` {pages:[pageId], exportModels:true}.
- Импорт: POST `/v2/project/pages/{targetPid}/import?newPages=true` — **multipart** FormData поле `file` (Blob JSON) → 201. Создаёт страницу И МОДЕЛЬ.
- Трюк подмены таблицы: строковая замена имени в JSON экспорта; ОСТОРОЖНО — летит в sqlCondition (вычистить).
- UI «Сохранить модель» НЕ работает — модель только через импорт.

## ETL (реальные источники)
1. /{pid}/console → «Создать подключение» → Файл → имя → file_upload в input (пути /mnt/user-data/outputs, xlsx openpyxl, листы=таблицы) → «Обновить предпросмотр» → «Создать» → отметить таблицы → Далее (DROP) → «Сохранить» → «Запустить» → «Загрузка прошла успешно».
2. Второе подключение добавляет секции в общий скрипт — старые таблицы перезагружаются вместе.

## ТРИГГЕРЫ / POP-UP / ФИЛЬТРЫ
- Переменная страницы + variablesSettings (кнопка status:'true', попап control.view.isActive:true); попапы в конец layers; позиция = positionConfig.
- Попап: isFiltering+isInfluenceItself; клик по неключевой колонке → пустота (фильтр по activeIncisionId).
- Сброса drill-чипа у кнопок НЕТ — только ✕ на чипе. KPI-формулы в ifNull(...,0).

## ПРОЕКТНЫЕ ДАННЫЕ
Конкретные идентификаторы проектов, источники, локальные макеты и боевые данные
не включаются в reference-файл. Для проверки используй обезличенный проект на целевом стенде.
