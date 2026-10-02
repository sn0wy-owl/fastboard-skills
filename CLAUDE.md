# CLAUDE.md

Правила репозитория — в `AGENTS.md`, читай его первым.

Коротко:

- Источник правды по скиллам — `skills/<имя>/SKILL.md` (стандарт Agent Skills).
- `.claude/skills/` в этом репозитории — **сгенерированный** каталог (ссылки на `skills/`).
  Не редактировать и не коммитить; создать заново: `node scripts/install.mjs --scope project`.
- Новый скилл: `skills/<имя>/SKILL.md`, где имя каталога = `name:` во frontmatter (строчные,
  дефисы). `description` пишется как триггер: что делает + когда применять.
- Проверка: `node scripts/validate-skills.mjs`.
