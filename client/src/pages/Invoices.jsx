import { useEffect, useState } from 'react';
import api from '../api/axios';
import { formatEUR, formatDate } from '../utils/format';

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [created, setCreated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(null); // id of the client whose PDF is being made
  const [brands, setBrands] = useState({}); // chosen brand per client id; bespreek unless changed
  const [issuing, setIssuing] = useState(null); // id of the client whose invoice is being created

  function load() {
    return Promise.all([api.get('/invoices/open'), api.get('/invoices/created')])
      .then(([open, made]) => {
        setInvoices(open.data);
        setCreated(made.data);
      })
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

  // Today as yyyy-mm-dd on this computer
  function todayIso() {
    return new Intl.DateTimeFormat('en-CA').format(new Date());
  }

  async function setPaid(invoice, paidAt) {
    setError('');
    try {
      await api.put(`/invoices/created/${invoice._id}/paid`, { paidAt });
      await load();
    } catch (err) {
      setError(`Invoice ${invoice.invoiceNumber}: ${err.response?.data?.message || 'Could not save the payment.'}`);
    }
  }

  function markPaid(invoice) {
    const paidAt = window.prompt(`Invoice ${invoice.invoiceNumber} to ${invoice.client?.name} was paid on (yyyy-mm-dd):`, todayIso());
    if (paidAt) setPaid(invoice, paidAt.trim());
  }

  function markUnpaid(invoice) {
    if (window.confirm(`Set invoice ${invoice.invoiceNumber} back to unpaid?`)) setPaid(invoice, null);
  }

  function paymentStatus(invoice) {
    if (invoice.paidAt) return { label: `Paid ${formatDate(invoice.paidAt)}`, className: 'invoice-paid' };
    if (todayIso() > invoice.dueDate.slice(0, 10)) return { label: `Overdue since ${formatDate(invoice.dueDate)}`, className: 'invoice-overdue' };
    return { label: `Due ${formatDate(invoice.dueDate)}`, className: 'invoice-open' };
  }

  const unpaid = created.filter((i) => !i.paidAt);
  const overdue = unpaid.filter((i) => paymentStatus(i).className === 'invoice-overdue');
  const sumIncl = (list) => list.reduce((total, i) => total + i.totalInclVat, 0);

  async function downloadCreated(invoice) {
    setError('');
    try {
      await saveFile(`/documents/${invoice._id}/download`, invoice.originalName);
    } catch {
      setError(`Could not download invoice ${invoice.invoiceNumber}.`);
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

      <h2 style={{ margin: '24px 0 4px' }}>Created invoices</h2>
      {created.length > 0 && (
        <p className="muted" style={{ marginBottom: 10 }}>
          Unpaid: {formatEUR(sumIncl(unpaid))} incl. VAT in {unpaid.length} invoice{unpaid.length === 1 ? '' : 's'}
          {overdue.length > 0 && `, of which ${formatEUR(sumIncl(overdue))} overdue`}
        </p>
      )}
      <div className="table-wrap" style={{ overflowX: 'auto' }}>
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : created.length === 0 ? (
          <div className="empty-state">No invoices created yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>Client</th>
                <th>VAT number</th>
                <th>Total excl. VAT</th>
                <th>VAT</th>
                <th>Total incl. VAT</th>
                <th>Payment</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {created.map((i) => (
                <tr key={i._id}>
                  <td>
                    <strong>{i.invoiceNumber}</strong>
                  </td>
                  <td>{formatDate(i.createdAt)}</td>
                  <td>{i.client?.name}</td>
                  <td>{i.client?.vatNumber || <span className="muted">None</span>}</td>
                  <td>{formatEUR(i.totalExclVat)}</td>
                  <td>{i.client?.vatExempt ? <span className="muted">No VAT</span> : formatEUR(i.vatAmount)}</td>
                  <td>{formatEUR(i.totalInclVat)}</td>
                  <td>
                    <span className={`badge ${paymentStatus(i).className}`}>{paymentStatus(i).label}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="row-actions">
                      {i.paidAt ? (
                        <button className="btn btn-sm" onClick={() => markUnpaid(i)}>
                          Mark unpaid
                        </button>
                      ) : (
                        <button className="btn btn-sm btn-primary" onClick={() => markPaid(i)}>
                          Mark paid
                        </button>
                      )}
                      <button className="btn btn-sm" onClick={() => downloadCreated(i)}>
                        Download
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
