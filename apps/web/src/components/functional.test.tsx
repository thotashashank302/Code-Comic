// @vitest-environment jsdom
import React, { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSampleExplanation } from '@comic-code/comic/sample'
import { ComicCodeApp } from './comic-code-app'
import { ShareView } from './share-view'

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement('img', {
      src: props.src as string,
      alt: props.alt as string,
    }),
}))
vi.mock('next/link', () => ({
  default: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <a {...props}>{children}</a>
  ),
}))

let root: Root
let container: HTMLDivElement
function json(value: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(value), { status }))
}
async function settle() {
  await act(async () => {
    if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(1)
    else await new Promise((resolve) => setTimeout(resolve, 10))
  })
}
function button(text: string) {
  return [...container.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === text,
  )!
}
async function change(selector: string, value: string) {
  const element = container.querySelector(selector) as HTMLInputElement
  await act(async () => {
    const prototype =
      element.tagName === 'SELECT'
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(
      element,
      value,
    )
    element.dispatchEvent(
      new Event(element.tagName === 'SELECT' ? 'change' : 'input', {
        bubbles: true,
      }),
    )
  })
  await settle()
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  window.history.replaceState(null, '', '/')
  HTMLElement.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 0
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('web functional recovery', () => {
  it('refreshes a shared artifact URL while keeping the token out of the address bar', async () => {
    vi.useFakeTimers()
    window.history.replaceState(
      null,
      '',
      '/share/example#token=private-test-capability',
    )
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            explanation: {
              ...getSampleExplanation(4),
              artifactUrl: 'https://storage.example/old.png',
            },
          }),
        ),
      )
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            explanation: {
              ...getSampleExplanation(4),
              artifactUrl: 'https://storage.example/new.png',
            },
          }),
        ),
      )
    vi.stubGlobal('fetch', fetch)
    await act(async () => root.render(<ShareView shareId="example" />))
    await settle()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(240001)
    })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://storage.example/new.png',
    )
    expect(window.location.hash).toBe('')
  })

  it('refreshes an authenticated hosted comic URL before its signed link expires', async () => {
    vi.useFakeTimers()
    const comic = {
      ...getSampleExplanation(4),
      id: 'hosted-comic',
      repository: 'owner/repo',
      artifactUrl: 'https://storage.example/old.png',
    }
    const fetch = vi.fn((url: string, options?: RequestInit) => {
      if (url.includes('/auth/me'))
        return json({ user: { id: 'user', login: 'user' }, mode: 'hosted' })
      if (url.includes('/github/repository'))
        return json({
          repository: {
            owner: 'owner',
            repository: 'repo',
            ref: 'main',
            defaultBranch: 'main',
            commitSha: 'a'.repeat(40),
            description: 'Repository',
            htmlUrl: 'https://github.com/owner/repo',
            isPrivate: false,
            totalFiles: 1,
            selectedFileCount: 1,
            excludedFileCount: 0,
            representativeFiles: ['src/main.ts'],
            languages: ['TypeScript'],
          },
        })
      return json({
        explanation:
          options?.method === 'POST'
            ? comic
            : { ...comic, artifactUrl: 'https://storage.example/new.png' },
      })
    })
    vi.stubGlobal('fetch', fetch)
    await act(async () => root.render(<ComicCodeApp />))
    await settle()
    await change('#repository-url', 'https://github.com/owner/repo')
    await act(async () => button('Inspect').click())
    await settle()
    await act(async () => button('Generate fixed comic').click())
    await settle()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(240001)
    })
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://storage.example/new.png',
    )
    expect(
      fetch.mock.calls.some(
        ([url]) => url === '/api/v1/explanations/hosted-comic',
      ),
    ).toBe(true)
  })

  it('selects a saved comic without leaving a sample repository selected for regeneration', async () => {
    const saved = {
      ...getSampleExplanation(4),
      id: 'saved-comic',
      repository: 'owner/actual-repo',
      ref: 'feature/new',
      status: 'completed',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/auth/me'))
          return json({ user: { id: 'local', login: 'local' }, mode: 'local' })
        if (url.endsWith('/saved-comic')) return json({ explanation: saved })
        return json({ explanations: [saved] })
      }),
    )
    await act(async () => root.render(<ComicCodeApp />))
    await settle()
    await act(async () => button('Explore a sample').click())
    await settle()
    await change('#recent-comic', 'saved-comic')
    expect(
      container.querySelector<HTMLInputElement>('#repository-url')!.value,
    ).toBe('https://github.com/owner/actual-repo/tree/feature/new')
    expect(button('Regenerate fixed comic')).toBeUndefined()
    expect(container.textContent).not.toContain('sample / reading-list')
    expect(container.querySelector('a[download]')).not.toBeNull()
  })

  it('keeps local authentication when loading saved comics fails and allows a new inspection', async () => {
    const fetch = vi.fn((url: string) => {
      if (url.includes('/auth/me'))
        return json({ user: { id: 'local', login: 'local' }, mode: 'local' })
      if (url.includes('/github/repository'))
        return json({ error: 'repository_not_found' }, 404)
      return json({ error: 'local_storage_unavailable' }, 507)
    })
    vi.stubGlobal('fetch', fetch)
    await act(async () => root.render(<ComicCodeApp />))
    await settle()
    await change('#repository-url', 'https://github.com/owner/repo')
    await act(async () => button('Inspect').click())
    await settle()
    expect(
      fetch.mock.calls.some(([url]) => url.includes('/github/repository')),
    ).toBe(true)
  })

  it('keeps a share capability in memory through Strict Mode replay after removing the fragment', async () => {
    window.history.replaceState(
      null,
      '',
      '/share/example#token=private-test-capability',
    )
    const fetch = vi.fn(
      (_url: string, options: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          options.signal!.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
          setTimeout(() => {
            if (!options.signal!.aborted)
              resolve(
                new Response(
                  JSON.stringify({
                    explanation: {
                      ...getSampleExplanation(4),
                      repository: 'owner/shared',
                    },
                  }),
                ),
              )
          }, 0)
        }),
    )
    vi.stubGlobal('fetch', fetch)
    await act(async () =>
      root.render(
        <StrictMode>
          <ShareView shareId="example" />
        </StrictMode>,
      ),
    )
    await settle()
    expect(window.location.hash).toBe('')
    expect(container.textContent).toContain('owner/shared')
    expect(container.textContent).not.toContain(
      'This link is no longer available',
    )
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[1]![1].body).toBe(
      JSON.stringify({ token: 'private-test-capability' }),
    )
  })
})
