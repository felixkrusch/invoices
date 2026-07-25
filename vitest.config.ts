import { defineConfig } from 'vitest/config'
import path from 'path'
import 'dotenv/config'

// Integration tests that hit Postgres can set DATABASE_URL_TEST.
// Unit tests (default) do not require a database.
if (process.env.DATABASE_URL_TEST) {
  const developmentDatabaseUrl = process.env.DATABASE_URL
  const testDatabaseUrl = process.env.DATABASE_URL_TEST
  if (testDatabaseUrl === developmentDatabaseUrl) {
    throw new Error('DATABASE_URL_TEST must not equal DATABASE_URL')
  }
  process.env.DATABASE_URL = testDatabaseUrl
}

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 20_000,
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
