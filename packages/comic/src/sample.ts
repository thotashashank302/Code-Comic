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

const sampleChapters = [
  [
    'Start with a book',
    'A reader decides to add a book to the reading list.',
    'A reader brings one book to a small library desk.',
    0,
  ],
  [
    'Collect its details',
    'The form collects the book title and author before sending it onward.',
    'A reader places two simple information cards beside a book.',
    0,
  ],
  [
    'Hand the details onward',
    'The form passes the entered details to the validation step.',
    'A library clerk hands two cards to a second checking desk.',
    0,
  ],
  [
    'Check required fields',
    'The validation step checks that the required information is present.',
    'A careful reviewer examines the cards beside a book.',
    1,
  ],
  [
    'Keep incomplete entries out',
    'Missing required details prevent an incomplete book from continuing.',
    'An incomplete parcel waits beside a gentle stop gate.',
    1,
  ],
  [
    'Pass on a checked book',
    'Only the checked book continues to the storage step.',
    'A checked parcel passes through a gate toward a shelf.',
    1,
  ],
  [
    'Choose a place to store it',
    'The storage step receives the checked title and author.',
    'A librarian receives a checked parcel in an archive room.',
    2,
  ],
  [
    'Save the checked details',
    'The storage step saves the book so it can appear in the list.',
    'A librarian places a new book into a neat shelf compartment.',
    2,
  ],
  [
    'Return the stored book',
    'The saved book becomes available to the reading-list interface.',
    'A small archive returns a finished parcel to the front desk.',
    2,
  ],
  [
    'Update the reading list',
    'The interface includes the saved book in the list shown to the reader.',
    'A display of books gains one new carefully placed book.',
    3,
  ],
  [
    'Show the new entry',
    'The reader sees the title and author and can recognize the completed action.',
    'A reader views the newly placed book on a clear library display.',
    3,
  ],
  [
    'Review the whole journey',
    'The illustrative flow is form, validation, storage, then display. No live repository was fetched.',
    'A wide library scene connects receiving, checking, shelving and display desks.',
    3,
  ],
] as const

export const sampleDetailedAnalysis: ComicAnalysis = {
  ...sampleAnalysis,
  panels: sampleChapters.map(([title, caption, scenePrompt], index) => ({
    sequence: index + 1,
    title,
    caption,
    scenePrompt,
    purpose:
      index === 0
        ? 'overview'
        : index < 3
          ? 'components'
          : index < 11
            ? 'flow'
            : 'outcome',
    claimIds: [`sample-detail-${index + 1}`],
    confidence: 'medium',
    uncertaintyNote:
      index === 11
        ? 'Illustrative sample only. No repository was fetched or verified.'
        : null,
  })),
  claims: sampleChapters.map(([, text, , evidenceIndex], index) => ({
    id: `sample-detail-${index + 1}`,
    text,
    support: 'direct',
    confidence: 'medium',
    evidenceIds: [sampleAnalysis.evidence[evidenceIndex]!.id],
  })),
}

export function getSampleExplanation(panelCount: 4 | 12) {
  return panelCount === 4
    ? sampleExplanation
    : {
        ...sampleExplanation,
        id: 'sample-reading-list-12',
        analysis: sampleDetailedAnalysis,
        artifactUrl: '/sample-comic-12.png',
      }
}

export function getSampleRepository(panelCount: 4 | 12) {
  return {
    ...sampleRepository,
    description: `A little library, explained in ${panelCount} panels.`,
  }
}
