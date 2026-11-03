# Контракты Платформы

## Доступ И Запись

MCP endpoint: `https://<целевой-стенд>/<backend-prefix>/api/v3/mcp`.
Prefix определяется стендом; не считай `/back` универсальным.
PAT работает на MCP, обычный REST требует действующую пользовательскую сессию.
Не обновляй конфиг глобального подключения без необходимости: конкретный PAT можно использовать в отдельном клиенте.

Минимальная последовательность: `initialize` → `tools/list` → `tools/call`.
Инструменты и их actual schema узнавай на текущем сервере: набор и тела меняются между версиями.

```text
node scripts/mcp-client.cjs tools --out tools.json
node scripts/mcp-client.cjs call get_project_pages --out pages-before.json
node scripts/mcp-client.cjs call save_project_visualisations --args payload.json --write --out write-result.json
```

Переменные окружения: FB_MCP, FB_PAT, FB_PROJECT_ID. Не показывай их значения в отчёте.
Клиент не пишет в проект без `--write`; перед записью вызывает timestamp.
Проверка timestamp перед вызовом не является транзакцией: при конфликте перечитай проект, сравни изменения, не повторяй запись вслепую.

Экспортный конверт страницы:

```json
{
  "pagesSettings": [{
    "page": {"id":"PAGE_ID", "name":"Экран", "variables":[], "boardSettings":{"sizes":{"width":1600,"height":1200}}},
    "visualizationsV3": [],
    "filtersV3": [],
    "groupsVisualizationsV3": [],
    "enabledFiltersV3": [],
    "indeces": {"pageId":"PAGE_ID", "layers":[]},
    "filterListAgree": []
  }]
}
```

Это только форма конверта, **не полноценный донор page**. Полный объект страницы клонируй с платформы.
`visualizationsV3` в export и `visualisations` в GET/PUT — разные ключи.

Подтверждённые тела сохранения, но обязательно сверяй с actual tools:

```json
{"projectId":"PROJECT_ID","projectPages":["FULL_PAGE_OBJECTS"]}
```

```json
{"projectId":"PROJECT_ID","payload":[{"pageId":"PAGE_ID","visualisations":["FULL_WIDGET_OBJECTS"]}]}
```

Для `save_project_filters`, `save_project_layers`, `save_project_enabled_filters` внутри payload соответственно `filters`, `layers`, `enabledFilters`.
Для палитры: `projectPalettes`, не `projectPalette`.
Получение settings, изменение копии и запись `projectSettings` не должно затронуть пользовательские RLS/доступ/скрипт.

Файловый импорт требует:

```json
{"file":{"contentType":"application/json","encoding":"base64","data":"BASE64_BYTES"}}
```

`newPages:"true"` создаёт **новые серверные id**. Если импортируешь связанные страницы, перечитай id и переназначь переходы.
Для повторяемых итераций с постоянными id предпочтительно создавать/обновлять страницы через штатный save-контракт, не плодить импортированные копии.

## KPI-Медиаблок

Реальная причина пустого KPI при успешном SQL может быть в **шаблоне переменной**, а не в данных или шрифте.

```json
{
  "dataSettings": {
    "isRealData":true,
    "modelId":"MODEL_ID",
    "variables":[{
      "id":"VARIABLE_ID",
      "name":"val",
      "customRequest":"uniqExact(m.initiative_id)",
      "settings":{
        "textPropertiesSettings":{"text":{"text":"value","isShow":true}}
      }
    }]
  },
  "viewSettings":{"text":{"text":"{{val}}"}}
}
```

Фрагмент показывает только необходимые поля: остальные settings копируются из донора.
В проверенной версии frontend заменяет слово `value` результатом; пустой `text.text` даёт пустую строку.
`{{val}}` снаружи и `value` внутри — **разные шаблоны**. Не ставь внутри `{{value}}` без проверки: после подстановки это может стать новым плейсхолдером.
`name=val` поддержан; также встречается `var0`. Имя должно совпадать с внешним шаблоном.
Кегль/цвет/жирность проверяй и на `viewSettings.textProperties`, и на `variables[].settings.textPropertiesSettings`.
Для номера, фоновой подложки и подписи допускаются отдельные native-медиаблоки.

## Переход Между Страницами

```json
{
  "goTo":{"isActive":true,"to":{"id":"DESTINATION_PAGE_ID","type":"page"}},
  "transitionSettings":{"isActive":false}
}
```

На проверенном frontend активный `transitionSettings` имеет приоритет над `goTo`.
Object-transition может вернуть управление без перехода, если у текстовой кнопки нет точки данных.
Поэтому не включай оба механизма «на всякий случай». Проверяй **клик по самой карточке/кнопке**, не только верхнюю вкладку FB.
`goToHref` применяй для действительно внешних ссылок или явно согласованного полного перехода браузера.

## Попап Задач

Переменная принадлежит странице:

```json
{"id":"POPUP_ID","name":"Задачи инициативы","type":"boolean","status":"false"}
```

