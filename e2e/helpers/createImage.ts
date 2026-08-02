import { Buffer } from 'buffer'

export function createImage() {
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mP4f+A0AAVMAot9zaPnAAAAAElFTkSuQmCC'
  return Buffer.from(base64, 'base64')
}
