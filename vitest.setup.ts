import { beforeAll } from 'vitest'

beforeAll(() => {
  process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-auth-secret-at-least-32-characters-long'
})
