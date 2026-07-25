import { validateProductionEnvironment } from '@/lib/env'

export async function register() {
  // Skip during `next build` page-data collection — secrets are injected at runtime.
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  validateProductionEnvironment()
}
