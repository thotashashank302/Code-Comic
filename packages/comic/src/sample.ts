import type { ComicAnalysis } from '@comic-code/contracts'

// Illustrative source and claims for UI review; never presented as a live scan.
export const sampleAnalysis: ComicAnalysis = {
  plainLanguageSummary:
    'An illustrative reading-list app accepts a book, checks its details, saves it, and shows the updated list.',
  metaphor:
    'A small library desk: receive, check, shelve, and share the result.',
  sharedVisualStyle:
    'Light paper, chartreuse, pale pink, cool blue and warm peach; clean geometric diagrams.',
  generationMode: 'deterministic_fallback',
  artworkProvider: 'template',
  panels: [
    {
      sequence: 1,
      purpose: 'overview',
      title: 'A book comes in',
      caption:
        'A reader adds a book. The form passes its title and author to the app.',
      scenePrompt: 'A form input connects to one request node.',
      claimIds: ['sample-1'],
      confidence: 'high',
      uncertaintyNote: null,
    },
    {
      sequence: 2,
      purpose: 'components',
      title: 'The details get checked',
      caption:
        'The validation step checks the required fields before the book can continue.',
      scenePrompt: 'Three fields connect to a validation gate.',
      claimIds: ['sample-2'],
      confidence: 'high',
      uncertaintyNote: null,
    },
    {
      sequence: 3,
      purpose: 'flow',
      title: 'A place on the shelf',
      caption:
        'The storage step saves the checked book so it can appear in the reading list.',
      scenePrompt: 'One book entry moves to three storage rows.',
      claimIds: ['sample-3'],
      confidence: 'high',
      uncertaintyNote: null,
    },
    {
      sequence: 4,
      purpose: 'outcome',
      title: 'The list comes to life',
      caption:
        'The interface shows the new book. The reader can see that the action finished.',
      scenePrompt: 'Three list rows and one completion marker.',
      claimIds: ['sample-4'],
      confidence: 'high',
      uncertaintyNote:
        'Illustrative sample only. No repository was fetched or verified.',
    },
  ],
  claims: [
    {
      id: 'sample-1',
      text: 'The example form collects a title and author.',
      support: 'direct',
      evidenceIds: ['sample-form'],
      confidence: 'high',
    },
    {
      id: 'sample-2',
      text: 'The example checks required book fields.',
      support: 'direct',
      evidenceIds: ['sample-validation'],
      confidence: 'high',
    },
    {
      id: 'sample-3',
      text: 'The example stores a checked book.',
      support: 'direct',
      evidenceIds: ['sample-storage'],
      confidence: 'high',
    },
    {
      id: 'sample-4',
      text: 'The example renders the updated reading list.',
      support: 'direct',
      evidenceIds: ['sample-list'],
      confidence: 'high',
    },
  ],
  evidence: [
    {
      id: 'sample-form',
      source: 'source_file',
      filePath: 'src/book-form.tsx',
      newStart: 12,
      newEnd: 24,
      contentHash: '1'.repeat(64),
    },
    {
      id: 'sample-validation',
      source: 'source_file',
      filePath: 'src/validate-book.ts',
      newStart: 3,
      newEnd: 11,
      contentHash: '2'.repeat(64),
    },
    {
      id: 'sample-storage',
      source: 'source_file',
      filePath: 'src/library.ts',
      newStart: 8,
      newEnd: 17,
      contentHash: '3'.repeat(64),
    },
    {
      id: 'sample-list',
      source: 'source_file',
      filePath: 'src/reading-list.tsx',
      newStart: 6,
      newEnd: 20,
      contentHash: '4'.repeat(64),
    },
  ],
  excludedFiles: [],
  uncertainties: [
    'This bundled sample demonstrates the interface. It is not a live repository analysis.',
  ],
}

export const sampleRepository = {
  owner: 'sample',
  repository: 'reading-list',
  description: 'A little library, explained in four panels.',
  htmlUrl: '',
  isPrivate: false,
  defaultBranch: 'main',
  ref: 'main',
  commitSha: '0123456789abcdef0123456789abcdef01234567',
  totalFiles: 4,
  selectedFileCount: 4,
  excludedFileCount: 0,
  representativeFiles: sampleAnalysis.evidence.map((item) => item.filePath!),
  languages: ['TypeScript'],
}

export const sampleExplanation = {
  id: 'sample-reading-list',
  repository: 'sample/reading-list',
  ref: 'main',
  commitSha: sampleRepository.commitSha,
  scanSummary: { selectedFileCount: 4 },
  status: 'completed',
  progress: {
    percent: 100,
    message: 'Sample story ready',
    updatedAt: '2026-10-28T00:00:00.000Z',
  },
  analysis: sampleAnalysis,
  artifactUrl: '/sample-comic.png',
  errorCode: null,
  error: null,
  expiresAt: '2099-01-01T00:00:00.000Z',
}
