import type {
  ComicAnalysis,
  PersistedEvidenceLocator,
} from '@comic-code/contracts'

export type AnalysisEvidence = {
  locator: PersistedEvidenceLocator
  maskedText: string
}

export type AnalysisInput = {
  repository: string
  description: string
  ref: string
  commitSha: string
  evidence: AnalysisEvidence[]
  excludedFiles: string[]
  safetyIdentifier: string
}

export type GeneratedPanelArtwork = {
  sequence: 1 | 2 | 3 | 4
  png: Buffer
}

export type GeneratedComic = {
  analysis: ComicAnalysis
  panels: GeneratedPanelArtwork[]
  png: Buffer
  usage: {
    analysisInputTokens: number
    analysisOutputTokens: number
    verificationInputTokens: number
    verificationOutputTokens: number
  }
}
