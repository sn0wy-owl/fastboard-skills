# Fastboard: страница дашборда в JSON

Специфика конкретной платформы для этапа 3 основного скилла. Загружать перед сборкой страницы,
если целевая платформа — Fastboard (у других BI свои форматы, но инварианты сборщика те же).

## Форма файла

```
{ "pagesSettings": [ { "page": {id,name,color,image,isHidden,variables,boardSettings,
                                accessSettings,isShowWorkSpace,autoRefreshSettings},
                     "visualizationsV3": [виджет…], "groupsVisualizationsV3": [],
                     "filtersV3": [], "enabledFiltersV3": [], "indeces": {layers:[…]},
                     "filterListAgree": [] } ],
  "models":     [ {id,name,modelItems:[{db,alias,table,…}],isMaterialized,…} ],
  "metaModels": [ {id, zoom, modelItems:[{alias,table,config}]} ] }
```

Виджет: `id, pageId, visualisationType, isBlock, isVisible,
events{goTo, goToHref, activateTo, activateObject, variablesSettings, transitionSettings,
filterSettings{isFiltering, applyToAllPages, responseToExternalDrillDown}},
sqlData{isFreeMode, freeModeSql, raw*Sql, filterAndGroupRequest},
dataSettings{type,limit,barType,modelId,incisions[],indicators[],variables[],isRealData,
activeIncisionId,isDrillDown,rotateTo90}, viewSettings{20–30 секций},
positionConfig{x,y,width,height,sticking}, backgroundImagesSettings`.

Типы `visualisationType`, встреченные в бою: `text`, `table`, `lineAndBar`, `heatmap`, `gantt`,
`svg`, `pie`. Карта, отдельный «индикатор» и прогрессбар 0–100 в выгрузках не встречались —
формат не выдумывать, а запросить образец (пользователь собирает один виджет в UI и выгружает
страницу).

## Привязка к данным

- Поле пишется как `alias.column` (например `union_data.fact`), alias — элемент `modelItems`.
- Операция — `indicators[].operationType`: `sum | avg | count | min | max | other`.
- Разрез (группировка) — `incisions[]`; иерархия дат — несколько разрезов по порядку.
- KPI-карточка в этих проектах = `text` (фон + подпись) + `lineAndBar` с одним показателем
  высотой ~45 px («прогрессбар»).
- `positionConfig.width/height` — в px, доска — `page.boardSettings.sizes` (чистая страница —
  1600×1200).
- **Виртуальные данные — запасные значения, а не переключатель режима:**
  `dataSettings.incisions[].fictionalData` (значения разреза) и
  `dataSettings.indicators[].fictionalMinAndMax` (`{min, max}`). Встречаются вместе с
  `isRealData: true` и живым `modelId`; без модели виджет рисуется именно по ним, а после выбора
  модели они перестают использоваться. Клонируя виджет, переписывать их явно — иначе в макет
  уезжают «январь…декабрь» донора, а диапазон — из чужой метрики.
- `columns_meta` в модели бывает пустым: колонки платформа подтягивает из таблицы.

## Что обязательно в этом формате

1. **Каркас страницы — из чистого экспорта платформы**, а не по догадке. Валидатор режет файл,
   если `page.color` = `{isActive,value}` (нужно `{color,isActive}`), `page.image` =
   `{isActive,value}` (нужно `{link,proportionsImageType}`) или в `indeces` нет `pageId`
   (нужно `{layers:[], pageId}`). Просить у пользователя экспорт пустой новой страницы — это
   готовый эталон каркаса, оттуда же ширина доски.
2. **Наборы ключей** `viewSettings` / `dataSettings` / `positionConfig` у нового виджета должны
   совпадать с образцом того же типа: круговая — не «режим линейчатой», у неё свои ключи.
3. **Сантайз** — см. `builder-checklist.md` §4. Главная ловушка: унаследованный SQL
   (`sqlData.filterAndGroupRequest`, `indicators[].customRequest`, `incisions[].settings.
   properties.backgroundColorBy.byCondition.sqlCondition`) с запросами чужого проекта.
4. **Чужое в неожиданных местах:** `colorId`/`groupId` (палитры), `orderBy[].columnName`,
   `indicatorsStackSum`, `events.variablesSettings.control.view.variableId`, ключи-словари вида
   `<id страницы>`, алиасы `colorSpecificValueAlias<id виджета>`.
