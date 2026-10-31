import { useEffect, useState } from 'react';
import api from '../api/axios';
import { formatEUR, billingTypeLabel } from '../utils/format';
import TravelClaimModal from '../components/TravelClaimModal';

function firstOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

const GROUPINGS = [
  { value: 'client', label: 'Client', rows: 'byClient' },
  { value: 'assignment', label: 'Assignment', rows: 'byAssignment' },
  { value: 'consultant', label: 'Consultant', rows: 'byConsultant' },
];

const NAME_COLUMNS = {
  client: [{ label: 'Client', value: (r) => r.clientName }],
  assignment: [
    { label: 'Assignment', value: (r) => r.assignmentTitle },
    { label: 'Client', value: (r) => r.clientName },
    { label: 'Billing', value: (r) => billingTypeLabel(r.billingType) },
  ],
  consultant: [{ label: 'Consultant', value: (r) => r.consultantName }],
};

const WORK_COLUMNS = [
  { label: 'Hours', value: (r) => r.hours.toFixed(2) },
  { label: 'Days', value: (r) => r.days.toFixed(2) },
  { label: 'Entries', value: (r) => r.entries },
];

const TRAVEL_COLUMN = { label: 'Travel', value: (r) => formatEUR(r.travelAmount) };

function billableColumns(groupBy, vatRate) {
  const amount = [{ label: 'Amount', value: (r) => formatEUR(r.amount) }, TRAVEL_COLUMN];
  if (groupBy === 'assignment') {
    return [...NAME_COLUMNS.assignment, ...amount, { label: 'Invoiced', value: (r) => formatEUR(r.invoicedAmount) }];
  }
  if (groupBy === 'consultant') return [...NAME_COLUMNS.consultant, ...WORK_COLUMNS, ...amount];
  return [
    ...NAME_COLUMNS.client,
    ...WORK_COLUMNS,
    ...amount,
    { label: 'Total excl. VAT', value: (r) => formatEUR(r.totalExclVat) },
    {
      label: `VAT ${Math.round(vatRate * 100)}%`,
      value: (r) => (r.vatExempt ? <span className="muted">No VAT</span> : formatEUR(r.vatAmount)),
    },
    { label: 'Total incl. VAT', value: (r) => formatEUR(r.totalInclVat) },
  ];
}

function nonBillableColumns(groupBy) {
  return [
    ...NAME_COLUMNS[groupBy],
    ...WORK_COLUMNS,
    { label: 'Value', value: (r) => formatEUR(r.amount) },
    TRAVEL_COLUMN,
  ];
}

