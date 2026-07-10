// Canal e publisher vivem em @lidimus/queue — workers e watchdog usam os mesmos
export { jobEventsChannel, publishJobEvent } from '@lidimus/queue'
