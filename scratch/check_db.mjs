import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync('server/data/maeve.db')
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
console.log('Tables in maeve.db:', tables)
for (const t of tables) {
  const count = db.prepare(`SELECT COUNT(*) as c FROM ${t.name}`).get()
  console.log(`${t.name}: ${count.c} rows`)
}

