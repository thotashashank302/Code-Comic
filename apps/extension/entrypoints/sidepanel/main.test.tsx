// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSampleExplanation } from '@comic-code/comic/sample'
import { SidePanelShell } from './main'

let root: Root
let container: HTMLDivElement
let changeCoordinate: (changes: Record<string, unknown>, area: string) => void
let finishGeneration: (response: Response) => void
let failGeneration: (error: Error) => void
function json(value: unknown) {
  return new Response(JSON.stringify(value))
}
const repository = (name: string) => ({
  owner: 'owner',
  repository: name,
  ref: 'main',
  defaultBranch: 'main',
  description: name,
  commitSha: 'a'.repeat(40),
  totalFiles: 1,
  selectedFileCount: 1,
  excludedFileCount: 0,
  representativeFiles: ['src/main.ts'],
  languages: ['TypeScript'],
})
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  window.history.replaceState(null, '', '/')
  vi.stubGlobal('chrome', {
    tabs: {
      query: vi
        .fn()
        .mockResolvedValue([{ url: 'https://github.com/owner/repo-a' }]),
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
      onChanged: {
        addListener: (listener: typeof changeCoordinate) => {
          changeCoordinate = listener
        },
        removeListener: vi.fn(),
      },
    },
    sidePanel: {},
  })
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, options?: RequestInit) => {
      if (input.includes('/auth/me'))
        return Promise.resolve(json({ mode: 'local' }))
      if (input.includes('/github/repository'))
        return Promise.resolve(
          json({
            repository: repository(
              decodeURIComponent(input).includes('repo-b')
                ? 'repo-b'
                : 'repo-a',
            ),
          }),
        )
      if (options?.method === 'POST')
        return new Promise<Response>((resolve, reject) => {
          finishGeneration = resolve
          failGeneration = reject
        })
      return Promise.resolve(json({}))
    }),
  )
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function startThenSwitch() {
  await act(async () => root.render(<SidePanelShell />))
  await settle()
  const generate = [...container.querySelectorAll('button')].find(
    (button) => button.textContent?.includes('Generate') && !button.disabled,
  )!
  expect(generate).toBeDefined()
  await act(async () => generate.click())
  await settle()
  await act(async () =>
    changeCoordinate(
      {
        comicCodeCoordinate: {
          newValue: { owner: 'owner', repository: 'repo-b' },
        },
      },
      'local',
    ),
  )
  await settle()
  expect(container.textContent).toContain('repo-b')
}
describe('extension repository-switch race', () => {
  it('does not show the previous repository result after switching repositories', async () => {
    await startThenSwitch()
    await act(async () =>
      finishGeneration(
        json({
          explanation: {
            ...getSampleExplanation(4),
            id: 'old-comic',
            repository: 'owner/repo-a',
            progress: {
              percent: 100,
              message: 'OLD REPOSITORY COMIC',
              updatedAt: new Date().toISOString(),
            },
          },
        }),
      ),
    )
    await settle()
    expect(container.textContent).not.toContain('OLD REPOSITORY COMIC')
  })
  it('does not attach a previous repository failure to the new repository', async () => {
    await startThenSwitch()
    await act(async () => failGeneration(new Error('github_rate_limited')))
    await settle()
    expect(container.textContent).not.toContain('GitHub request limit reached')
  })
})
