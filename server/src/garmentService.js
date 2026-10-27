import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { config, userDir } from './config.js'

/**
 * Analysis job service.
 *
 * POSTing a photograph creates a job; the job spawns the real CV worker
 * (`cv/infer.py`) and streams its progress stages back to the client. Jobs
 * run single-file (one inference at a time) so a CPU-bound model never
 * starves the HTTP server.
 *
 * A job ends in exactly one of two honest states:
 *   - `complete` → the worker produced a real, model-derived result.
 *   - `failed`   → the worker could not run (model absent, runtime missing,
 *     malformed input, timeout). No fabricated garments are ever returned.
 */

const STAGES = [
  'UPLOADING',
  'ANALYZING',
  'DETECTING GARMENTS',
  'SEPARATING PIECES',
  'REMOVING BACKGROUND',
  'READING DETAILS',
  'PREPARING YOUR WARDROBE',
]

const WORKER_STAGE_MAP = {
  'loading-model': 'ANALYZING',
  normalizing: 'ANALYZING',
  detecting: 'DETECTING GARMENTS',
  separating: 'SEPARATING PIECES',
  isolating: 'REMOVING BACKGROUND',
  'reading-details': 'READING DETAILS',
  preparing: 'PREPARING YOUR WARDROBE',
}

const jobs = new Map()
const JOB_TTL_MS = 60 * 60 * 1000
/** Model load can take several seconds; inference itself is fast. */
const WORKER_TIMEOUT_MS = 300 * 1000

let runQueue = Promise.resolve()
const children = new Set()

export function stageList() {
  return STAGES
}

export function getJob(jobId) {
  const job = jobs.get(jobId)
  if (!job) return null
  if (Date.now() - job.createdAt > JOB_TTL_MS) {
    jobs.delete(jobId)
    return null
  }
  const out = {
    jobId: job.jobId,
    userId: job.userId,
    status: job.status,
    stage: job.status === 'complete' ? 'PREPARING YOUR WARDROBE' : job.stage,
    stageIndex: job.status === 'complete' ? STAGES.length - 1 : job.stageIndex,
    totalStages: STAGES.length,
    error: job.error ?? null,
    result: job.status === 'complete' ? job.result : null,
  }
  return out
}

function purgeExpiredJobs() {
  const now = Date.now()
  for (const [id, job] of jobs.entries()) {
    if (now - job.createdAt > JOB_TTL_MS) {
      jobs.delete(id)
    }
  }
}

function newJob(userId) {
  purgeExpiredJobs()
  const jobId = crypto.randomBytes(12).toString('hex')
  const job = {
    jobId,
    userId,
    jobDir: path.join(userDir(userId), jobId),
    status: 'queued',
    stage: 'UPLOADING',
    stageIndex: 0,
    error: null,
    result: null,
    createdAt: Date.now(),
  }
  jobs.set(jobId, job)
  return job
}

