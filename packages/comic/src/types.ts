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
  panelCount?: 4 | 12
}

export type GeneratedPanelArtwork = {
  sequence: number
  png: Buffer
}
