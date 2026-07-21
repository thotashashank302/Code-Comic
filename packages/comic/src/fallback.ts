import type { ComicAnalysis } from '@comic-code/contracts'
import { comicAnalysisSchema } from '@comic-code/contracts'

import type { AnalysisEvidence, AnalysisInput } from './types'

const fallbackAnalysisModel = 'deterministic-source-scan-v4'
const fallbackImageModel = 'storyboard-fallback-v1'

export const deterministicFallbackModels = {
  analysis: fallbackAnalysisModel,
  image: fallbackImageModel,
} as const

function errorProperty(error: unknown, property: string) {
  if (!error || typeof error !== 'object' || !(property in error)) return null
  const value = (error as Record<string, unknown>)[property]
  return typeof value === 'string' || typeof value === 'number' ? value : null
}

export function isOpenAIQuotaError(error: unknown) {
  const status = errorProperty(error, 'status')
  const code = errorProperty(error, 'code')
  const message = error instanceof Error ? error.message : ''

  if (code === 'insufficient_quota') return true
  if (status !== 429) return false
  return /current quota|billing quota|run out of credits|no balance left/i.test(
    message,
  )
}

function plural(value: number, singular: string, pluralForm = `${singular}s`) {
  return value === 1 ? singular : pluralForm
}

const languageByExtension: Record<string, string> = {
  c: 'C',
  cc: 'C++',
  cpp: 'C++',
  cs: 'C#',
  css: 'CSS',
  go: 'Go',
  gql: 'GraphQL',
  graphql: 'GraphQL',
  html: 'HTML',
  java: 'Java',
  js: 'JavaScript',
  json: 'JSON',
  jsx: 'JavaScript React',
  kt: 'Kotlin',
  php: 'PHP',
  py: 'Python',
  rb: 'Ruby',
  rs: 'Rust',
  scss: 'SCSS',
  sh: 'shell',
  sql: 'SQL',
  swift: 'Swift',
  ts: 'TypeScript',
  tsx: 'TypeScript React',
  vue: 'Vue',
  yaml: 'YAML',
  yml: 'YAML',
}

