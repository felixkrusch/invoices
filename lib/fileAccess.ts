export function canAccessFileAsset(input: {
  userId: string
  role: 'ADMIN' | 'ACCOUNTANT' | 'VIEWER'
  createdById: string
}) {
  return input.createdById === input.userId
    || input.role === 'ADMIN'
    || input.role === 'ACCOUNTANT'
}