5. **Тексты живут не в тексте:** значение переменной — в
   `dataSettings.variables[].settings.textPropertiesSettings.text.text`, а `viewSettings.text.text`
   — только шаблон `{{var0}}\n{{var1}}`. Имя переменной должно точно совпадать с плейсхолдером.
   Кегль/жирность — там же.
6. **Единица измерения — в показателе:** `indicators[].settings.formatting.formats` =
   `{formattingType: "numerical"|"percent", meta:{money:"RUB"}, editText:{text,isActive},
   numberOfZeros, numeric}`. `editText` — суффикс, `meta.money` даёт «₽».
7. **Фильтры — отдельные объекты** в `filtersV3`, а не виджеты. Значения выпадающего списка —
   `fictionalData` (реальные значения из датасета), привязка к полю — `nameSettings.fieldName`,
   «выпадающий» — это `isAlwaysOpen: false`. Клонировать один и тот же образец под все фильтры:
   лишний/отсутствующий ключ в клоне меняет отрисовку.
   - Типы: `single` | `multiple` | `date`; у `date` — `displayMode`, `enabledPresetsIds`,
     `enabledFilterModes` (byMonth / byQuarter / byYear / byWeek). `filterInfluences` — карта id
     виджетов, на которые фильтр влияет (бывает `null`).
   - **Ключ `isAlwaysOpen` есть только у `multiple`**, у `single` его нет вовсе — и такой фильтр
     рисуется раскрытым списком значений. Нужен одиночный выпадающий: оставить `type: "single"`
     и добавить `isAlwaysOpen: false`.
   - Минимальный дизайн: `styleContainerSettings.showBackground: false` +
     `backgroundSettings.isShow: false`, `borderSettings {isActive: false, width: 0}`,
     `shadowSettings.isActive: false`, текст — `buttonSettings.textPropertiesSettings`:
     `fontSize: 12`, `padding {vertical: 6, horizontal: 8}`, `alignment: "flex-start"`,
     `fontColor: null`; плюс `paddingSettings` по четырём сторонам и
     `position {positionHorizontal: "flex-start", positionVertically: "center"}`.
   - В выгрузке фильтр может лежать с `field: null, settings: null` — как он привязан к полю, из
     такого файла не видно; брать образец, где привязка заполнена.

## Текстовые виджеты: значение в переменных и выравнивание

- **Выравнивание живёт в двух местах, и в UI читается не то, что кажется.** У текстового виджета
  есть `viewSettings.text.alignment` (у элемента) и `viewSettings.textProperties.alignment`
  (секция «Текст» в настройках визуализации). В донорах второе лежит как `center/center`;
  «сделать текст по левому краю» выполняется, только когда поправлены **оба**
  (`{vertical: "flex-start", horizontal: "flex-start"}`) — на одном `text.alignment` карточка
  остаётся по центру.
- **Секции `header` у текстового виджета может не быть вообще** (база — самый маленький виджет
  типа `text`), поэтому «сделать заголовок крупнее» означает первую строку-переменную, а не `header`.
- **Несколько переменных в одной строке.** Значение и единицу измерения держать разными
  переменными (`{{var1}} {{var2}}`): при привязке к модели число приходит из данных, а
  «млн ₽ / шт / %» остаётся текстом. Плейсхолдеры в rich-тексте подставляются по месту, поэтому
  единица не уезжает на отдельную строку.
- **Две разные настройки отступов.** «Внутренние отступы» виджета — `viewSettings.paddingSettings`
  (top/left/right/bottom), а не `text.padding` (vertical/horizontal). В UI это две разные настройки:
  просьба «добавить внутренние отступы» относится к `paddingSettings`.

## Круговая и пончик (`pie`)

Отдельный `visualisationType: "pie"` (не режим `lineAndBar`), `dataSettings.roseType: "pie"`.
У неё **нет** `dataSettings.type`, `barType`, `variables`, `indicatorsStackSum`, а также
`verticalZoom` / `horizontalZoom`: ползунка приближения у круговой не бывает, флаг «без зума» для
неё тихо пропускается. Наборы ключей `dataSettings` / `viewSettings` / `positionConfig` / разреза /
показателя — свои, сверять с образцом этого типа.

- Форма и подписи — `viewSettings.styleSettings`: `innerRadius {label, value: "%"}` (0 — сплошной
  пай, 30–60 — пончик), `outerRadius`, `arcStartAngle` / `arcEndAngle`, `padAngle`, `borderWidth`,
  `borderRadius`, `labelFormat` (`["value","name"] | ["value"] | []`), `labelSize`,
  `centerCoordinates`, `hideOverflowLabels`, `pieAnimationElement`, свой `colorBySettings`.
