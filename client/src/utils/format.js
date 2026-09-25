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
  return { hourly: 'Per hour', daily: 'Per day', fixed: 'Fixed fee' }[type] || type;
}

export function statusLabel(status) {
  return status.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase());
}
