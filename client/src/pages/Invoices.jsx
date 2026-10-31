import { useEffect, useState } from 'react';
import api from '../api/axios';
import { formatEUR } from '../utils/format';

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(null); // id of the client whose PDF is being made
  const [brands, setBrands] = useState({}); // chosen brand per client id; bespreek unless changed
  const [issuing, setIssuing] = useState(null); // id of the client whose invoice is being created

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

  // Downloads a file the server answers with, under the given name
  async function saveFile(url, fileName, params) {
    const res = await api.get(url, { params, responseType: 'blob' });
    const objectUrl = URL.createObjectURL(res.data);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(objectUrl);
  }

  // Gives the invoice its number, stores the PDF with the client's bills and marks its time logs as invoiced
  async function createInvoice(invoice) {
    const { client, entries, totalInclVat } = invoice;
    const brand = brands[client._id] || 'bespreek';
    const ok = window.confirm(
      `Create the invoice to ${client.name}?\n\n` +
        `${entries} time log${entries === 1 ? '' : 's'}, ${formatEUR(totalInclVat)} incl. VAT\n` +
        `PDF as: ${brand === 'catalista' ? 'Catalista' : 'bespreek'}\n\n` +
        'It gets the next invoice number and is stored under Documents & bills of this client. These logs become invoiced. The app cannot undo this.\n\n' +
        'The app does not send anything: you mail the PDF yourself.'
    );
    if (!ok) return;
    setIssuing(client._id);
    setError('');
    try {
      const { data } = await api.post(`/invoices/${client._id}/create`, { brand, entries });
      await saveFile(`/documents/${data.document._id}/download`, data.document.originalName);
      alert(
        `Invoice ${data.invoiceNumber} created and downloaded.\n` +
          `${data.entriesInvoiced} time log${data.entriesInvoiced === 1 ? '' : 's'} marked as invoiced.`
      );
    } catch (err) {
      setError(`${client.name}: ${err.response?.data?.message || 'Could not create this invoice.'}`);
    } finally {
      setIssuing(null);
      await load();
    }
  }

  async function downloadPdf(client) {
    setCreating(client._id);
    setError('');
    try {
      await saveFile(`/invoices/${client._id}/pdf`, `factuur-concept_${client.name.replace(/[^\w-]+/g, '_')}.pdf`, {
        brand: brands[client._id] || 'bespreek',
      });
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
          <p>Billable time not yet invoiced. Concept shows the PDF without changing anything; Create invoice gives it its number.</p>
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
                        {creating === i.client._id ? 'Creating…' : 'Concept'}
                      </button>
                      <button className="btn btn-sm btn-primary" onClick={() => createInvoice(i)} disabled={issuing === i.client._id}>
                        {issuing === i.client._id ? 'Creating…' : 'Create invoice'}
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
