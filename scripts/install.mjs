#!/usr/bin/env node
/**
 * install.mjs — раскладывает скиллы из skills/ по каталогам, которые читают агентские системы.
 *
 * Примеры:
 *   node scripts/install.mjs                        # личные каталоги всех систем, ссылками
 *   node scripts/install.mjs --scope project        # каталоги текущего проекта
 *   node scripts/install.mjs --target claude,codex  # выборочно
 *   node scripts/install.mjs --mode copy            # копиями (если ссылки запрещены)
 *   node scripts/install.mjs --dry-run              # только показать план
 *
 * Ссылки (на Windows — junctions, права администратора не нужны) означают: правка в skills/
 * сразу видна всем агентам и расхождений между копиями не бывает. --mode copy — для сред,
 * где ссылки запрещены; копии нужно переустанавливать после каждого обновления.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOME = os.homedir()
const HERMES_HOME = process.env.HERMES_HOME || path.join(HOME, '.hermes')

/**
 * Куда смотрит каждая система.
 * user    — личный уровень (все проекты)
 * project — уровень проекта (каталог, в котором запущен установщик)
 */
const TARGETS = {
  hermes: {
    label: 'Hermes Agent',
    user: path.join(HERMES_HOME, 'skills'),
    // проектный уровень Hermes покрыт каталогом .agents/skills (см. target `agents`),
    // поэтому второй ссылки в .hermes/skills не создаём: иначе скилл регистрируется дважды
    project: null,
    note: 'личный уровень — родной каталог Hermes; в проекте читает .agents/skills',
  },
  claude: {
    label: 'Claude Code',
    user: path.join(HOME, '.claude', 'skills'),
    project: '.claude/skills',
  },
  codex: {
    label: 'Codex CLI',
    user: path.join(HOME, '.agents', 'skills'),
    project: '.agents/skills',
    note: 'текущий каталог Codex; устаревший ~/.codex/skills — с флагом --include-legacy',
  },
  agents: {
    label: 'Agent Skills (универсально)',
    user: path.join(HOME, '.agents', 'skills'),
    project: '.agents/skills',
    note: 'тот же каталог, что у Codex — читается как кроссинструментальный',
  },
  cursor: {
    label: 'Cursor',
    user: path.join(HOME, '.cursor', 'skills'),
    project: '.cursor/skills',
    note: 'поддержка скиллов с Cursor 2.4',
  },
}

function parseArgs(argv) {
  const opts = { scope: 'user', target: 'all', mode: 'link', dryRun: false, force: false, includeLegacy: false, cwd: process.cwd() }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const val = () => argv[++i]
    switch (a) {
      case '--scope': opts.scope = val(); break
      case '--target': case '--targets': opts.target = val(); break
      case '--mode': opts.mode = val(); break
      case '--cwd': opts.cwd = val(); break
      case '--dry-run': opts.dryRun = true; break
      case '--force': opts.force = true; break
      case '--include-legacy': opts.includeLegacy = true; break
      case '--help': case '-h': opts.help = true; break
      default: throw new Error(`неизвестный флаг: ${a}`)
    }
  }
  if (!['user', 'project', 'both'].includes(opts.scope)) throw new Error('--scope: user | project | both')
  if (!['link', 'copy'].includes(opts.mode)) throw new Error('--mode: link | copy')
  return opts
}

function discoverSkills() {
  const root = path.join(REPO, 'skills')
  if (!fs.existsSync(root)) throw new Error(`нет каталога ${root}`)
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
    .map(e => {
      const dir = path.join(root, e.name)
      if (!fs.existsSync(path.join(dir, 'SKILL.md'))) return null
      return { name: e.name, dir }
    })
    .filter(Boolean)
}

function ensureParent(dir, dryRun) {
  if (fs.existsSync(dir)) return
  if (dryRun) return
  fs.mkdirSync(dir, { recursive: true })
}

function makeLink(src, dest) {
  // На Windows 'junction' работает без прав администратора; на POSIX — обычная ссылка.
  const type = process.platform === 'win32' ? 'junction' : 'dir'
  fs.symlinkSync(src, dest, type)
}

function copyDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true })
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0])
    return 0
  }

  const skills = discoverSkills()
  const targets = (opts.target === 'all' ? Object.keys(TARGETS) : opts.target.split(',').map(s => s.trim()))
  for (const t of targets) if (!TARGETS[t]) throw new Error(`неизвестная система: ${t}. Доступны: ${Object.keys(TARGETS).join(', ')}`)
  if (opts.includeLegacy) targets.push('codex-legacy')

  const results = []
  const seen = new Set()

  for (const t of targets) {
    let base
    let label
    let note = ''
    if (t === 'codex-legacy') {
      base = path.join(HOME, '.codex', 'skills')
      label = 'Codex CLI (устаревший каталог)'
      note = '~/.codex/skills читается, но это legacy'
    } else {
      const cfg = TARGETS[t]
      base = opts.scope === 'project' || opts.scope === 'both'
        ? (cfg.project ? path.join(opts.cwd, cfg.project) : null)
        : cfg.user
      label = cfg.label
      note = cfg.note || ''
    }
    const bases = []
    if (opts.scope === 'both' && TARGETS[t]?.project) {
      bases.push(TARGETS[t].user, path.join(opts.cwd, TARGETS[t].project))
    } else if (base) {
      bases.push(base)
    }
    if (!bases.length) {
      results.push({ label, note, dir: '—', status: `не требуется на этом уровне (${note || 'каталог не нужен'})`, name: '' })
      continue
    }

    for (const dir of bases) {
      const key = path.resolve(dir)
      const isProject = !dir.startsWith(HOME)
      // каталоги, которые должны оставаться внутри репозитория, чистятся через .gitignore
      if (seen.has(key)) { results.push({ label, note, dir, status: 'пропуск (каталог уже обработан)', name: '' }); continue }
      seen.add(key)
      ensureParent(dir, opts.dryRun)
      if (isProject && !fs.existsSync(path.join(opts.cwd, '.gitignore'))) {
        results.push({ label, note, dir, status: 'предупреждение: нет .gitignore — ссылки попадут в коммит', name: '' })
      }
      for (const s of skills) {
        const dest = path.join(dir, s.name)
        let status
        if (fs.existsSync(dest)) {
          const st = fs.lstatSync(dest)
          const linked = st.isSymbolicLink()
          const sameTarget = linked && path.resolve(fs.readlinkSync(dest)) === path.resolve(s.dir)
          if (sameTarget) status = 'уже на месте'
          else if (opts.force) status = 'перезапись'
          else status = `конфликт: ${linked ? 'ссылка' : 'каталог'} на другое место (--force)`
        } else {
          status = opts.mode === 'link' ? 'ссылка' : 'копия'
        }
        if (['ссылка', 'копия', 'перезапись'].includes(status)) {
          if (!opts.dryRun) {
            if (status === 'перезапись') fs.rmSync(dest, { recursive: true, force: true })
            if (opts.mode === 'link') makeLink(s.dir, dest)
            else copyDir(s.dir, dest)
          }
          if (status === 'перезапись') status = opts.mode === 'link' ? 'ссылка (перезапись)' : 'копия (перезапись)'
        }
        results.push({ label, note, dir, status, name: s.name })
      }
    }
  }

  const prefix = opts.dryRun ? '[план] ' : ''
  console.log(`${prefix}скиллов найдено: ${skills.length} — ${skills.map(s => s.name).join(', ')}`)
  console.log(`${prefix}режим: ${opts.mode === 'link' ? 'ссылки' : 'копии'}, область: ${opts.scope}, репозиторий: ${REPO}`)
  const grouped = new Map()
  for (const r of results) {
    const k = `${r.label}|${r.dir}|${r.note}`
    if (!grouped.has(k)) grouped.set(k, [])
    grouped.get(k).push(r)
  }
  for (const [k, rows] of grouped) {
    const [label, dir, note] = k.split('|')
    console.log(`\n${label}: ${dir}${note ? `  (${note})` : ''}`)
    for (const r of rows) console.log(`  ${r.name ? `· ${r.name} — ${r.status}` : `! ${r.status}`}`)
  }

  const conflicts = results.filter(r => r.status.startsWith('конфликт') || r.status.startsWith('предупреждение'))
  if (conflicts.length) {
    console.log(`\nВнимание: ${conflicts.length} записей требуют решения (см. выше).`)
    return 1
  }
  console.log(`\nГотово. Проверка: открой проект в нужной системе и убедись, что скилл виден в списке.`)
  return 0
}

try {
  process.exit(main())
} catch (err) {
  console.error(`ошибка: ${err.message}`)
  process.exit(2)
}
