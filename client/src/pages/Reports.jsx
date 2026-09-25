import { useEffect, useState } from 'react';
import api from '../api/axios';
import { formatEUR } from '../utils/format';

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

  async function load() {
    setLoading(true);
    const { data } = await api.get('/reports/summary', { params: { from, to } });
    setReport(data);
    setLoading(false);
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
          <p>Billing totals by client, consultant and assignment.</p>
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
      </div>

      {report && (
        <>
          <div className="stat-grid">
            <div className="stat">
              <div className="label">Total billable (time-based)</div>
              <div className="value">{formatEUR(report.grandTotal)}</div>
            </div>
            <div className="stat">
              <div className="label">Fixed-fee assignments</div>
              <div className="value">{report.fixedAssignments.length}</div>
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
                    <th>Invoiced</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byAssignment.map((a) => (
                    <tr key={a.assignmentTitle}>
                      <td>{a.assignmentTitle}</td>
                      <td style={{ textTransform: 'capitalize' }}>{a.billingType}</td>
                      <td>{formatEUR(a.amount)}</td>
                      <td>{formatEUR(a.invoicedAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {report.fixedAssignments.length > 0 && (
            <>
              <h2 style={{ marginBottom: 10 }}>Fixed-fee assignments (billed once, not time-based)</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Assignment</th>
                      <th>Client</th>
                      <th>Status</th>
                      <th>Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.fixedAssignments.map((a) => (
                      <tr key={a._id}>
                        <td>{a.title}</td>
                        <td>{a.client?.name}</td>
                        <td style={{ textTransform: 'capitalize' }}>{a.status.replace('_', ' ')}</td>
                        <td>{formatEUR(a.rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
