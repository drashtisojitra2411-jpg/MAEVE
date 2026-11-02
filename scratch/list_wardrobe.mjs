import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync('server/data/maeve.db')
const items = db.prepare("SELECT id, user_id, name, category, subcategory, color, color_hex, pattern, style, confidence FROM wardrobe_items").all()
console.log('Wardrobe items in maeve.db:')
console.table(items)