const codeFeaturePatterns = [
  {
    label: 'module dependencies',
    pattern: /\b(?:import|export|require|include|using)\b/,
  },
  {
    label: 'function and method logic',
    pattern:
      /\b(?:function|def|func|fn|lambda|async)\b|(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?\(/,
  },
  {
    label: 'data shapes and classes',
    pattern: /\b(?:class|interface|type|struct|enum|record|schema)\b/,
  },
  {
    label: 'branching decisions',
    pattern: /\b(?:if|else|switch|case|match|when)\b|\?[^:?]+:/,
  },
  {
    label: 'iteration',
    pattern: /\b(?:for|while|map|filter|reduce|flatMap|forEach)\b/,
  },
  {
    label: 'asynchronous operations',
    pattern: /\b(?:async|await|Promise|then|Future|Task)\b/,
  },
  {
    label: 'error handling',
    pattern: /\b(?:try|catch|throw|except|rescue|Error)\b/,
  },
  {
    label: 'input validation',
    pattern: /\b(?:parse|safeParse|validate|validator|schema|sanitize)\b/,
  },
  {
    label: 'network requests',
    pattern: /\b(?:fetch|request|axios|HTTP|GET|POST|PUT|PATCH|DELETE)\b/,
  },
  {
    label: 'database operations',
    pattern: /\b(?:select|insert|update|delete|query|transaction|database)\b/i,
  },
  {
    label: 'interface state and events',
    pattern:
      /\b(?:useState|useEffect|onClick|onChange|setState|render)\b|<[A-Z][A-Za-z0-9]*/,
  },
  {
    label: 'automated tests',
    pattern: /\b(?:describe|test|it|expect|assert|pytest|unittest)\b/,
  },
  {
    label: 'access and security checks',
    pattern:
      /\b(?:auth|permission|access|session|token|secret|encrypt|hash)\w*\b/i,
  },
] as const

type CodeProfile = ReturnType<typeof buildCodeProfile>

function fixedList(values: string[]) {
  if (values.length === 0) return 'general executable logic'
  if (values.length === 1) return values[0]!
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values[0]}, ${values[1]}, and ${values[2]}`
}

function buildCodeProfile(evidence: AnalysisEvidence[]) {
  let inspectedLines = 0
  const languages = new Set<string>()
  const featureEvidence = new Map<string, Set<string>>()

  for (const item of evidence) {
    const extension = item.locator.filePath?.split('.').at(-1)?.toLowerCase()
    if (extension && languageByExtension[extension]) {
      languages.add(languageByExtension[extension])
    }
    for (const rawLine of item.maskedText.split('\n')) {
      const isAdded = rawLine.startsWith('+') && !rawLine.startsWith('+++')
      const isRemoved = rawLine.startsWith('-') && !rawLine.startsWith('---')
      if (rawLine.startsWith('@@') || rawLine.startsWith('---')) continue
      inspectedLines += 1
      const line = (
        isAdded || isRemoved
          ? rawLine.slice(1)
          : rawLine.replace(/^\d+:\s?/, '')
      ).slice(0, 500)
      for (const feature of codeFeaturePatterns) {
        if (!feature.pattern.test(line)) continue
        const ids = featureEvidence.get(feature.label) ?? new Set<string>()
        ids.add(item.locator.id)
        featureEvidence.set(feature.label, ids)
      }
    }
  }

  return {
    inspectedLines,
    languages: [...languages].slice(0, 3),
    features: [...featureEvidence.keys()],
    evidenceFor(features: string[], fallbackIds: string[]) {
      const ids = new Set<string>()
      for (const feature of features) {
        for (const id of featureEvidence.get(feature) ?? []) ids.add(id)
      }
      return [...ids].slice(0, 12).length ? [...ids].slice(0, 12) : fallbackIds
    },
  }
}

function codeScope(profile: CodeProfile, fileCount: number) {
  const language = profile.languages.length
    ? fixedList(profile.languages)
    : 'source-code'
  return `${profile.inspectedLines} sampled source ${plural(profile.inspectedLines, 'line')} across ${fileCount} ${language} ${plural(fileCount, 'file')}`
}

function runtimeStory(profile: CodeProfile) {
  const selected = [
    'interface state and events',
    'network requests',
    'input validation',
    'asynchronous operations',
    'branching decisions',
    'database operations',
    'error handling',
    'iteration',
  ].filter((feature) => profile.features.includes(feature))
  if (selected.length === 0) {
    return 'Selected source contains executable structure without a detected common runtime pattern.'
  }
  return `Selected code connects ${fixedList(selected.slice(0, 3))} in its execution path.`
}

export function createDeterministicComicAnalysis(
  input: AnalysisInput,
): ComicAnalysis {
  const codeEvidence = input.evidence.filter(
    (evidence) =>
      evidence.locator.source === 'source_file' ||
      evidence.locator.source === 'code_context' ||
      evidence.locator.source === 'diff',
  )
  const evidenceIds = input.evidence
    .slice(0, 12)
    .map(({ locator }) => locator.id)
  const codeEvidenceIds = codeEvidence
    .slice(0, 12)
    .map(({ locator }) => locator.id)
  const supportingIds = codeEvidenceIds.length ? codeEvidenceIds : evidenceIds
  const paths = [
    ...new Set(
      codeEvidence
        .map(({ locator }) => locator.filePath)
        .filter((path): path is string => Boolean(path)),
    ),
  ]
  const firstEvidence = codeEvidence[0] ?? input.evidence[0]!
  const lastEvidence = codeEvidence.at(-1) ?? input.evidence.at(-1)!
  const hasCode = codeEvidence.length > 0
  const codeProfile = buildCodeProfile(codeEvidence)
  const narrativeFeatureOrder = [
    'input validation',
    'network requests',
    'database operations',
    'interface state and events',
    'branching decisions',
    'asynchronous operations',
    'error handling',
    'iteration',
    'automated tests',
    'access and security checks',
    'data shapes and classes',
    'function and method logic',
    'module dependencies',
  ]
  const codeFeatures = narrativeFeatureOrder
    .filter((feature) => codeProfile.features.includes(feature))
    .slice(0, 3)
  const codeFeatureSummary = fixedList(codeFeatures)
  const runtimeSummary = runtimeStory(codeProfile)
  const scopeSummary = codeScope(codeProfile, Math.max(paths.length, 1))
  const featureEvidenceIds = codeProfile.evidenceFor(
    codeFeatures,
    supportingIds,
  )

  const claims: ComicAnalysis['claims'] = [
    {
      id: 'fallback-claim-1',
      text: hasCode
        ? `Local structural scan inspected ${scopeSummary}.`
        : 'No executable source evidence was available for local scanning.',
      support: 'direct',
      evidenceIds: supportingIds,
      confidence: 'high',
    },
    {
      id: 'fallback-claim-2',
      text: hasCode
        ? `Selected code contains ${codeFeatureSummary}.`
        : 'Only repository metadata was available.',
      support: 'direct',
      evidenceIds: featureEvidenceIds,
      confidence: 'high',
    },
    {
      id: 'fallback-claim-3',
      text: hasCode
        ? runtimeSummary
        : 'No runtime flow could be detected without source evidence.',
      support: 'direct',
      evidenceIds: codeProfile.evidenceFor(
        [
          'interface state and events',
          'network requests',
          'input validation',
          'asynchronous operations',
          'branching decisions',
          'database operations',
          'error handling',
          'iteration',
        ],
        [firstEvidence.locator.id],
      ),
      confidence: 'high',
    },
    {
      id: 'fallback-claim-4',
      text: hasCode
        ? codeProfile.features.includes('automated tests')
          ? 'Selected source includes automated test or assertion logic.'
          : `Selected source exposes ${codeFeatureSummary} for structural review.`
        : 'No code outcome can be described without source evidence.',
      support: 'direct',
      evidenceIds: codeProfile.evidenceFor(
        ['automated tests'],
        [lastEvidence.locator.id],
      ),
      confidence: 'high',
    },
  ]

  const structuralSummary = hasCode
    ? `Local scan mapped ${scopeSummary} and detected ${codeFeatureSummary}.`
    : 'No executable source evidence was available for this structural preview.'

  return comicAnalysisSchema.parse({
    generationMode: 'deterministic_fallback',
    plainLanguageSummary: `${structuralSummary} Comic Code used its API-free local mode and did not send this explanation to the OpenAI API.`,
    metaphor:
      'A machine opened into components, pathways, safeguards, and output.',
    sharedVisualStyle:
      'Minimal editorial code-flow diagrams with deep indigo fields, violet paths, and one amber checkpoint per panel.',
    panels: [
      {
        sequence: 1,
        purpose: 'overview',
        title: 'System overview',
        caption: structuralSummary,
        scenePrompt:
          'A dark machine opened to reveal its connected source modules and main purpose.',
        claimIds: ['fallback-claim-1'],
        confidence: 'high',
        uncertaintyNote: null,
      },
      {
        sequence: 2,
        purpose: 'components',
        title: 'Parts that work',
        caption: hasCode
          ? `Selected source uses ${codeFeatureSummary} across ${paths.length} ${plural(paths.length, 'file')}.`
          : 'No source components were available for local scanning.',
        scenePrompt:
          'Abstract source modules representing detected logic features connected inside one engine.',
        claimIds: ['fallback-claim-2'],
        confidence: 'high',
        uncertaintyNote: null,
      },
      {
        sequence: 3,
        purpose: 'flow',
        title: 'How code flows',
        caption: claims[2]!.text,
        scenePrompt:
          'A clear execution path moving through input, decision, processing, and output checkpoints.',
        claimIds: ['fallback-claim-3'],
        confidence: 'high',
        uncertaintyNote: null,
      },
      {
        sequence: 4,
        purpose: 'outcome',
        title: 'Result and safeguards',
        caption: claims[3]!.text,
        scenePrompt:
          'A final output gate showing detected safeguards, tests, and resulting behavior.',
        claimIds: ['fallback-claim-4'],
        confidence: 'medium',
        uncertaintyNote:
          'Local mode maps code structure. Add a Workers AI key for semantic analysis and unique artwork.',
      },
    ],
    claims,
    uncertainties: [
      'API-free local analysis detects code structure and flow patterns but does not infer unstated business intent.',
    ],
    evidence: input.evidence.map(({ locator }) => locator),
    excludedFiles: input.excludedFiles,
  })
}