function ReportTable({ columns, rows, action }) {
  return (
    <table>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.label}>{c.label}</th>
          ))}
          {action && <th></th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r._id}>
            {columns.map((c) => (
              <td key={c.label}>{c.value(r)}</td>
            ))}
            {action && <td style={{ textAlign: 'right' }}>{action(r)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Reports() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [loadedPeriod, setLoadedPeriod] = useState(null); // period the shown numbers belong to
  const [claimFor, setClaimFor] = useState(null); // consultant row whose km expense claim is open
  const [groupBy, setGroupBy] = useState('client');

  async function load() {
    setLoading(true);
    const { data } = await api.get('/reports/summary', { params: { from, to } });
    setReport(data);
    setLoadedPeriod({ from, to });
    setLoading(false);
  }

  // Confirm the shown numbers, then mark every time log of the period as invoiced
  async function invoicePeriod() {
    const { entries, amount, travelAmount, totalExclVat, vatAmount, totalInclVat } = report.toInvoice;
    const ok = window.confirm(
      `Invoice ${loadedPeriod.from} – ${loadedPeriod.to}?\n\n` +
        `${entries} time log${entries === 1 ? '' : 's'} not yet invoiced\n` +
        `Amount: ${formatEUR(amount)}\n` +
        `Travel: ${formatEUR(travelAmount)}\n` +
        `Total excl. VAT: ${formatEUR(totalExclVat)}\n` +
        `VAT ${Math.round(report.vatRate * 100)}%: ${formatEUR(vatAmount)}\n` +
        `Total incl. VAT: ${formatEUR(totalInclVat)}\n\n` +
        (report.onfactEnabled ? 'One invoice per client will be created in OnFact, with its official number. They are not sent to clients yet: review and send them from OnFact. ' : '') +
        'These logs will be marked as invoiced. Completed assignments with all logs invoiced become Invoiced, which is final.'
    );
    if (!ok) return;
    setInvoicing(true);
    try {
      const { data } = await api.post('/reports/invoice', loadedPeriod);
      const closed = data.assignmentsInvoiced;
      const onfactInvoices = data.invoices || [];
      const onfactErrors = data.errors || [];
      alert(
        `${data.entriesInvoiced} time log${data.entriesInvoiced === 1 ? '' : 's'} marked as invoiced.` +
          (onfactInvoices.length
            ? `\n\nCreated in OnFact:\n- ${onfactInvoices.map((i) => `${i.clientName} (#${i.id})`).join('\n- ')}`
            : '') +
          (onfactErrors.length
            ? `\n\nNOT invoiced, these logs stay open:\n- ${onfactErrors.map((e) => `${e.clientName}: ${e.message}`).join('\n- ')}`
            : '') +
          (closed.length ? `\n\nAssignments now invoiced:\n- ${closed.join('\n- ')}` : '')
      );
      await load();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not invoice this period.');
    } finally {
      setInvoicing(false);
    }
  }

  const periodChanged = loadedPeriod && (loadedPeriod.from !== from || loadedPeriod.to !== to);
  const rowsKey = GROUPINGS.find((g) => g.value === groupBy).rows;
  const billableRows = report?.billable[rowsKey] || [];
  const nonBillableRows = report?.nonBillable[rowsKey] || [];

  // A claim covers all km of a consultant, billable or not, so each consultant gets one button
  function kmClaimButton(row) {
    return (
      <button
        className="btn btn-sm"
        onClick={() => setClaimFor(row)}
        disabled={periodChanged}
        title={
          periodChanged
            ? 'Click Update first so the claim matches the selected period.'
            : 'Expense claim for the km driven, at the official km rate'
        }
      >
        Km claim
      </button>
    );
  }
  const billableConsultants = new Set(report?.billable.byConsultant.map((c) => c._id));

  async function exportByClient() {
    setExporting(true);
    try {
      const res = await api.get('/reports/by-client.xlsx', { params: { from, to }, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `report-by-client_${from}_${to}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Could not export the report.');
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Reports</h1>
        </div>
      </div>

      <div className="card filter-bar" style={{ marginBottom: 18, display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Update'}
        </button>
        <button className="btn" onClick={exportByClient} disabled={exporting}>
          {exporting ? 'Exporting…' : 'Export to Excel'}
        </button>
        {report && (
          <button
            className="btn btn-primary"
            style={{ marginLeft: 'auto' }}
            onClick={invoicePeriod}
            disabled={invoicing || loading || periodChanged || report.toInvoice.entries === 0}
            title={
              periodChanged
                ? 'Click Update first so the numbers match the selected period.'
                : report.toInvoice.entries === 0
                  ? 'All time logs in this period are already invoiced.'
                  : ''
            }
          >
            {invoicing
              ? 'Invoicing…'
              : report.toInvoice.entries === 0
                ? 'Period invoiced'
                : `Validate & invoice (${report.toInvoice.entries})`}
          </button>
        )}
      </div>

      {report && (
        <>
          <div className="stat-grid">
            <div className="stat">
              <div className="label">Billable income</div>
              <div className="value">{formatEUR(report.grandTotal)}</div>
            </div>
            <div className="stat">
              <div className="label">Billable travel</div>
              <div className="value">{formatEUR(report.travelTotal)}</div>
            </div>
            <div className="stat">
              <div className="label">Total incl. VAT</div>
              <div className="value">{formatEUR(report.totalInclVat)}</div>
            </div>
            <div className="stat stat-non-billable">
              <div className="label">Non-billable work</div>
              <div className="value">{formatEUR(report.nonBillableTotal)}</div>
            </div>
          </div>

          <div className="report-group-by" role="radiogroup" aria-label="Group by">
            <span>Group by</span>
            {GROUPINGS.map((g) => (
              <label className="checkbox-row" key={g.value}>
                <input
                  type="radio"
                  name="reportGroupBy"
                  checked={groupBy === g.value}
                  onChange={() => setGroupBy(g.value)}
                />
                {g.label}
              </label>
            ))}
          </div>

          <h2 style={{ marginBottom: 10 }}>Billable</h2>
          <div className="table-wrap" style={{ marginBottom: 22 }}>
            {billableRows.length === 0 ? (
              <div className="empty-state">No billable time in this period.</div>
            ) : (
              <ReportTable
                columns={billableColumns(groupBy, report.vatRate)}
                rows={billableRows}
                action={groupBy === 'consultant' ? kmClaimButton : null}
              />
            )}
          </div>

          {nonBillableRows.length > 0 && (
            <>
              <h2 style={{ marginBottom: 10 }}>
                Non-billable <span className="badge status-inactive">Not charged</span>
              </h2>
              <div className="table-wrap report-non-billable" style={{ marginBottom: 22 }}>
                <ReportTable
                  columns={nonBillableColumns(groupBy)}
                  rows={nonBillableRows}
                  action={
                    groupBy === 'consultant'
                      ? (row) => (billableConsultants.has(row._id) ? null : kmClaimButton(row))
                      : null
                  }
                />
              </div>
            </>
          )}
        </>
      )}

      {claimFor && (
        <TravelClaimModal
          consultantId={claimFor._id}
          consultantName={claimFor.consultantName}
          from={loadedPeriod.from}
          to={loadedPeriod.to}
          onClose={() => setClaimFor(null)}
        />
      )}
    </div>
  );
}
