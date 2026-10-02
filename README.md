# agent-skills

Репозиторий командных скиллов для агентских систем. Один источник правды — папка `skills/`,
один формат — открытый стандарт [Agent Skills](https://agentskills.io/specification)
(`SKILL.md` + YAML-frontmatter). Из этой же папки репозиторий подключается как **tap** в Hermes,
как каталог скиллов в Claude Code, Codex CLI и Cursor.

## Структура

```
agent-skills/
├── AGENTS.md                  # правила репозитория для агентов (читается Codex, Cursor, Grok, Gemini CLI, ...)
├── CLAUDE.md                  # короткий указатель для Claude Code
├── skills/                    # ★ единственный источник правды
│   └── dashboard-build/       # скилл: дашборд под ключ
│       ├── SKILL.md
│       ├── references/        # длинные методички, грузятся по требованию
│       ├── templates/         # скелеты: HTML-предпросмотр, сборщик страницы
│       ├── scripts/           # проверки, запускаемые скиллом
│       └── agents/openai.yaml # необязательная витрина для Codex/ChatGPT
├── scripts/
│   ├── install.mjs            # разложить skills/ по каталогам агентских систем
│   └── validate-skills.mjs    # проверка frontmatter по спецификации Agent Skills
├── skills.sh.json             # категории для Skills Hub в Hermes
└── .github/workflows/validate.yml
```

Каталоги `.claude/skills/`, `.cursor/skills/`, `.agents/skills/`, `.hermes/skills/` внутри
репозитория **не коммитятся** — их создаёт установщик (ссылками на `skills/`, чтобы не было
расхождений между копиями).

## Куда смотрит каждая система

| Система | Личный уровень | Уровень проекта | Каталог скиллов |
| --- | --- | --- | --- |
| Hermes Agent | `~/.hermes/skills/` | `.hermes/skills/`, `.agents/skills/` (нужен `hermes skills trust`) | `~/.hermes/skills/` — родной; tap-репозиторий ставит в него же |
| Claude Code | `~/.claude/skills/` | `.claude/skills/` | свой, `.agents/skills` не читает |
| Codex CLI | `~/.agents/skills/` (устаревшее, но читаемое — `~/.codex/skills/`) | `.agents/skills/` (от рабочего каталога до корня репо) | `.agents/skills/` |
| Cursor | `~/.cursor/skills/` | `.cursor/skills/` | `.cursor/skills/` (с 2.4) |
| Прочие (Gemini CLI, Goose, OpenCode, Copilot, …) | по своей документации | читают `AGENTS.md` | поддержка стандарта `SKILL.md` | 

Общего автообнаружения нет: формат один, а пути у всех разные — поэтому установщик
раскладывает ссылки во все каталоги сразу.

## Подключение

### 1. Как tap в Hermes (для всей команды)

```bash
hermes skills tap add <owner>/agent-skills     # один раз
hermes skills search dashboard                 # найти
hermes skills install <owner>/agent-skills/dashboard-build
hermes skills update                           # подтянуть новые версии
```

### 2. Установщиком — во все системы сразу

```bash
node scripts/install.mjs --scope user            # в личные каталоги всех систем
node scripts/install.mjs --scope project         # в каталоги текущего проекта
node scripts/install.mjs --target claude,codex   # выборочно
node scripts/install.mjs --mode copy             # копией, а не ссылкой (если ссылки запрещены)
node scripts/install.mjs --dry-run               # показать, что будет сделано
```

По умолчанию создаются **ссылки** (на Windows — junctions, прав администратора не требуют),
поэтому правка скилла в `skills/` сразу видна всем агентам. `--mode copy` — для сред, где
ссылки запрещены; копии надо переустанавливать после обновления.

### 3. Вручную, если нужно

```bash
# Claude Code, личный уровень
ln -s "$PWD/skills/dashboard-build" ~/.claude/skills/dashboard-build      # macOS/Linux
mklink /J "%USERPROFILE%\.claude\skills\dashboard-build" "%CD%\skills\dashboard-build"  # cmd

# Hermes: общий каталог скиллов через конфиг
hermes config set skills.external_dirs '["~/agents/agent-skills/skills"]'
```

## Как добавить скилл

1. `mkdir -p skills/<имя>` — имя каталога = `name:` во frontmatter, только строчные буквы,
   цифры и одиночные дефисы.
2. Написать `SKILL.md`: обязательны `name` и `description`. `description` — это триггер, по
   которому агент решает, грузить скилл или нет: пиши «что делает + когда применять», а не
   заголовок.
3. Длинные методички — в `references/`, готовые к использованию файлы — в `templates/`,
   исполняемые проверки — в `scripts/`. Всё это лежит рядом со `SKILL.md` и грузится по
   требованию, а не целиком.
4. Проверить: `node scripts/validate-skills.mjs`.
5. Закоммитить. Каталоги-ссылки внутри репозитория не коммитятся — их восстановит установщик.

Правило репозитория: **скилл — это процедура, а не лог.** Никаких номеров задач, дат и
историй инцидентов; только шаги, инварианты и грабли, которые повторятся.

## Проверка

```bash
node scripts/validate-skills.mjs        # frontmatter + ссылки на файлы
```

CI гоняет то же самое на каждый push и pull request.

## Лицензия

CC-BY-4.0 (см. `LICENSE`) — скиллы можно свободно копировать и адаптировать внутри компании
и за её пределами, с указанием авторства.
