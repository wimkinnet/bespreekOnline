// Official flat-rate km allowance for business trips with one's own car (forfaitaire kilometervergoeding),
// annual system as set for federal civil servants by FOD BOSA and accepted by the tax administration as
// costs proper to the employer. Each rate applies from 1 July to 30 June of the next year.
// Add the new rate here every year once the circular is published (usually in June/July).
const ANNUAL_RATES = [
  { from: '2023-07-01', to: '2024-06-30', rate: 0.428, source: 'omzendbrief nr. 722' },
  { from: '2024-07-01', to: '2025-06-30', rate: 0.4415, source: 'omzendbrief nr. 742' },
  { from: '2025-07-01', to: '2026-06-30', rate: 0.4449, source: 'jaarlijks bedrag 2025-2026' },
  { from: '2026-07-01', to: '2027-06-30', rate: 0.4761, source: 'omzendbrief nr. 767' },
];

class KmRateError extends Error {}

function isoDay(date) {
  return new Date(date).toISOString().slice(0, 10);
}

// The official rate period that covers a trip date
function officialRateFor(date) {
  const day = isoDay(date);
  const period = ANNUAL_RATES.find((r) => day >= r.from && day <= r.to);
  if (!period) {
    throw new KmRateError(
      `No official km rate is configured for ${day}. Add it to server/utils/kmRates.js.`
    );
  }
  return period;
}

// Travel amounts registered before km were stored reliably were calculated at 0.45 EUR/km and rounded up
// to the next 5 EUR. The exact km can't be recovered, so we take the lower bound, which never over-claims.
const LEGACY_RATE = 0.45;
const LEGACY_ROUNDING = 5;

// Round-trip km to claim for a time entry: the recorded km, or the estimate from the legacy amount
function claimKm(entry) {
  if (entry.travelType === 'other') return { km: 0, estimated: false }; // no km driven, e.g. a train ticket
  if (entry.travelKm > 0) return { km: entry.travelKm, estimated: false };
  if (entry.travelAmount > 0) {
    // amount = km × 0.45 rounded up to 5, so km × 0.45 > amount − 5: the smallest whole km above that
    const km = Math.floor((entry.travelAmount - LEGACY_ROUNDING) / LEGACY_RATE + 1e-9) + 1;
    return { km, estimated: true };
  }
  return { km: 0, estimated: false };
}

module.exports = { ANNUAL_RATES, officialRateFor, claimKm, KmRateError, LEGACY_RATE, LEGACY_ROUNDING };
