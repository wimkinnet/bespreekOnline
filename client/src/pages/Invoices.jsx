import { useEffect, useState } from 'react';
import api from '../api/axios';
import { formatEUR } from '../utils/format';

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(null); // id of the client whose PDF is being made

  useEffect(() => {
    api
      .get('/invoices/open')
      .then(({ data }) => setInvoices(data))
      .catch((err) => setError(err.response?.data?.message || 'Could not load the time to invoice.'))
      .finally(() => setLoading(false));
  }, []);

  async function downloadPdf(client) {
    setCreating(client._id);
    setError('');
    try {
      const res = await api.get(`/invoices/${client._id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `factuurspecificatie_${client.name.replace(/[^\w-]+/g, '_')}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      // The answer was requested as a file, so an error message arrives as one too
      const text = await err.response?.data?.text?.();
      let message = 'Could not create the PDF.';
      try {
        message = JSON.parse(text).message || message;
      } catch {
        // keep the general message
      }
      setError(`${client.name}: ${message}`);
    } finally {
      setCreating(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Invoices</h1>
          <p>Billable time not yet invoiced. Creating a PDF does not mark anything as invoiced.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <h2 style={{ marginBottom: 10 }}>Per client</h2>
      <div className="table-wrap">
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : invoices.length === 0 ? (
          <div className="empty-state">All billable time is invoiced.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>VAT number</th>
                <th>Assignments</th>
                <th>Entries</th>
                <th>Total excl. VAT</th>
                <th>VAT</th>
                <th>Total incl. VAT</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.client._id}>
                  <td>
                    <strong>{i.client.name}</strong>
                  </td>
                  <td>{i.client.vatNumber || <span className="muted">None</span>}</td>
                  <td>{i.assignments.map((a) => a.title).join(', ')}</td>
                  <td>
                    {i.entries}
                    {i.nonBillableEntries > 0 && <div className="muted">+{i.nonBillableEntries} non-billable</div>}
                  </td>
                  <td>{formatEUR(i.totalExclVat)}</td>
                  <td>{i.client.vatExempt ? <span className="muted">No VAT</span> : formatEUR(i.vatAmount)}</td>
                  <td>{formatEUR(i.totalInclVat)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-sm" onClick={() => downloadPdf(i.client)} disabled={creating === i.client._id}>
                      {creating === i.client._id ? 'Creating…' : 'PDF'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
