import { config } from './config.js'

/**
 * Upload validation. Compliant with the API-security requirements:
 * file types are validated by *content* (magic bytes), never by trusting the
 * client-provided filename extension, and oversized/rejected files never
 * reach the CV worker.
 */

const MAGIC = [
  { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff], ext: 'jpg', names: ['jpg', 'jpeg'] },
  { type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47], ext: 'png', names: ['png'] },
]
const WEBP_PROBE = { type: 'image/webp', ext: 'webp', names: ['webp'] }

export function sniffImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null
  for (const probe of MAGIC) {
    if (probe.bytes.every((b, i) => buffer[i] === b)) return probe
  }
  // WEBP signature: "RIFF" at 0..3 AND "WEBP" chunk at 8..11
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 &&
    buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return WEBP_PROBE
  }
  return null
}

export function validateUpload(buffer, declaredType) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { ok: false, code: 'EMPTY_FILE', status: 400, message: 'No file was provided.' }
  }
  if (buffer.length > config.maxUploadBytes) {
    return {
      ok: false,
      code: 'FILE_TOO_LARGE',
      status: 413,
      message: `Photographs must be ${Math.round(config.maxUploadBytes / 1048576)} MB or smaller.`,
    }
  }
  const probe = sniffImageType(buffer)
  if (!probe) {
    return {
      ok: false,
      code: 'UNSUPPORTED_FILE',
      status: 415,
      message: 'Only JPEG, PNG or WEBP photographs are accepted.',
    }
  }
  // The declared type must also be an accepted image type (never trust the
  // extension alone — content sniffing above is what actually gates entry).
  const declared = typeof declaredType === 'string' ? declaredType.toLowerCase() : ''
  const acceptedNames = ['image/jpeg', 'image/png', 'image/webp', '']
  if (!acceptedNames.includes(declared)) {
    return {
      ok: false,
      code: 'UNSUPPORTED_FILE',
      status: 415,
      message: 'Only JPEG, PNG or WEBP photographs are accepted.',
    }
  }
  return { ok: true, probe }
}