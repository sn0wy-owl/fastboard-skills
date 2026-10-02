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

Виджет: `id, pageId, visualisationType, isBlock, isVisible, events{…}, sqlData{…},
dataSettings{type,limit,barType,modelId,incisions[],indicators[],variables[],isRealData,…},
viewSettings{20–30 секций}, positionConfig{x,y,width,height,sticking}, backgroundImagesSettings`.

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

## Публикация результата

Готовая страница принимается платформой только на импорте — проверки сборщика её не заменяют.
В отчёте о сдаче перечислить: типы виджетов, подтверждённые только образцом; решения, принятые
по умолчанию (фон, панель инструментов, латиница/кириллица); что смотреть глазами при первом
импорте.
