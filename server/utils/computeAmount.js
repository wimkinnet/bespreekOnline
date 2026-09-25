// Given an assignment (with billingType + rate) and the hours/days logged,
// returns { amount, rateApplied, billingType } to store on the TimeEntry.
// Fixed-fee assignments are tracked for hours/days internally but billed once,
// so their time entries carry amount 0 (the fee lives on the assignment itself).
function computeAmount(assignment, { hours, days }) {
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
  // fixed
  return { amount: 0, rateApplied, billingType };
}

module.exports = computeAmount;