- Что писать на сегменте — `indicators[].settings.valueFormat: "percent" | "absolute"`; единица
  измерения по-прежнему в `settings.formatting.formats`.
- Легенда — `legendSettings {width, isShow, offset, location {bottom|right}, position}`.
- Разрез у круговой читается как легенда: `fictionalData` разреза заполнять человеческими
  названиями категорий, а не «Группа 1…10» из образца.
- Кольцо, подписи и легенду выносить в параметры сборщика, а не править JSON руками.

## Группы (контейнеры)

Группа живёт в `pagesSettings[].groupsVisualizationsV3[]`:
`{id, name, type: "group", events{variablesSettings}, pageId, isGrouped: false, isVisible,
widgetIds: [id членов], viewSettings{…}, parentGroupId: null, positionConfig{x,y,width,height}}`.

- **Координаты у членов локальные.** У группы `positionConfig` — абсолютный бокс на доске, у членов —
  координаты внутри группы (группа в (1370,145), а члены в (0,170), (11,66)). У члена
  `viewSettings.group.positionConfig` повторяет его же локальный бокс, `group.groupId` = id группы,
  `isGrouped: true`. Клонируя виджет из группы, позицию брать из группы, а не из `positionConfig` члена.
- **Слои:** id группы и id каждого члена — отдельные записи в `indeces.layers`; группа может стоять
  выше своих членов.
- Сгруппированных фильтров в выгрузках не встречалось: механизм тот же (widgetIds + group у члена +
  локальные координаты), но результат проверять на платформе — это допущение, а не подтверждённый
  случай.

## Тепловая карта (`heatmap`) — своя ветка, не как у графиков

Отдельный `visualisationType`: два разреза (`incisions` по горизонтали и `verticalIncisions`
по вертикали), один показатель, цвет ячейки задаёт родной градиент платформы.

- активные разрезы указываются трижды: `activeIncisionId`, `activeHorizontalIncisionId`,
  `activeVerticalIncisionId` — без них карта пустая;
- `dataVisualMapSelectedMinAndMax {start,end}` живёт в **`viewSettings`**, а не в `dataSettings`:
  положишь в привязку к данным — получишь лишний ключ в наборе (правило «наборы ключей совпадают
  с донором» это ловит) и незаданный диапазон;
- `visualMapSettings` — шкала значений, её включают; `legendSettings` у карты дубль — гасить;
- оси свои: `axisXIncisionSettings` / `axisYIncisionSettings`, в общем списке осей их нет —
  нормализатор кеглей и тонов надо учить отдельно (у донора подписи осей 6 и 5 px, вне шкалы);
- `paddingSettings.right` у донора бывает 1000 — приводить к общему отступу виджета;
- `gradientBackgroundByValueSettings` переносить из донора и **возвращать после сантайза**:
  внутри служебные алиасы (`backgroundValueAlias`), без них карта теряет градиент.

## Спарклайн и разблокировка элементов

- **Спарклайн — не отдельный тип.** Это обычный `lineAndBar` малого размера (≈350×52) с погашенной
  обвязкой: `legendSettings.isShow: false`, `axis*.label.isActive: false`, `axis*.name.isShow: false`,
  `header.isShow: false`, сжатые `visualisationPaddings`, один показатель и короткий разрез
  (12 месяцев). Ставится поверх карточки-текста внутри её габаритов, а в `indeces.layers` — выше неё.
- **Разблокировка элементов:** `viewSettings.disableDragging: false` + `freeLocation: true`
  у виджетов и `disableDragging: false` у фильтров. Галочка «реальные данные» — `dataSettings.isRealData`
  у виджетов и `isRealData` у фильтров; для макета её ставят в `false`.

## Ловушки, которые стоят больше всего времени

- **Слои (`indeces.layers`) — порядок отрисовки, снизу вверх.** В списке лежат id виджетов,
  фильтров и групп. Пустой список — источник перекрытий: платформа берёт порядок из массива
  виджетов и может положить спарклайн под фон карточки.
- **Белый фон виджета — три ключа:** `styleContainerSettings.showBackground` +
  `backgroundSettings.isShow` + `backgroundSettings.colorSettings.background.color`. Готового
  «белого» в файле нет: палитра хранится ссылками на чужой проект (переносить нельзя), свои —
  только уровни темы `{"<pageId>": {"type":"color","level":N}}` или «цвет по умолчанию темы».
