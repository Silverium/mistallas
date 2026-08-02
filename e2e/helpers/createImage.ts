import { Buffer } from 'buffer'

/**
 * Creates a small smiley face png picture in memory.
 * @returns A smiley face png picture
 */
export function createImage() {
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABE0lEQVR4nNWX2xXDIAiGoaebZITuP0JGyCz0pfEQ5aqmtjwLfPlBIUhEsNIeS7MDwDPrgIimZESEqXjREniJe0FcACkxHS/57LanQUwAnlxLqvoyGAtCbcKR5LWPVT5RgdOhJ7GY5KOGpESjQLbZUiBCbLUEs77ei3UBmC29BFGrEH6ILl1tAEbPnVYUMDu1ut/SfU+dY7maHrhDfiv28mEUAqjJNZWi57iFmzBammwJ/6MEXwXQrs4Mk2IXgOwmM2I8V6gEuO1pZaI+zTjW5sHoU6yNZBXAg/BMSi4BNO8AEaE2F8pEM0AsdaQ+U3fC0ZUMILYX6gsJc+i5mtGl9LfXcg/Esmk/JlmQ237N7rLlw+gNL9+8TIixhd4AAAAASUVORK5CYII='
  return Buffer.from(base64, 'base64')
}
export const createImageFile = () => {
  return {
    name: `photo-${Date.now()}.png`,
    mimeType: 'image/png',
    buffer: createImage()
  }
}
