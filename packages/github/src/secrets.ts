const secretPatterns: RegExp[] = [
  /\b(?:sk|sk-proj)-[A-Za-z0-9_-]{16,}\b/g,
  /\bgh[opsu]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{24,}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}\b/gi,
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"']+/gi,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /\b(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*["']?[^\s"']{8,}/gi,
]

function shannonEntropy(value: string) {
  const frequencies = new Map<string, number>()
  for (const character of value) {
    frequencies.set(character, (frequencies.get(character) ?? 0) + 1)
  }

  let entropy = 0
  for (const count of frequencies.values()) {
    const probability = count / value.length
    entropy -= probability * Math.log2(probability)
  }
  return entropy
}

function maskHighEntropyTokens(value: string) {
  return value.replace(/[A-Za-z0-9_+/=-]{32,}/g, (token) => {
    if (token.includes('REDACTED_SECRET')) return token
    return shannonEntropy(token) >= 4.2 ? '<REDACTED_SECRET>' : token
  })
}

export function maskSecrets(value: string) {
  let masked = value
  for (const pattern of secretPatterns) {
    pattern.lastIndex = 0
    masked = masked.replace(pattern, '<REDACTED_SECRET>')
  }
  return maskHighEntropyTokens(masked)
}