- **Метка «сделано ИИ»** — пара ключей `viewSettings.isAiGenerated` / `showAiGenerated`; рисует
  вторая. Снимать **обе** и у **всех** виджетов, а не только там, где ключ был `true`.
- **Рамку и ползунки приближения гасить всем графикам класса сразу:**
  `styleContainerSettings.borderSettings.isActive/width`, `verticalZoom`/`horizontalZoom`
  (`isShow`). После правки одного графика у остальных обвязка остаётся.
- **Подписи разрезов — это секция оси целиком:** `isShow`, `showAxis`, `label.isActive`,
  `tickLabel.isShow`, `showGrid`. «Убрать оси» ≠ выключить подписи: сетка живёт отдельно.
  Паддинги тут ни при чём.
- **Ручные отступы области построения — `viewSettings.visualisationPaddings`** (поля, внутри
  которых рисуется график вместе с подписями). Включил подписи оси — сразу выстави отступ под
  них (категории горизонтальных столбцов: 100–140 слева; числа вертикальной оси: 60 слева;
  подписи разреза под столбцами: 40–50 снизу). У спарклайнов отступы нулевые.
- **Отступы таблицы — три уровня:** внешние `viewSettings.paddingSettings`, поля ячеек
  `bodySettings.indentation`, паддинги текста `bodySettings.propertiesIncisions.padding` /
  `headerSettings.properties.padding`. В донорской таблице внешние бывают кривыми (`top 50` при
  `left/right/bottom 16`), и заголовок «плавает» относительно заголовков графиков.
- **Координаты в группе локальные.** У группы `positionConfig` — абсолютный бокс, у членов —
  координаты внутри группы; у членов группы `positionConfig` может быть нулевым.
- **Клонируя донора по имени, сверь, какого взял,** и печатай состояние его осей: одноимённых
  виджетов в выгрузке бывает несколько. Сравнивать имя **строго**: поиск по подстроке
  «Линейная диаграмма 1» берёт сначала «Линейная диаграмма 1 (8) (2)» — это другой виджет
  (прогрессбар с погашенной осью разрезов).
- **Алиасы цветовых правил тянут id донора внутрь строки.** В `byRule` / `byValue` /
  `byCondition` / `byValueSpecific` лежит `alias` вида `colorSpecificValueAlias<id>` или
  `colors<id>`; финальная чистка «удалить любую чужую uuid» их пропускает — uuid сидит внутри
  строки, а не вместо неё. Обнулять `alias` вместе с `sqlCondition`, `colors`, `rules`.
- **Круговую брать из экземпляра с `incisions[0].colors is None`.** В одной и той же выгрузке
  лежат и чистые, и «крашеные» палитрой проекта круговые; выбор первого попавшегося тянет чужие
  `colorId`/`groupId`.
- **`indicators[].settings.secondaryProperties.fontSize`** у донора бывает 15 — вне шкалы кеглей;
  приводить к общему кеглю подписей в том же нормализаторе.
- **`level 5` в шапке таблицы — родное значение донора**, а не мусор: разрешать его в правилах
  проверки именно по пути `table/…/headerSettings/properties/backgroundColor/…/level`, а не
  запрещать уровни выше 4 целиком.
- **Чекер обязан быть устойчив к той поломке, которую ищет:** `layers.index(id)` падает
  `ValueError` на потерянном слое вместо того, чтобы отдать нарушение, а правило «слово
  встречается где-то на странице» пропускает удаление пометки из конкретного блока.
- **Свои id не вычищать вместе с чужими** — включая `incisions[].id`, `indicators[].id`,
  `variables[].id`. Забытый вид объекта даёт пустые id, и платформа их не различает.
- **Панель инструментов — `viewSettings.toolboxSettings`:** `isShow`, `hasTableData` (системная
  кнопка «скачать данные»), `saveHowImage`, `isReset`, `orientation`, `verticalLocation` /
  `horizontalLocation`, `borderColor` / `backgroundColor`. У **таблиц** в боевых экспортах этого
  блока нет вообще, у графиков и круговой он есть с `isShow: false`: для таблицы объект приходится
  задавать целиком по образцу графика, и схемой это не подтверждено — проверять на платформе.
