// One-off migration: round the travel costs of existing time entries to the nearest whole euro.
// Run with `node utils/roundTravelAmounts.js` (add --dry-run to only list the changes).
require('dotenv').config();
const connectDB = require('../config/db');
const TimeEntry = require('../models/TimeEntry');
const mongoose = require('mongoose');

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  await connectDB();

  const entries = await TimeEntry.find({ travelIncluded: true });
  let changed = 0;
  for (const entry of entries) {
    const rounded = Math.round((entry.travelKm || 0) * (entry.travelRate || 0));
    if (entry.travelAmount === rounded) continue;
    console.log(`${entry._id}: ${entry.travelKm} km × ${entry.travelRate} — ${entry.travelAmount} -> ${rounded}`);
    if (!dryRun) {
      await TimeEntry.updateOne({ _id: entry._id }, { $set: { travelAmount: rounded } });
    }
    changed++;
  }

  console.log(`${changed} of ${entries.length} entries ${dryRun ? 'would be' : 'were'} updated.`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
