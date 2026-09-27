export function formatEUR(amount) {
  return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(amount || 0);
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(dateStr)
  );
}

export function billingTypeLabel(type) {
  return { hourly: 'Per hour', daily: 'Per day', half_day: 'Per half day', fixed: 'Fixed fee' }[type] || type;
}

// Unit the rate is expressed in, e.g. "€80 / h"; empty for fixed fees
export function rateUnitLabel(type, short = false) {
  if (type === 'hourly') return short ? 'h' : 'hour';
  if (type === 'daily') return 'day';
  if (type === 'half_day') return 'half day';
  return '';
}

export function statusLabel(status) {
  return status.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function clientTypeLabel(type) {
  return { school: 'School', school_pool: 'School group', other: 'Other' }[type] || type;
}
