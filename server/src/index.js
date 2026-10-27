import { createApp, startServer } from './app.js'
import { config, validateConfig } from './config.js'

const check = validateConfig()
if (!check.valid) {
  for (const issue of check.issues) {
    console.warn(`[maeve-server] [CONFIG WARNING] ${issue}`)
  }
}

const app = createApp()
const server = await startServer(app)
console.log(`[maeve-server] listening on http://localhost:${config.port} (env: ${config.isProduction ? 'production' : 'development'})`)
console.log(`[maeve-server] database -> ${config.dbFile}`)
console.log(`[maeve-server] cv model -> ${config.modelPath} (available: ${check.summary.cvModelAvailable})`)

server.on('close', () => {
  console.log('[maeve-server] stopped')
})