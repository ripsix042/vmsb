/**
 * Seed default departments. Run: npm run seed:departments
 * Requires MONGODB_URI in .env.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Department = require('../models/Department');

const DEFAULT_DEPARTMENTS = [
  { name: "CEO's Office" },
  { name: 'Compliance' },
  { name: 'Engineering' },
  { name: 'Finance' },
  { name: 'Information Security' },
  { name: 'Innovation' },
  { name: 'Legal' },
  { name: 'Marketing' },
  { name: 'Merchant Success' },
  { name: 'Operations' },
  { name: 'People & Culture' },
  { name: 'Product Design' },
  { name: 'Product Management' },
  { name: 'Sales' },
  { name: 'Treasury' },
  { name: 'Treasury Engineering' },
  { name: 'Treasury Finance' },
  { name: 'Treasury Growth' },
  { name: 'Treasury Operations' },
  { name: 'Treasury Product Design' },
  { name: 'Treasury Product Management' },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  const existing = await Department.find().select('name').lean();
  const existingNames = new Set(existing.map((d) => d.name));

  // Option A: only add missing departments; do not delete or overwrite existing ones.
  const missing = DEFAULT_DEPARTMENTS.filter((d) => !existingNames.has(d.name));
  if (missing.length === 0) {
    console.log('All default departments already exist. Nothing to seed.');
    process.exit(0);
    return;
  }

  await Department.insertMany(missing, { ordered: false });
  console.log(`Seeded ${missing.length} missing departments.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
