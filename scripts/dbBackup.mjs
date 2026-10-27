import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initDb, backupDb } from '../server/src/db.js'
import { config } from '../server/src/config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const action = process.argv[2] || 'backup'
const targetArg = process.argv[3]

if (action === 'backup') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = path.join(config.dataDir, 'backups')
  fs.mkdirSync(backupDir, { recursive: true })
  const destPath = targetArg
    ? path.resolve(targetArg)
    : path.join(backupDir, `maeve-backup-${timestamp}.db`)

  console.log(`[maeve-backup] Initiating hot backup from: ${config.dbFile}`)
  const db = initDb()
  try {
    const result = backupDb(db, destPath)
    console.log(`[maeve-backup] Backup successfully created at: ${result.destination}`)
    console.log(`[maeve-backup] File size: ${(result.bytes / 1024).toFixed(1)} KB`)
  } catch (err) {
    console.error(`[maeve-backup] Backup failed: ${err.message}`)
    process.exit(1)
  }
} else if (action === 'restore') {
  if (!targetArg) {
    console.error('[maeve-restore] Usage: node scripts/dbBackup.mjs restore <backup-file.db>')
    process.exit(1)
  }
  const sourcePath = path.resolve(targetArg)
  if (!fs.existsSync(sourcePath)) {
    console.error(`[maeve-restore] Error: Backup source file does not exist: ${sourcePath}`)
    process.exit(1)
  }

  // Validate SQLite header magic bytes
  const fd = fs.openSync(sourcePath, 'r')
  const headerBuf = Buffer.alloc(16)
  fs.readSync(fd, headerBuf, 0, 16, 0)
  fs.closeSync(fd)
  if (headerBuf.toString('utf8', 0, 15) !== 'SQLite format 3') {
    console.error('[maeve-restore] Error: Source file is not a valid SQLite database.')
    process.exit(1)
  }

  const destDb = config.dbFile
  fs.mkdirSync(path.dirname(destDb), { recursive: true })
  // Backup current db if present before replacing
  if (fs.existsSync(destDb)) {
    const preRestoreBackup = `${destDb}.pre-restore-${Date.now()}`
    fs.copyFileSync(destDb, preRestoreBackup)
    console.log(`[maeve-restore] Preserved current database as: ${preRestoreBackup}`)
  }

  fs.copyFileSync(sourcePath, destDb)
  // Remove stale WAL and SHM files to ensure clean mount
  try { if (fs.existsSync(`${destDb}-wal`)) fs.unlinkSync(`${destDb}-wal`) } catch {}
  try { if (fs.existsSync(`${destDb}-shm`)) fs.unlinkSync(`${destDb}-shm`) } catch {}

  console.log(`[maeve-restore] Database restored successfully to: ${destDb}`)
} else {
  console.log('Usage: node scripts/dbBackup.mjs [backup|restore] [path]')
}
