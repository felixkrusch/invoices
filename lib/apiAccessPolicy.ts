export type ApiAccess = 'public' | 'signed-webhook' | 'bootstrap-only' | 'authenticated' | 'accountant' | 'admin'

export type ApiAccessPolicy = {
  prefix: string
  access: ApiAccess
  description: string
  methods?: string[]
}

export const API_ACCESS_POLICIES: ApiAccessPolicy[] = [
  { prefix: '/api/auth/', access: 'public', description: 'Auth.js and development authentication entry points' },
  { prefix: '/api/auth/totp/disable', access: 'authenticated', methods: ['POST'], description: 'User disables their own TOTP' },
  { prefix: '/api/health', access: 'public', description: 'Process health check' },
  { prefix: '/api/bootstrap/status', access: 'bootstrap-only', description: 'Initial installation status' },
  { prefix: '/api/onboarding', access: 'bootstrap-only', description: 'First-admin setup' },
  { prefix: '/api/invitations/validate', access: 'public', description: 'Validate invitation token' },
  { prefix: '/api/webhooks/stripe', access: 'signed-webhook', description: 'Stripe webhooks' },
  { prefix: '/api/webhooks/paypal', access: 'signed-webhook', description: 'PayPal webhooks' },
  { prefix: '/api/jobs/run', access: 'signed-webhook', methods: ['POST'], description: 'Job runner' },
  { prefix: '/api/backup/', access: 'admin', description: 'Full backup export and restore' },
  { prefix: '/api/admin/', access: 'admin', description: 'Administrative operations' },
  { prefix: '/api/users', access: 'admin', description: 'User and role management' },
  { prefix: '/api/settings', access: 'admin', methods: ['POST', 'PUT', 'PATCH', 'DELETE'], description: 'Company settings mutations' },
  { prefix: '/api/settings', access: 'authenticated', methods: ['GET'], description: 'Company settings' },
  { prefix: '/api/llm-config', access: 'admin', description: 'LLM configuration' },
  { prefix: '/api/llm/status', access: 'authenticated', methods: ['GET'], description: 'LLM connection status for chat indicator' },
  { prefix: '/api/chat', access: 'accountant', description: 'AI assistant' },
  { prefix: '/api/tax-rates', access: 'admin', methods: ['POST', 'PUT', 'PATCH', 'DELETE'], description: 'Tax configuration mutations' },
  { prefix: '/api/invoices', access: 'accountant', methods: ['POST', 'PUT', 'PATCH', 'DELETE'], description: 'Invoice mutations' },
  { prefix: '/api/contacts', access: 'accountant', methods: ['POST', 'PUT', 'PATCH', 'DELETE'], description: 'Contact mutations' },
  { prefix: '/api/recurring-invoices', access: 'accountant', methods: ['POST', 'PUT', 'PATCH', 'DELETE'], description: 'Recurring invoice mutations' },
  { prefix: '/api/payments/', access: 'accountant', methods: ['POST'], description: 'Payment-link creation' },
  { prefix: '/api/files', access: 'authenticated', description: 'Private files' },
  { prefix: '/api', access: 'authenticated', description: 'Deny-by-default API fallback' },
]

export function getApiAccessPolicy(pathname: string, method = 'GET'): ApiAccessPolicy {
  const normalizedMethod = method.toUpperCase()
  return API_ACCESS_POLICIES.find(policy =>
    (!policy.methods || policy.methods.includes(normalizedMethod))
    && (pathname === policy.prefix
      || pathname.startsWith(`${policy.prefix}/`)
      || (policy.prefix.endsWith('/') && pathname.startsWith(policy.prefix)))
  ) || { prefix: '/api', access: 'authenticated', description: 'Deny-by-default API fallback' }
}

export function isPublicApiPath(pathname: string, method = 'GET') {
  const access = getApiAccessPolicy(pathname, method).access
  return access === 'public' || access === 'signed-webhook' || access === 'bootstrap-only'
}

export function isRoleAllowed(access: ApiAccess, role: 'ADMIN' | 'ACCOUNTANT' | 'VIEWER') {
  if (access === 'admin') return role === 'ADMIN'
  if (access === 'accountant') return role === 'ADMIN' || role === 'ACCOUNTANT'
  return true
}