Writer реестра:

```json
{
  "variablesSettings":{
    "mode":"common",
    "isActive":true,
    "variables":[{"id":"ACTION_ID","status":"true","variableId":"POPUP_ID"}],
    "control":{"view":{"isActive":false,"variableId":"","variableName":""}},
    "matches":[],"separatedModeVariables":[]
  }
}
```

Receiver у **каждого** popup-объекта:

```json
{"isVisible":false,"events":{"variablesSettings":{"control":{"view":{"isActive":true,"variableId":"POPUP_ID","variableName":"Задачи инициативы"}}}}}
```

Крестик/подложка одновременно receiver и writer `status:"false"`.
Отбор задач — отдельная обязанность native-фильтрации: boolean сам по себе не знает, какая инициатива выбрана.
Не угадывай тип `filterInfluences`; возьми с работающего донора и проверь UI.
При раскрытии задачи группируются по task_id; безопасный отображаемый разрез:

```sql
concat(toString(m.task_id), ' · ', m.task)
```

Если исходный реестр отфильтровывает сам себя, после закрытия может остаться одна строка.
Проверь `isInfluenceItself`, `moreThanOne`, реакцию на чужие фильтры и обратный выбор другой инициативы.

## Оформление И Координаты

### Отступы От Контейнера

Подтверждено на живом frontend и через computed CSS:

```json
{"paddingSettings":{"top":20,"right":20,"bottom":20,"left":20,"unsetPaddings":true}}
```

Несмотря на название флага, `true` **включает применение** заданных отступов, а `false` даёт `0px`.
Проверенная логика рендера: `unsetPaddings ? top/right/bottom/left : '0px'`.
Ошибка «значения меняются, но содержимое прилипло слева сверху» требует сначала проверить этот флаг.
Контейнерные отступы `viewSettings.paddingSettings`, текстовые `padding` и plot-area `visualisationPaddings` — разные слои; не компенсируй выключенный контейнер изменением осей или координат.

Для медиаблоков-подложек с нулевыми отступами оставляй механизм включённым и ставь `top/right/bottom/left=0`.
Для фильтров отступы живут в корне объекта: сверяй высоту, чтобы 20+20 px не съели всё поле.
Не приписывай семантику `unsetPaddings` всем будущим версиям без проверки; измеряй реальный computed padding и попробуй числовое изменение в редакторе.

**Точечное исправление чужой живой сборки:** backup текущих полных объектов → перечитать перед записью против параллельных изменений → менять только этот флаг → сохранить полные массивы только затронутых страниц → readback и полный структурный diff.
Не пересобирай страницу из старого builder поверх уже внесённых пользователем правок. Сохрани top/right/bottom/left и все SQL/события/позиции/оформление без изменений.

### Прочее Оформление

- Фон контейнера требует согласованных showBackground, backgroundSettings.isShow и ссылки colorSettings.background.color.
- Цвета серий находятся в indicator.settings.elementSettings.colorBySettings; фон страницы — page.color.color.
- Ссылка цвета ключуется **paletteId**, не случайным id страницы. Уровни темы — другой механизм; не переписывай все UUID-ключи одним regex.
- В проверенной версии числовой медиаблок корректно принял палитровый fontColor; это не основание считать любую версию FB эквивалентной. Проверяй в браузере.
- У pie `settings.valueFormat="percent"` может показывать округлённые проценты без знака. Проверено переключение на `"numerical"`; посмотри реальные подписи **3/5/3**, не только JSON.
- У lineAndBar проверь `labelOrientation`: донорское `incline` часто ломает длинные подписи. `horizontal`, переносы строк, сокращение и разумные plot paddings предпочтительнее мелкого текста.
- У разных версий могут различаться названия позиций showValue и отступы. Не обещай работу незнакомого enum без UI-проверки.
- `dataSettings.limit` не всегда превращается в фактический SQL LIMIT. Для согласованного top-N явно проверь сгенерированный запрос, порядок сортировки и число строк.
- У table column.settings.columnWidthSettings: `{isActive:true,width:...}`. Задавай ширины отдельно для названия, дат, статуса, чисел и ответственного.
- Попап абсолютный в координатах доски. Открытие из нижней строки, короткий/высокий viewport и прокрутка проверяются отдельно. Не делай универсальным одно найденное y.
- Полупрозрачность/blur палитры могут отрисоваться иначе, чем HTML. Проверяй screenshot, а не обещай backdrop-filter по одному значению opacity.

## Браузер И Сессия

Если доступ запрещён **к файлу screenshot/snapshot**, это не отказ сайта: проблема может быть в разрешённом локальном пути сохранения. Используй разрешённую временную папку и Read.
Если закончилась пользовательская сессия, используй штатное обновление/повторный вход с разрешения пользователя; не печатай JWT и cookie.
В DevTools не сохраняй дампы заголовков с токенами в распространяемый навык или репозиторий.
Нативный диалог восстановления локального черновика может подменить API-сборку. Не нажимай «Да» автоматически.
