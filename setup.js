/**
 * LMS Setup Script
 * Run this ONCE after npm install:  node setup.js
 * It will: create .env, set admin password to 123, migrate the database
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const bcrypt = require('bcryptjs');
const mysql  = require('mysql2/promise');

const ENV_PATH = path.join(__dirname, '.env');

async function setup() {
  console.log('\n============================================');
  console.log('   LMS Pro - Auto Setup');
  console.log('============================================\n');

  // Step 1: Create .env
  if (!fs.existsSync(ENV_PATH)) {
    const envContent = `PORT=4000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=lms_db
JWT_SECRET=lms_secret_key_2025
JWT_EXPIRES_IN=8h
CLIENT_ORIGIN=http://localhost:4200
`;
    fs.writeFileSync(ENV_PATH, envContent);
    console.log('[OK] .env file created.');
  } else {
    console.log('[OK] .env already exists.');
  }

  // Load env
  require('dotenv').config();

  // Step 2: Connect to MySQL and migrate schema
  console.log('\n[...] Migrating database schema...');
  let conn;
  try {
    conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true
    });

    const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
    // Split and run each statement
    const statements = schema.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('--'));
    for (const stmt of statements) {
      try { await conn.query(stmt + ';'); } catch(e) { /* skip duplicate/existing */ }
    }
    console.log('[OK] Database migrated.');
  } catch (err) {
    console.error('[ERROR] Database connection failed:', err.message);
    console.error('        Make sure XAMPP MySQL is running!\n');
    process.exit(1);
  }

  // Step 3: Set admin password to 123
  console.log('\n[...] Setting admin password to: 123');
  try {
    const hash = bcrypt.hashSync('123', 10);
    await conn.query(`USE lms_db`);
    await conn.query(`UPDATE login_registration SET password = ? WHERE username = 'admin'`, [hash]);
    console.log('[OK] Admin password set to: 123');
  } catch (err) {
    console.error('[ERROR] Failed to set password:', err.message);
  }

  await conn.end();

  console.log('\n============================================');
  console.log('   SETUP COMPLETE!');
  console.log('');
  console.log('   Login:    admin / 123');
  console.log('   Run:      npm run dev');
  console.log('============================================\n');
}

setup().catch(console.error);
