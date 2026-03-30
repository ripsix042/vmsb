/**
 * Seed default departments. Run: npm run seed:departments
 * Requires MONGODB_URI in .env.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Department = require('../models/Department');

const DEFAULT_DEPARTMENTS = [
  { name: 'Operations' },
  { name: 'Finance' },
  { name: 'Innovation' },
  { name: 'Engineering' },
  { name: 'Sales' },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  const existing = await Department.countDocuments();
  if (existing > 0) {
    console.log('Departments already exist. Skipping seed.');
    process.exit(0);
    return;
  }
  await Department.insertMany(DEFAULT_DEPARTMENTS);
  console.log(`Seeded ${DEFAULT_DEPARTMENTS.length} departments.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
