import * as fs from 'fs'
import * as path from 'path'
import { createTeardown } from 'fs-teardown'
import { spawnSync } from 'child_process'
import { invariant } from 'outvariant'

const fsMock = createTeardown({
  rootDir: path.resolve(__dirname, 'node-esm-tests'),
  paths: {
    'package.json': JSON.stringify({ type: 'module' }),
  },
})

async function getLibraryTarball(): Promise<string> {
  const ROOT_PATH = path.resolve(__dirname, '../..')
  const { version } = require(`${ROOT_PATH}/package.json`)
  const packFilename = `msw-${version}.tgz`
  const packPath = path.resolve(ROOT_PATH, packFilename)

  if (fs.existsSync(packPath)) {
    return packPath
  }

  const out = spawnSync('pnpm', ['pack'], { cwd: ROOT_PATH })

  if (out.error) {
    console.error(out.error)
  }

  invariant(
    fs.existsSync(packPath),
    'Failed to pack the library at "%s"',
    packPath,
  )

  return packPath
}

async function installLibrary() {
  const TARBALL_PATH = await getLibraryTarball()
  const installStdio = await fsMock.exec(`pnpm install $TARBALL_PATH`, {
    env: { TARBALL_PATH },
  })

  if (installStdio.stderr) {
    console.error(installStdio.stderr)
    return Promise.reject(
      'Failed to install the library. See the stderr output above.',
    )
  }

  /** @todo Assert that pnpm printed success:
   * + msw 0.0.0-fetch.rc-11
   */
}

beforeAll(async () => {
  await fsMock.prepare()
  await installLibrary()
})

afterAll(async () => {
  await fsMock.cleanup()
})

it('runs in a ESM Node.js project', async () => {
  await fsMock.create({
    'resolve.mjs': `
console.log('msw:', await import.meta.resolve('msw'))
console.log('msw/node:', await import.meta.resolve('msw/node'))
console.log('msw/native:', await import.meta.resolve('msw/native'))
`,
    'runtime.mjs': `
import { rest } from 'msw'
import { setupServer } from 'msw/node'
const server = setupServer(
  rest.get('/resource', () => new Response())
)
console.log(typeof server.listen)
`,
  })

  const resolveStdio = await fsMock.exec(
    /**
     * @note Using the import meta resolve flag
     * to enable the "import.meta.resolve" API to see
     * what library imports resolve to in Node.js ESM.
     */
    'node --experimental-import-meta-resolve ./resolve.mjs',
  )
  expect(resolveStdio.stderr).toBe('')
  /**
   * @todo Take these expected export paths from package.json.
   * That should be the source of truth.
   */
  expect(resolveStdio.stdout).toMatch(
    /^msw: (.+?)\/node_modules\/msw\/lib\/core\/index\.mjs/m,
  )
  expect(resolveStdio.stdout).toMatch(
    /^msw\/node: (.+?)\/node_modules\/msw\/lib\/node\/index\.mjs/m,
  )
  expect(resolveStdio.stdout).toMatch(
    /^msw\/native: (.+?)\/node_modules\/msw\/lib\/native\/index\.mjs/m,
  )

  /**
   * @todo Also test the "msw/browser" import that throws,
   * saying that the "./browser" export is not defined.
   * That's correct, it's exlpicitly set as "browser: null" for Node.js.
   */

  const runtimeStdio = await fsMock.exec('node ./runtime.mjs')
  expect(runtimeStdio.stderr).toBe('')
  expect(runtimeStdio.stdout).toMatch(/function/m)
})

it('runs in a CJS Node.js project', async () => {
  await fsMock.create({
    'resolve.cjs': `
console.log('msw:', require.resolve('msw'))
console.log('msw/node:', require.resolve('msw/node'))
console.log('msw/native:', require.resolve('msw/native'))
`,
    'runtime.cjs': `
import { rest } from 'msw'
import { setupServer } from 'msw/node'
const server = setupServer(
  rest.get('/resource', () => new Response())
)
console.log(typeof server.listen)
`,
  })

  const resolveStdio = await fsMock.exec('node ./resolve.cjs')
  expect(resolveStdio.stderr).toBe('')
  /**
   * @todo Take these expected export paths from package.json.
   * That should be the source of truth.
   */
  expect(resolveStdio.stdout).toMatch(
    /^msw: (.+?)\/node_modules\/msw\/lib\/core\/index\.js/m,
  )
  expect(resolveStdio.stdout).toMatch(
    /^msw\/node: (.+?)\/node_modules\/msw\/lib\/node\/index\.js/m,
  )
  expect(resolveStdio.stdout).toMatch(
    /^msw\/native: (.+?)\/node_modules\/msw\/lib\/native\/index\.js/m,
  )

  const runtimeStdio = await fsMock.exec('node ./runtime.mjs')
  expect(runtimeStdio.stderr).toBe('')
  expect(runtimeStdio.stdout).toMatch(/function/m)
})