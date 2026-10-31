import { useEffect, useState } from 'react';
import api from '../api/axios';
import { formatEUR } from '../utils/format';

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(null); // id of the client whose PDF is being made
  const [brands, setBrands] = useState({}); // chosen brand per client id; bespreek unless changed
  const [marking, setMarking] = useState(null); // id of the client being marked as sent

  function load() {
    return api
      .get('/invoices/open')
      .then(({ data }) => setInvoices(data))
      .catch((err) => setError(err.response?.data?.message || 'Could not load the time to invoice.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  // Stores the PDF with the client's bills and marks its time logs as invoiced
  async function markSent(invoice) {
    const { client, entries, totalInclVat } = invoice;
    const brand = brands[client._id] || 'bespreek';
    const ok = window.confirm(
      `Mark the invoice to ${client.name} as sent?\n\n` +
        `${entries} time log${entries === 1 ? '' : 's'}, ${formatEUR(totalInclVat)} incl. VAT\n` +
        `PDF as: ${brand === 'catalista' ? 'Catalista' : 'bespreek'}\n\n` +
        'The PDF is stored under Documents & bills of this client and these logs become invoiced, which the app cannot undo.\n\n' +
        'The app does not email anything: send the invoice from OnFact.'
    );
    if (!ok) return;
    setMarking(client._id);
    setError('');
    try {
      const { data } = await api.post(`/invoices/${client._id}/sent`, { brand, entries });
      const closed = data.assignmentsInvoiced;
      alert(
        `${data.entriesInvoiced} time log${data.entriesInvoiced === 1 ? '' : 's'} marked as invoiced.\n` +
          `Stored as ${data.document}.` +
          (closed.length ? `\n\nAssignments now invoiced:\n- ${closed.join('\n- ')}` : '')
      );
    } catch (err) {
      setError(`${client.name}: ${err.response?.data?.message || 'Could not store this invoice.'}`);
    } finally {
      setMarking(null);
      await load();
    }
  }

  async function downloadPdf(client) {
    setCreating(client._id);
    setError('');
    try {
      const res = await api.get(`/invoices/${client._id}/pdf`, {
        params: { brand: brands[client._id] || 'bespreek' },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `overzicht-prestaties_${client.name.replace(/[^\w-]+/g, '_')}.pdf`;
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
      <div className="table-wrap" style={{ overflowX: 'auto' }}>
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
                    <div className="invoice-actions">
                      <select
                        aria-label={`Brand on the PDF for ${i.client.name}`}
                        value={brands[i.client._id] || 'bespreek'}
                        onChange={(e) => setBrands({ ...brands, [i.client._id]: e.target.value })}
                      >
                        <option value="bespreek">bespreek</option>
                        <option value="catalista">Catalista</option>
                      </select>
                      <button className="btn btn-sm" onClick={() => downloadPdf(i.client)} disabled={creating === i.client._id}>
                        {creating === i.client._id ? 'Creating…' : 'PDF'}
                      </button>
                      <button className="btn btn-sm btn-primary" onClick={() => markSent(i)} disabled={marking === i.client._id}>
                        {marking === i.client._id ? 'Saving…' : 'Sent to client'}
                      </button>
                    </div>
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