- **Подписи значений — у показателя:** `indicators[].settings.showValue`
  `{isShow, position, orientation, properties{fontSize}, colorBySettings}`. В донорских выгрузках
  `isShow: false` у всех, а `position` встречается как `top`, `outside`, `flex-start` / `flex-end`.
  Для горизонтальных столбцов (`rotateTo90: true`) «подписи в начале столбца» — это `flex-start`,
  для вертикальных — `top`.
- **Пунктир и тип линии — тоже у показателя:** `indicators[].settings.elementSettings.parameters`
  = `{type, dotWidth, isDotted, lineType: "smooth" | "broken", lineWidth, areaOpacity}`. Донор
  приносит `isDotted: true`, а на одной странице сосуществуют оба варианта (столбцы —
  `lineType: "broken"`, `areaOpacity: 0`), поэтому проверять каждый показатель отдельно.
- **`activeIncisionId: null` схемой допускается** — так лежит в боевом экспорте у типа `table`;
  это не поломка и не повод пересобирать виджет.
- **`page.variables` — булевы переменные видимости, а не значения.** Значения текстовых переменных
  живут в `dataSettings.variables[].settings.textPropertiesSettings.text.text`; искать их
  в `page.variables` бесполезно.

## Порядок сборки новой страницы

1. Клонировать по одному эталону на нужный тип: столбцы+линия с иерархией дат, горизонтальные
   столбцы (`rotateTo90: true`), таблица, «прогрессбар» для KPI, текст; круговую — из чистого
   экземпляра (`incisions[0].colors is None`).
2. Заменить `id`, `pageId`, `dataSettings.modelId`, `viewSettings.name`. id детерминированные
   (`uuid5` от роли и имени), `PAGE_ID` — константа.
3. Отвязать от групп: `viewSettings.group.isGrouped: false`, `groupId: null`, убрать вложенный
   `positionConfig`, задать абсолютный.
4. Погасить события: `goTo` / `goToHref` / `activateTo` / `activateObject` /
   `transitionSettings.isActive` → `false`, `to` → `null`.
5. Пересобрать `incisions` / `indicators` из прототипов, задать `operationType` явно,
   `activeIncisionId` = id первого разреза, `limit.isActive: false`, `variables: []`, `sqlData`
   обнулить целиком.
6. Сантайз чужого (см. `builder-checklist.md` §4) — и отдельно проверить поиском, что не осталось
   имён чужих таблиц и полей.
7. Старые id прототипов, оставшиеся в настройках осей и легенд, заменить на новые (что не перенесли — `null`).
8. Имена объектов задавать сразу в сборщике: переименование после импорта — это десятки ручных
   действий в UI.

## Правка существующей страницы (чужой живой экспорт)

Отдельный режим: страница уже живёт на платформе, собрана не нашим сборщиком, и её надо поправить
точечно — кегли показателей, правила окраски ячеек, подписи, единицы. Пересобирать такую страницу
нечем (сборщика нет), поэтому правка идёт по разобранному JSON — но с доказательствами, что больше
ничего не задето.

1. **Адрес — по `id` объекта, а не по номеру строки.** Номер строки из чужого просмотра — это
   pretty-print: `indent` 1/2/4 даёт одинаковое число строк, поэтому адрес полезно проверить
   (на строке должен стоять ожидаемый ключ) и дальше работать по `id`.
2. **Опись до правки.** По каждому целевому показателю/элементу выписать текущее значение и отдельно —
   сколько вариантов одного и того же правила встречается. У живых страниц однотипные колонки часто
   держат разные условия (порог по плану против константы, разный порядок ветвей, перевёрнутый знак,
   CRLF внутри текста), и это не поломка, а история правок в UI. Расхождения в порогах и знаках
   согласуют с заказчиком словами до правки, а не «приводят к большинству».
3. **Формат файла проверить, а не предположить.** Дамп с `ensure_ascii=False`,
   `separators=(',',':')` обязан воспроизвести исходный файл байт в байт (боевой экспорт — одна
   строка без переводов строк). Воспроизводит — правим по разобранному JSON и пишем тем же дампом,
   и импорт увидит исходный файл плюс правку. Не воспроизводит — формат не угадан, текстовую правку
   не делать.
4. **Бэкап и каждая замена с проверкой числа срабатываний** (`count == 1`, иначе паттерн не уникален).
   Чужие `id`, `pageId`, цветовые ссылки не трогать. Имя бэкап-файла — без символов `>` и `|`:
   Windows на такое имя отвечает `OSError: [Errno 22]`.
