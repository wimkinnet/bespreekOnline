// Given an assignment (with billingType + rate) and the hours/days logged,
// returns { amount, rateApplied, billingType } to store on the TimeEntry.
// Fixed-fee assignments are billed through time registration too: each entry bills
// `feeAmount` (the whole fee or an instalment of it); hours are tracked for visibility only.
function computeAmount(assignment, { hours, days, feeAmount }) {
  const billingType = assignment.billingType;
  const rateApplied = assignment.rate;

  if (billingType === 'hourly') {
    const h = Number(hours) || 0;
    return { amount: Math.round(h * rateApplied * 100) / 100, rateApplied, billingType };
  }
  if (billingType === 'daily') {
    const d = Number(days) || 0;
    return { amount: Math.round(d * rateApplied * 100) / 100, rateApplied, billingType };
  }
  if (billingType === 'half_day') {
    const halfDays = (Number(days) || 0) * 2;
    return { amount: Math.round(halfDays * rateApplied * 100) / 100, rateApplied, billingType };
  }
  // fixed
  const fee = Number(feeAmount) || 0;
  return { amount: Math.round(fee * 100) / 100, rateApplied, billingType };
}

module.exports = computeAmount;
