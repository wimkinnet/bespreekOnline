import { useEffect, useState } from 'react';
import api from '../api/axios';
import { formatEUR, billingTypeLabel } from '../utils/format';

function firstOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function Reports() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [loadedPeriod, setLoadedPeriod] = useState(null); // period the shown numbers belong to

  async function load() {
    setLoading(true);
    const { data } = await api.get('/reports/summary', { params: { from, to } });
    setReport(data);
    setLoadedPeriod({ from, to });
    setLoading(false);
  }

  // Confirm the shown numbers, then mark every time log of the period as invoiced
  async function invoicePeriod() {
    const { entries, amount, travelAmount } = report.toInvoice;
    const exclVat = amount + travelAmount;
    const ok = window.confirm(
      `Invoice ${loadedPeriod.from} – ${loadedPeriod.to}?\n\n` +
        `${entries} time log${entries === 1 ? '' : 's'} not yet invoiced\n` +
        `Amount: ${formatEUR(amount)}\n` +
        `Travel: ${formatEUR(travelAmount)}\n` +
        `Total excl. VAT: ${formatEUR(exclVat)}\n` +
        `Total incl. ${Math.round(report.vatRate * 100)}% VAT: ${formatEUR(exclVat * (1 + report.vatRate))}\n\n` +
        'These logs will be marked as invoiced. Completed assignments with all logs invoiced become Invoiced, which is final.'
    );
    if (!ok) return;
    setInvoicing(true);
    try {
      const { data } = await api.post('/reports/invoice', loadedPeriod);
      const closed = data.assignmentsInvoiced;
      alert(
        `${data.entriesInvoiced} time log${data.entriesInvoiced === 1 ? '' : 's'} marked as invoiced.` +
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
          <p>Registered income by client, consultant and assignment.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18, display: 'flex', gap: 12, alignItems: 'flex-end' }}>
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
              <div className="label">Registered income</div>
              <div className="value">{formatEUR(report.grandTotal)}</div>
            </div>
            <div className="stat">
              <div className="label">Travel costs</div>
              <div className="value">{formatEUR(report.travelTotal)}</div>
            </div>
            <div className="stat">
              <div className="label">Total incl. {Math.round(report.vatRate * 100)}% VAT</div>
              <div className="value">{formatEUR(report.totalInclVat)}</div>
            </div>
          </div>

          <h2 style={{ marginBottom: 10 }}>By client</h2>
          <div className="table-wrap" style={{ marginBottom: 22 }}>
            {report.byClient.length === 0 ? (
              <div className="empty-state">No time logged in this period.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Hours</th>
                    <th>Days</th>
                    <th>Entries</th>
                    <th>Amount</th>
                    <th>Travel</th>
                    <th>Total excl. VAT</th>
                    <th>VAT {Math.round(report.vatRate * 100)}%</th>
                    <th>Total incl. VAT</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byClient.map((c) => (
                    <tr key={c.clientName}>
                      <td>{c.clientName}</td>
                      <td>{c.hours.toFixed(1)}</td>
                      <td>{c.days.toFixed(1)}</td>
                      <td>{c.entries}</td>
                      <td>{formatEUR(c.amount)}</td>
                      <td>{formatEUR(c.travelAmount)}</td>
                      <td>{formatEUR(c.totalExclVat)}</td>
                      <td>{formatEUR(c.vatAmount)}</td>
                      <td>{formatEUR(c.totalInclVat)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <h2 style={{ marginBottom: 10 }}>By consultant</h2>
          <div className="table-wrap" style={{ marginBottom: 22 }}>
            {report.byConsultant.length === 0 ? (
              <div className="empty-state">No time logged in this period.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Consultant</th>
                    <th>Hours</th>
                    <th>Days</th>
                    <th>Entries</th>
                    <th>Amount</th>
                    <th>Travel</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byConsultant.map((c) => (
                    <tr key={c.consultantName}>
                      <td>{c.consultantName}</td>
                      <td>{c.hours.toFixed(1)}</td>
                      <td>{c.days.toFixed(1)}</td>
                      <td>{c.entries}</td>
                      <td>{formatEUR(c.amount)}</td>
                      <td>{formatEUR(c.travelAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <h2 style={{ marginBottom: 10 }}>By assignment</h2>
          <div className="table-wrap" style={{ marginBottom: 22 }}>
            {report.byAssignment.length === 0 ? (
              <div className="empty-state">No time logged in this period.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Assignment</th>
                    <th>Billing</th>
                    <th>Amount</th>
                    <th>Travel</th>
                    <th>Invoiced</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byAssignment.map((a) => (
                    <tr key={a.assignmentTitle}>
                      <td>{a.assignmentTitle}</td>
                      <td>{billingTypeLabel(a.billingType)}</td>
                      <td>{formatEUR(a.amount)}</td>
                      <td>{formatEUR(a.travelAmount)}</td>
                      <td>{formatEUR(a.invoicedAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