function setStage(job, stage) {
  const index = STAGES.indexOf(stage)
  job.stage = stage
  job.stageIndex = index >= 0 ? index : job.stageIndex
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function fileUrl(job, file, token) {
  return `/api/files/${encodeURIComponent(job.userId)}/${job.jobId}/${encodeURIComponent(file)}?token=${encodeURIComponent(token)}`
}

function finishJob(job, token) {
  const payload = readJson(path.join(job.jobDir, 'result.json'))
  if (payload.success) {
    const garments = payload.garments.map((g) => ({
      id: g.id,
      subcategory: g.subcategory,
      category: g.category,
      color: g.color,
      colorHex: g.colorHex,
      secondaryColor: g.secondaryColor ?? null,
      colorConfidence: typeof g.colorConfidence === 'number' ? g.colorConfidence : null,
      pattern: g.pattern,
      style: g.style,
      material: g.material,
      sleeve: g.sleeve,
      length: g.length,
      season: g.season,
      confidence: g.confidence,
      boundingBox: g.boundingBox,
      // The worker flags ambiguous taxonomy (e.g. DF2 `*_outwear`, which is not
      // necessarily a layer). Low detection confidence is folded in here too.
      needsUserInput:
        Boolean(g.needsUserInput) ||
        (g.confidence < config.confirmConfidence &&
          g.confidence >= config.minConfidence),
      isolatedImageUrl: fileUrl(job, g.isolatedFile, token),
      thumbnailUrl: fileUrl(job, g.thumbnailFile, token),
      originalImageUrl: fileUrl(job, job.originalName, token),
    }))
    job.result = {
      success: true,
      model: payload.model,
      processedInMs: payload.processedInMs,
      image: payload.image,
      garments,
    }
    job.status = 'complete'
    return
  }

  // Honest failure surfaced to the client.
  const reason = payload.reason || 'processing_error'
  job.status = 'failed'
  job.error = {
    code: reason.toUpperCase(),
    message: payload.message || 'Something went wrong while processing your photograph.',
  }
}

function runInference(job, token) {
  job.status = 'processing'
  const resultPath = path.join(job.jobDir, 'result.json')
  const args = [
    config.cvWorker,
    '--input', job.originalPath,
    '--workdir', job.jobDir,
    '--output', resultPath,
    '--model', config.modelPath,
    '--min-conf', String(config.minConfidence),
  ]
  const child = spawn(config.pythonBin, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  children.add(child)
  let stdout = ''
  let stderr = ''
  const timeout = setTimeout(() => {
    child.kill('SIGKILL')
    if (!job.result && job.status !== 'complete') {
      job.status = 'failed'
      job.error = {
        code: 'TIMEOUT',
        message: 'The analysis service timed out. Please try again.',
      }
    }
  }, WORKER_TIMEOUT_MS)

  child.stdout.on('data', (chunk) => {
    stdout += chunk
    const lines = stdout.split('\n')
    stdout = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('PROGRESS:')) {
        const stageName = WORKER_STAGE_MAP[trimmed.slice(9)] ?? trimmed.slice(9)
        if (stageName && STAGES.includes(stageName)) setStage(job, stageName)
      }
    }
  })

  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })

  child.on('error', (err) => {
    clearTimeout(timeout)
    children.delete(child)
    if (job.status !== 'complete') {
      job.status = 'failed'
      job.error = {
        code: 'MODEL_UNAVAILABLE',
        message: `The computer-vision service couldn't start (${err.message}).`,
      }
    }
  })

  child.on('close', (code) => {
    clearTimeout(timeout)
    children.delete(child)
    if (job.status === 'complete') return
    try {
      if (code === 0 && fs.existsSync(resultPath)) {
        finishJob(job, token)
      } else if (code === 3 && fs.existsSync(resultPath)) {
        const payload = readJson(resultPath)
        job.status = 'failed'
        job.error = {
          code: 'MODEL_UNAVAILABLE',
          message: payload.message || "The computer-vision model isn't reachable.",
        }
      } else if (fs.existsSync(resultPath)) {
        finishJob(job, token)
      } else {
        job.status = 'failed'
        job.error = {
          code: 'PROCESSING_ERROR',
          message: stderr.length
            ? stderr.slice(0, 300)
            : 'Something went wrong while processing your photograph.',
        }
      }
    } catch {
      job.status = 'failed'
      job.error = {
        code: 'PROCESSING_ERROR',
        message: 'The analysis service returned an unreadable result. Please try again.',
      }
    }
  })
}

/**
 * Begin analysis for a validated upload. Returns the job id immediately; the
 * worker executes on the single-flight queue.
 */
export function startAnalysisJob({ userId, buffer, probe, token }) {
  const job = newJob(userId)
  const { jobDir } = job
  fs.mkdirSync(jobDir, { recursive: true })
  const originalNameSafe = `original.${probe.ext}`
  const originalPath = path.join(jobDir, originalNameSafe)
  fs.writeFileSync(originalPath, buffer)

  job.originalPath = originalPath
  job.originalName = originalNameSafe

  if (config.failAnalysis) {
    setImmediate(() => {
      job.status = 'failed'
      job.error = {
        code: 'PROCESSING_ERROR',
        message: 'Something went wrong while processing your photograph. (fault injected)',
      }
    })
    return job.jobId
  }

  // Single-flight: run exactly one worker at a time, in arrival order.
  runQueue = runQueue.then(async () => {
    if (job.status !== 'queued') return
    runInference(job, token)
    await new Promise((resolve) => {
      const id = setInterval(() => {
        if (job.status === 'complete' || job.status === 'failed') {
          clearInterval(id)
          resolve()
        }
      }, 50)
    })
  })

  return job.jobId
}

export function shutdownWorkers() {
  for (const child of children) {
    try {
      child.kill('SIGKILL')
    } catch {
      /* already gone */
    }
  }
}