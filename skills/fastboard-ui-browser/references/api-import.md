---
name: fastboard-api-import
description: Проверенный способ строить проекты FastBoard программно — экспорт/импорт JSON через REST из браузера, схема visualisations_v3, запуск скрипта по API
type: reference
sources: [cowork-import]
imported_at: 2026-09-15T19:19:30Z
---
# FastBoard: программное создание проектов через API (проверено 2026-08, UI ~v2.1.x)

Все вызовы — fetch из вкладки авторизованного пользователя (cookie-сессия), база `/back/api`.
- Список черновиков: GET /back/api/v1/projects/draft → {projectsList:[{id,title,...}]}
- Экспорт проекта: GET /back/api/v2/project/{id}/export?includeStorageImages=false&archiveName=x → JSON (не zip! zip делает фронт). Структура: {id, project:{projectId,title}, data:[{method,payload,...}], migrations, storage}. Методы: import_script (payload.pages[0].script — текст скрипта загрузки), project_models, project_meta_models, project_pages, project_indexes (layers = z-order id виджетов по странице), visualisations_v3 (payload.visualisations[]), filters_v3 (payload.filters[]), enabled_filters_v3, filter_list_agree, groups_visualisations_v3, project_palettes, project_palette_links, project_themes, project_settings, project_default_model_id, project_active_theme_id, project_save.
- Импорт: POST /back/api/v2/project/import, multipart FormData поле `file` = zip с файлами `<title>.json` (тот же формат, что экспорт; project.title = имя нового проекта) и `storage-export-map.json` ({"rootId":"storage_root",...} — можно взять из любого экспорта). Ответ 201 {id,...} — НОВЫЙ проект в Черновиках. Zip можно собрать в JS вручную (stored, без сжатия) — работает.
- После импорта таблицы не загружены («Структура загруженных таблиц была изменена…») → запуск скрипта: PUT /back/api/v1/script/{projectId}/run → возвращает loading_id; статус: GET /back/api/v1/projects/loading_status?loading_id=… → {status:'success',progress:100,loaded:N}. Текст скрипта: GET /back/api/v1/script/{projectId}.
- Константные id по умолчанию у нового проекта: страница dc056874-305d-11ee-8c70-04d4c47aef75, модель f50cc062-2c91-11ee-8f03-04d4c47aef75, палитра 55f43476-1cd1-11ee-b2df-04d4c47aef75, светлая тема eaabed9c-1ccd-11ee-9f92-04d4c47aef75.
- Ace-редактор скрипта: window.ace.edit(document.querySelector('.ace_editor')).setValue(text,-1) → «Сохранить» → «Запустить» — тоже работает. Excel-подключение: «Создать подключение → Файл», типы колонок определяются автоматически (галка «Анализировать весь файл» — иначе Int16 по первым строкам и переполнение). Файл грузить через file_upload на input type=file (путь из контейнера сессии подходит).
- Ловушки чтения из браузера: вывод javascript_tool режется ~1000 символов и блокирует base64/«cookie-like» строки; большие тексты выводить в <pre id=__dump> и читать get_page_text (лимит 50 000 символов на ответ, режь на куски). Basic-auth URL (swagger) из fetch вешает вкладку — не трогать.

## Схема виджета (visualisations_v3)
{id, pageId, visualisationType: 'text'|'lineAndBar'|'table'|'waterfall'|…, isVisible, isBlock, positionConfig:{x,y,width,height,…}, events, sqlData:{filterAndGroupRequest:'WHERE … GROUP BY … ORDER BY …', isFreeMode:false…}, dataSettings, viewSettings, backgroundImagesSettings}
- dataSettings общие: modelId, isRealData:true, limit:{value,isActive}, incisions:[{id,name,fieldName:'table.col'|null, settings:{customRequest:'expr'|null,…}}], indicators:[{id,name,fieldName:null, customRequest:'sum(t.col)', operationType:'other'|'sum'|'max'|'count', settings:{formatting:{formats:{numeric:true,numberOfZeros}}, elementSettings:{type:'bar'|'line'}, showValue:{isShow,position}}}], activeIncisionId (= id разреза).
- lineAndBar: type:'group', rotateTo90, barType:{type:'pile'}, indicatorsStackSum:[].
- table: limitGrouping:{value,isActive}, incisionsInHeader:[{…fieldName:null}], у показателя settings.totalSettings.isShow, properties.alignment.horizontal:'flex-end'.
- waterfall: indicators План (type:'plan', customRequest 'max(toFloat64(0))') и Факт (type:'fact'), plus phantomIndicators/positiveAndNegativeIndicators.
- text (KPI): dataSettings.variables:[{name:'var0', customRequest:'expr', settings.formatting}], viewSettings.text.text='{{var0}} млн ₽', viewSettings.textProperties.fontSize/alignment/fontStyle.bold, limit {value:1,isActive:true}; incisions/indicators — фиктивные «Фото 0/1».
- Цвет показателя: color:{'<paletteId>':{type:'color',colorId,groupId}} — ссылка на цвет группы палитры проекта (project_palettes[].groups[].colors[].id).
- Фильтр (filters_v3): {id,type:'single'(кнопки)|'multiple'(список), pageId, modelId, nameSettings:{name,fieldName:'table.col',filterElementMode:'dynamically'}, selectedData:[], positionConfig, buttonSettings, elementDesignSettingsData…}.
- Контейнер: viewSettings.styleContainerSettings (border radius, shadow), viewSettings.header:{text,isShow,fontSize} — заголовок виджета.
