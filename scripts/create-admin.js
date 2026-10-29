// Usage: ADMIN_PASSWORD='...' node scripts/create-admin.js you@example.com
// The password comes from the environment so it never shows in shell history or process lists.
const path = require('node:path');
const { open } = require('../src/db');
const { createAdmin } = require('../src/auth');
const email = process.argv[2], password = process.env.ADMIN_PASSWORD;
if (!email || !password) { console.error('Usage: ADMIN_PASSWORD=... node scripts/create-admin.js <email>'); process.exit(1); }
const db = open(process.env.DB || path.join(__dirname, '..', 'data', 'app.db'));
try { createAdmin(db, email, password); console.log('Admin created:', email); }
catch (e) { console.error(e.message.includes('UNIQUE') ? 'That email already exists.' : e.message); process.exit(1); }