5. **Доказать, что задето ровно задуманное.** Структурная правка + дамп должны совпасть с независимой
   текстовой реконструкцией тех же правок в границах объекта (`"id":"<виджет>"` →
   `"id":"<следующий виджет>"`), а сверка с бэкапом — дать список расходящихся путей, сходящийся
   с ожидаемым: «изменённых путей ровно N, лишних 0, несработавших 0». `difflib` на таких файлах
   (мегабайты в одну строку) не возвращается — сравнивать распарсенные структуры обходом.
6. **Отчёт числами:** сколько объектов и какое поле изменено, что осталось нетронутым, какой файл
   импортировать, где бэкап, и отдельно — что сделано по формулировке заказчика, а что решено за него.

Карта «что просят → куда лезть» для точечных правок:

| Просят | Ключ |
|---|---|
| Кегль значения показателя | `indicators[].settings.properties.fontSize` |
| Единица и формат | `indicators[].settings.formatting.formats` |
| Цвет текста значения | `indicators[].settings.properties.fontColorBy` |
| Заливка ячейки по условию | `indicators[].settings.properties.backgroundColorBy` (+ мастер `isActiveBackgroundColor`) |
| Подписи значений | `indicators[].settings.showValue` |
| Сортировка | `dataSettings.orderBy[]`, `indicators[].settings.sortSettings` |
| Итоги колонки | `indicators[].settings.totalSettings`, `viewSettings.totalRowSettings/subtotalsSettings` |
| Ширина и отступы ячеек | `incisions[].settings.columnWidthSettings`, `indentation`, `properties.padding`, `viewSettings.bodySettings.indentation` |
| Подписи и кегли осей | `viewSettings.axis*Settings` |
| Легенда | `viewSettings.legendSettings` |
| Заголовок и описание | `viewSettings.header`, `viewSettings.description` |
| Рамка, фон, тень | `viewSettings.styleContainerSettings` |
| Внутренние отступы виджета | `viewSettings.paddingSettings`, `viewSettings.visualisationPaddings` |
| Прокрутка и приближение | `viewSettings.verticalZoom` / `horizontalZoom` |
| Панель инструментов | `viewSettings.toolboxSettings` |
| Слои отрисовки | `pagesSettings[].indeces.layers` |
| Фильтры страницы | `pagesSettings[].filtersV3[]` |

- **Окраска ячейки по условию — это тройка ключей.** `backgroundColorBy.type: "condition"`, значения —
  `backgroundColorBy.byCondition.colors[]` **по порядку** = `'1'..'5'`, которые возвращает
  `backgroundColorBy.byCondition.sqlCondition`; включающий флаг лежит **не в самом** `backgroundColorBy`
  (`isActive` там обычно `false`), а рядом — `properties.isActiveBackgroundColor`. Алиас внутри
  `byCondition` унаследованно зовётся `fontColor` — это не поломка выгрузки.
- **Знак и порог в условии — это смысл, а не синтаксис.** `maxIf(<разрез даты>, …)` — это последняя
  дата в данных, то есть «сегодня». «Работы, которые должны были начаться, но не начались» — это
  `факт = 0 and maxIf(start_date) < maxIf(date)`; знак `>` в том же месте отметит работы, у которых
  старт ещё впереди, то есть противоположное. Просрочка окончания читается так же: `end_date <= date`.
  Формулировку заказчика переводить в знак явно и повторять её же в отчёте.
- **Один и тот же кегль живёт и вне показателей:** `"fontSize": 22` встречается, например, в
  `viewSettings.description`. Замену делать по полному префиксу
  (`"properties":{"opacity":…,"padding":{…},"fontSize":22,`) и сверять число замен: ожидали 11,
  нашли 12 — значит зацепили описание виджета.
- **Что оставить в покое, но перечислить заказчику:** ссылка на модель, которой нет в `models`
  (встречается у `svg`-виджетов), мусорные `fictionalData` (месяцы донора) и `orderBy` с чужими
  колонками, расходящиеся `totalSettings.isShow` у однотипных колонок. На данные это не влияет,
  на вид и на следующие правки — влияет, поэтому это список «решить отдельно», а не молчаливая чистка.

## Публикация результата

Готовая страница принимается платформой только на импорте — проверки сборщика её не заменяют.
В отчёте о сдаче перечислить: типы виджетов, подтверждённые только образцом; решения, принятые
по умолчанию (фон, панель инструментов, латиница/кириллица); что смотреть глазами при первом
импорте.
