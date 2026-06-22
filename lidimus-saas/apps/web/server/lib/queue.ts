import { createQueues } from '@lidimus/queue'

let _queues: ReturnType<typeof createQueues> | null = null

export function useQueues() {
  if (!_queues) {
    const config = useRuntimeConfig()
    if (!config.redisUrl) throw new Error('REDIS_URL not configured')
    _queues = createQueues(config.redisUrl)
  }
  return _queues
}
