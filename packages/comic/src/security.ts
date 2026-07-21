import { createHmac } from 'node:crypto'

export function createSafetyIdentifier(userId: string, secret: string) {
  return createHmac('sha256', secret)
    .update(`comic-code:${userId}`)
    .digest('hex')
}

const prohibitedOutputPatterns = [
  /https?:\/\//i,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
  /\b(?:sk|sk-proj)-[A-Za-z0-9_-]{12,}\b/,
  /\bgh[opsu]_[A-Za-z0-9]{16,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{16,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/\S+/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b[A-Za-z0-9_+/=-]{48,}\b/,
]

export function assertSafeGeneratedText(value: string) {
  for (const pattern of prohibitedOutputPatterns) {
    if (pattern.test(value)) {
      throw new Error('Generated output contains disallowed sensitive text')
    }
  }
}

export function sanitizeScenePrompt(value: string) {
  const withoutCode = value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/(?:^|\s)[\w.-]+\/(?:[\w./-]+)(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  assertSafeGeneratedText(withoutCode)
  return withoutCode
}

function normalizeComparable(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function assertNoVerbatimEvidence(
  generated: string,
  evidence: string[],
) {
  const normalizedGenerated = normalizeComparable(generated)
  for (const block of evidence) {
    for (const rawLine of block.split('\n')) {
      const line = normalizeComparable(rawLine.replace(/^[+\- ]/, ''))
      if (
        line.length >= 32 &&
        !line.startsWith('@@') &&
        normalizedGenerated.includes(line)
      ) {
        throw new Error('Generated output repeats source evidence verbatim')
      }
    }
  }
}
