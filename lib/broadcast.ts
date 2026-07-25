import { logger } from './logger'

export function broadcastInfo(message: string, meta?: Record<string, unknown>): void {
  logger.info(message, meta)
}
