import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const outputDirectory = path.resolve(
  scriptDirectory,
  '../../../apps/extension/public/icon',
)
const iconSizes = [16, 32, 48, 128]
const source = Buffer.from(`
  <svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="background" cx="70%" cy="25%" r="90%">
        <stop offset="0" stop-color="#292a9b" />
        <stop offset="0.55" stop-color="#11116d" />
        <stop offset="1" stop-color="#05050d" />
      </radialGradient>
    </defs>
    <rect width="128" height="128" rx="28" fill="url(#background)" />
    <path d="M64 18c7.1 23.3 22.7 38.9 46 46-23.3 7.1-38.9 22.7-46 46-7.1-23.3-22.7-38.9-46-46 23.3-7.1 38.9-22.7 46-46Z" fill="#f8f8ff" />
    <path d="M64 43c3.2 10.5 10.5 17.8 21 21-10.5 3.2-17.8 10.5-21 21-3.2-10.5-10.5-17.8-21-21 10.5-3.2 17.8-10.5 21-21Z" fill="#080814" />
    <circle cx="102" cy="27" r="7" fill="#ffb53e" />
  </svg>
`)

await mkdir(outputDirectory, { recursive: true })
await Promise.all(
  iconSizes.map((size) =>
    sharp(source)
      .resize(size, size)
      .png()
      .toFile(path.join(outputDirectory, `${size}.png`)),
  ),
)
