/**
 * Create initial admin user. Run: npm run create-admin
 * Prompts for fullName, email, password (or set ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME in .env for non-interactive).
 * Requires MONGODB_URI and JWT_SECRET in .env.
 */
require('dotenv').config();
const readline = require('readline');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { ROLES, USER_STATUS } = require('../config/constants');
const { validatePassword, PASSWORD } = require('../utils/passwordPolicy');
const { sendWelcomeEmail, isConfigured } = require('../services/emailService');

function ask(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const email = process.env.ADMIN_EMAIL || (await ask(rl, 'Admin email: '));
  const password = process.env.ADMIN_PASSWORD || (await ask(rl, 'Admin password: '));
  const fullName = process.env.ADMIN_NAME || (await ask(rl, 'Admin full name: '));
  if (!email || !password || !fullName) {
    console.error('Email, password and full name are required.');
    process.exit(1);
  }
  const pwdCheck = validatePassword(password);
  if (!pwdCheck.valid) {
    console.error('Password:', pwdCheck.errors.join('. '));
    process.exit(1);
  }
  const existing = await User.findOne({ email: email.trim().toLowerCase() });
  if (existing) {
    console.log('User with this email already exists.');
    process.exit(0);
    return;
  }
  const passwordHash = await bcrypt.hash(password, PASSWORD.BCRYPT_ROUNDS);
  await User.create({
    fullName: fullName.trim(),
    email: email.trim().toLowerCase(),
    passwordHash,
    role: ROLES.ADMIN,
    status: USER_STATUS.ACTIVE,
  });
  console.log('Admin user created successfully.');
  if (isConfigured()) {
    const { sent } = await sendWelcomeEmail(email.trim().toLowerCase(), fullName.trim(), password);
    if (sent) console.log('Welcome email sent.');
    else console.log('Welcome email could not be sent (check SMTP config).');
  } else {
    console.log('SMTP not configured; no welcome email sent.');
  }
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
