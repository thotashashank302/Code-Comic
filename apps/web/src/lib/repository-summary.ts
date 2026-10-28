export function detectedLanguages(paths: string[]) {
  const names: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TypeScript',
    js: 'JavaScript',
    jsx: 'JavaScript',
    py: 'Python',
    go: 'Go',
    rs: 'Rust',
    java: 'Java',
    rb: 'Ruby',
    php: 'PHP',
    cs: 'C#',
    cpp: 'C++',
    c: 'C',
    swift: 'Swift',
    kt: 'Kotlin',
  }
  const counts = new Map<string, number>()
  for (const path of paths) {
    const extension = path.split('.').at(-1)?.toLowerCase()
    const name = extension ? names[extension] : undefined
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([name]) => name)
}
