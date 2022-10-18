import {
  onUnhandledRequest,
  UnhandledRequestCallback,
} from './onUnhandledRequest'
import { RestHandler, RESTMethods } from '../../handlers/RestHandler'
import { ResponseResolver } from '../../handlers/RequestHandler'
import { Request } from '../../Request'

const resolver: ResponseResolver = () => void 0

const fixtures = {
  warningWithoutSuggestions: `\
[MSW] Warning: captured a request without a matching request handler:

  • GET /api

If you still wish to intercept this unhandled request, please create a request handler for it.
Read more: https://mswjs.io/docs/getting-started/mocks`,

  errorWithoutSuggestions: `\
[MSW] Error: captured a request without a matching request handler:

  • GET /api

If you still wish to intercept this unhandled request, please create a request handler for it.
Read more: https://mswjs.io/docs/getting-started/mocks`,

  warningWithSuggestions: (suggestions: string) => `\
[MSW] Warning: captured a request without a matching request handler:

  • GET /api

Did you mean to request one of the following resources instead?

${suggestions}

If you still wish to intercept this unhandled request, please create a request handler for it.
Read more: https://mswjs.io/docs/getting-started/mocks`,
}

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation()
  jest.spyOn(console, 'error').mockImplementation()
})

afterEach(() => {
  jest.resetAllMocks()
})

afterAll(() => {
  jest.restoreAllMocks()
})

test('supports the "bypass" request strategy', async () => {
  await onUnhandledRequest(
    new Request(new URL('http://localhost/api')),
    [],
    'bypass',
  )

  expect(console.warn).not.toHaveBeenCalled()
  expect(console.error).not.toHaveBeenCalled()
})

test('supports the "warn" request strategy', async () => {
  await onUnhandledRequest(
    new Request(new URL('http://localhost/api')),
    [],
    'warn',
  )

  expect(console.warn).toHaveBeenCalledWith(fixtures.warningWithoutSuggestions)
})

test('supports the "error" request strategy', async () => {
  await expect(
    onUnhandledRequest(
      new Request(new URL('http://localhost/api')),
      [],
      'error',
    ),
  ).rejects.toThrow(
    '[MSW] Cannot bypass a request when using the "error" strategy for the "onUnhandledRequest" option.',
  )

  expect(console.error).toHaveBeenCalledWith(fixtures.errorWithoutSuggestions)
})

test('supports a custom callback function', async () => {
  const callback = jest.fn<void, Parameters<UnhandledRequestCallback>>(
    (request) => {
      console.warn(`callback: ${request.method} ${request.url}`)
    },
  )
  const request = new Request(new URL('/user', 'http://localhost:3000'))
  await onUnhandledRequest(request, [], callback)

  expect(callback).toHaveBeenCalledTimes(1)
  expect(callback).toHaveBeenCalledWith(request, {
    warning: expect.any(Function),
    error: expect.any(Function),
  })

  // Check that the custom logic in the callback was called.
  expect(console.warn).toHaveBeenCalledWith(
    `callback: GET http://localhost:3000/user`,
  )
})

test('supports calling default strategies from the custom callback function', async () => {
  const callback = jest.fn<void, Parameters<UnhandledRequestCallback>>(
    (request, print) => {
      // Call the default "error" strategy.
      print.error()
    },
  )
  const request = new Request(new URL('http://localhost/api'))
  await expect(onUnhandledRequest(request, [], callback)).rejects.toThrow(
    `[MSW] Cannot bypass a request when using the "error" strategy for the "onUnhandledRequest" option.`,
  )

  expect(callback).toHaveBeenCalledTimes(1)
  expect(callback).toHaveBeenCalledWith(request, {
    warning: expect.any(Function),
    error: expect.any(Function),
  })

  // Check that the default strategy was called.
  expect(console.error).toHaveBeenCalledWith(fixtures.errorWithoutSuggestions)
})

test('does not print any suggestions given no handlers to suggest', async () => {
  await onUnhandledRequest(
    new Request(new URL('http://localhost/api')),
    [],
    'warn',
  )

  expect(console.warn).toHaveBeenCalledWith(fixtures.warningWithoutSuggestions)
})

test('does not print any suggestions given no handlers are similar', async () => {
  await onUnhandledRequest(
    new Request(new URL('http://localhost/api')),
    [
      // None of the defined request handlers match the actual request URL
      // to be used as suggestions.
      new RestHandler(RESTMethods.GET, 'https://api.github.com', resolver),
      new RestHandler(RESTMethods.GET, 'https://api.stripe.com', resolver),
    ],
    'warn',
  )

  expect(console.warn).toHaveBeenCalledWith(fixtures.warningWithoutSuggestions)
})

test('respects RegExp as a request handler method', async () => {
  await onUnhandledRequest(
    new Request(new URL('http://localhost/api')),
    [new RestHandler(/^GE/, 'http://localhost/api', resolver)],
    'warn',
  )

  expect(console.warn).toHaveBeenCalledWith(fixtures.warningWithoutSuggestions)
})

test('sorts the suggestions by relevance', async () => {
  await onUnhandledRequest(
    new Request(new URL('http://localhost/api')),
    [
      new RestHandler(RESTMethods.GET, '/', resolver),
      new RestHandler(RESTMethods.GET, 'https://api.example.com/api', resolver),
      new RestHandler(RESTMethods.POST, '/api', resolver),
    ],
    'warn',
  )

  expect(console.warn).toHaveBeenCalledWith(
    fixtures.warningWithSuggestions(`\
  • POST /api
  • GET /`),
  )
})

test('does not print more than 4 suggestions', async () => {
  await onUnhandledRequest(
    new Request(new URL('http://localhost/api')),
    [
      new RestHandler(RESTMethods.GET, '/ap', resolver),
      new RestHandler(RESTMethods.GET, '/api', resolver),
      new RestHandler(RESTMethods.GET, '/api-1', resolver),
      new RestHandler(RESTMethods.GET, '/api-2', resolver),
      new RestHandler(RESTMethods.GET, '/api-3', resolver),
      new RestHandler(RESTMethods.GET, '/api-4', resolver),
    ],
    'warn',
  )

  expect(console.warn).toHaveBeenCalledWith(
    fixtures.warningWithSuggestions(`\
  • GET /api
  • GET /ap
  • GET /api-1
  • GET /api-2`),
  )
})

test('throws an exception given unknown request strategy', async () => {
  await expect(
    onUnhandledRequest(
      new Request(new URL('http://localhost/api')),
      [],
      // @ts-expect-error Intentional unknown strategy.
      'invalid-strategy',
    ),
  ).rejects.toThrow(
    '[MSW] Failed to react to an unhandled request: unknown strategy "invalid-strategy". Please provide one of the supported strategies ("bypass", "warn", "error") or a custom callback function as the value of the "onUnhandledRequest" option.',
  )
})
