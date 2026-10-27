import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

function env(key, fallback) {
  const v = process.env[key]
  return v === undefined || v === '' ? fallback : v
}

/**
 * Project-local CV interpreter. Preferences (in order):
 *   1. MAEVE_PYTHON env — explicit override for tests, CI and production.
 *   2. server/cv/.venv — the deterministic, machine-independent install
 *      (Windows: Scripts\python.exe, POSIX: bin/python).
 *   3. `python` on PATH — last resort; may lack the CV runtime.
 */
const VENV_PYTHON_REL = path.join('cv', '.venv')

export function projectVenvPython() {
  const bin = process.platform === 'win32' ? 'Scripts\\python.exe' : 'bin/python'
  return path.join(ROOT, VENV_PYTHON_REL, bin)
}

export function pythonInfo() {
  const bin = config.pythonBin
  const venvPython = projectVenvPython()
  return {
    bin: path.basename(bin),
    fromEnv: Boolean(process.env.MAEVE_PYTHON),
    projectVenv: fs.existsSync(venvPython),
    exists: bin === 'python' || fs.existsSync(bin),
  }
}

function str(fn) {
  return fn()
}

/**
 * Configuration is evaluated lazily (getters) so tests and the dev server can
 * set process.env values after this module is imported.
 */
export const config = {
  get port() {
    return Number(env('PORT', '8787'))
  },
  get modelPath() {
    return env(
      'MAEVE_MODEL_PATH',
      path.join(ROOT, 'cv', 'models', 'deepfashion2_yolov8s-seg.pt'),
    )
  },
  get pythonBin() {
    const override = env('MAEVE_PYTHON', '')
    if (override) return override
    const venvPython = projectVenvPython()
    if (fs.existsSync(venvPython)) return venvPython
    return 'python'
  },
  get cvWorker() {
    return path.join(ROOT, 'cv', 'infer.py')
  },
  get dataDir() {
    return env('MAEVE_DATA_DIR', path.join(ROOT, 'data'))
  },
  get minConfidence() {
    return Number(env('MAEVE_MIN_CONF', '0.30'))
  },
  get confirmConfidence() {
    return Number(env('MAEVE_CONFIRM_CONF', '0.60'))
  },
  get maxUploadBytes() {
    return 15 * 1024 * 1024
  },
  get dbFile() {
    return env('MAEVE_DB', path.join(ROOT, 'data', 'maeve.db'))
  },
  get sessionSecret() {
    return env(
      'MAEVE_SESSION_SECRET',
      'dev-only-secret-do-not-use-in-production',
    )
  },
  get isProduction() {
    return env('NODE_ENV', 'development') === 'production'
  },
  get corsOrigin() {
    return env('MAEVE_CORS_ORIGIN', '')
  },
  get rateLimitEnabled() {
    return env('MAEVE_RATE_LIMIT', '1') !== '0'
  },
  get failAnalysis() {
    return env('MAEVE_FAV_FAIL', '') === '1'
  },
  get maxUploadMb() {
    return Math.round(config.maxUploadBytes / 1048576)
  },
}

export const imagesDir = () => path.join(config.dataDir, 'images')

export function ensureDirectories() {
  for (const dir of [
    config.dataDir,
    imagesDir(),
    path.dirname(config.dbFile),
  ]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export function validateConfig() {
  const issues = []
  if (config.isProduction && config.sessionSecret === 'dev-only-secret-do-not-use-in-production') {
    issues.push('MAEVE_SESSION_SECRET is using the insecure default in production. Set a random 32+ character string.')
  }
  if (!Number.isFinite(config.port) || config.port <= 0 || config.port > 65535) {
    issues.push(`Invalid PORT configured: ${config.port}`)
  }
  return {
    valid: issues.length === 0,
    issues,
    summary: {
      port: config.port,
      isProduction: config.isProduction,
      dbFile: config.dbFile,
      dataDir: config.dataDir,
      cvModelAvailable: fs.existsSync(config.modelPath),
      python: pythonInfo(),
    },
  }
}

export function userDir(userId) {
  const safeId = String(userId).replace(/[^a-zA-Z0-9._:@-]/g, '_')
  return path.join(imagesDir(), safeId)
}

export { str }