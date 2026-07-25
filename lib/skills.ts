import { readFile } from 'fs/promises'
import { createHash } from 'crypto'
import { join } from 'path'

const SKILL_BASE = join(process.cwd(), '.grok', 'skills')

const SKILL_PATHS: Record<string, string[]> = {
  core: [
    join(SKILL_BASE, 'actions', 'core-principles', 'SKILL.md'),
  ],
  'create-contact': [
    join(SKILL_BASE, 'actions', 'create-contact', 'SKILL.md'),
  ],
  'update-contact': [
    join(SKILL_BASE, 'actions', 'create-contact', 'SKILL.md'),
  ],
  'create-invoice-draft': [
    join(SKILL_BASE, 'actions', 'create-invoice-draft', 'SKILL.md'),
  ],
}

export async function loadSkill(skill: string): Promise<string> {
  return (await loadVersionedSkill(skill))?.content || ''
}

export type VersionedSkill = { name: string; version: string; content: string }

export async function loadVersionedSkill(skill: string): Promise<VersionedSkill | null> {
  const normalized = (skill || '').toLowerCase().trim()
  const candidates = SKILL_PATHS[normalized] || []

  for (const p of candidates) {
    try {
      const content = await readFile(p, 'utf8')
      if (content && content.trim()) return versioned(normalized, content)
    } catch { /* try next */ }
  }

  return null
}

function versioned(name: string, content: string): VersionedSkill {
  const normalized = content.trim()
  return { name, content: normalized, version: `sha256:${createHash('sha256').update(normalized).digest('hex')}` }
}
