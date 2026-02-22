/**
 * Seed default reasons for visit. Run: npm run seed:reasons
 * Requires MONGODB_URI in .env.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const ReasonForVisit = require('../models/ReasonForVisit');

const DEFAULT_REASONS = [
  { label: 'Meeting', sortOrder: 1 },
  { label: 'Interview', sortOrder: 2 },
  { label: 'Delivery', sortOrder: 3 },
  { label: 'Contractor', sortOrder: 4 },
  { label: 'Other', sortOrder: 5 },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  const existing = await ReasonForVisit.countDocuments();
  if (existing > 0) {
    console.log('Reasons already exist. Skipping seed.');
    process.exit(0);
    return;
  }
  await ReasonForVisit.insertMany(DEFAULT_REASONS);
  console.log(`Seeded ${DEFAULT_REASONS.length} reasons for visit.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
