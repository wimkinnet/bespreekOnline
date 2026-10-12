import { useEffect, useState } from 'react';
import api from '../api/axios';
import { formatEUR, formatDate } from '../utils/format';

const COMPANY_FIELDS = [
  ['name', 'Legal name (incl. legal form)', 'e.g. bespreek bv'],
  ['street', 'Street & number', ''],
  ['postalCode', 'Postal code', ''],
  ['city', 'City', ''],
  ['enterpriseNumber', 'Enterprise number (KBO)', 'BE 0123.456.789'],
];

async function downloadPdf(claim) {
  const res = await api.get(`/travel-claims/${claim._id}/pdf`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${claim.number}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

// Expense claim for the km a consultant drove in a period, reimbursed at the official km rate.
// Asks for the company and consultant details the claim needs, previews the trips and issues the PDF.
export default function TravelClaimModal({ consultantId, consultantName, from, to, onClose }) {
  const [preview, setPreview] = useState(null);
  const [claims, setClaims] = useState([]);
  const [company, setCompany] = useState(null);
  const [consultant, setConsultant] = useState(null);
  const [editingCompany, setEditingCompany] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setError('');
    try {
      const [previewRes, claimsRes, companyRes, usersRes] = await Promise.all([
        api.get('/travel-claims/preview', { params: { consultant: consultantId, from, to } }),
        api.get('/travel-claims', { params: { consultant: consultantId } }),
        api.get('/settings/company'),
        api.get('/users'),
      ]);
      setPreview(previewRes.data);
      setClaims(claimsRes.data);
      setCompany({ name: '', street: '', postalCode: '', city: '', enterpriseNumber: '', ...companyRes.data });
      const user = usersRes.data.find((u) => u.id === consultantId) || {};
      setConsultant({
        street: user.homeAddress?.street || '',
        postalCode: user.homeAddress?.postalCode || '',
        city: user.homeAddress?.city || '',
        iban: user.iban || '',
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not prepare the expense claim.');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const missing = preview?.missing || [];
  const companyMissing = missing.some((m) => m.startsWith('company'));
  const consultantMissing = missing.some((m) => m.startsWith('consultant'));
  const showCompanyForm = editingCompany || companyMissing;

  async function saveDetails(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (showCompanyForm) await api.put('/settings/company', company);
      if (consultantMissing) {
        await api.put(`/users/${consultantId}`, {
          homeAddress: { street: consultant.street, postalCode: consultant.postalCode, city: consultant.city },
          iban: consultant.iban,
        });
      }
      setEditingCompany(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save the details.');
    } finally {
      setBusy(false);
    }
  }

  async function issueClaim() {
    const ok = window.confirm(
      `Issue an expense claim for ${consultantName}?\n\n` +
        `${preview.lines.length} trip${preview.lines.length === 1 ? '' : 's'}, ${preview.totalKm} km: ${formatEUR(preview.totalAmount)}\n\n` +
        'The claim gets the next number in this consultant’s series, and the travel of these entries is locked.'
    );
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/travel-claims', { consultant: consultantId, from, to });
      await downloadPdf(data);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not issue the expense claim.');
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(claim) {
    if (!window.confirm(`Withdraw ${claim.number}? Its trips become claimable again.`)) return;
    try {
      await api.delete(`/travel-claims/${claim._id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not withdraw the expense claim.');
    }
  }

  const companyFields = (
    <>
      {COMPANY_FIELDS.map(([key, label, placeholder]) => (
        <div className="field" key={key}>
          <label>{label}</label>
          <input
            required
            placeholder={placeholder}
            value={company?.[key] || ''}
            onChange={(e) => setCompany({ ...company, [key]: e.target.value })}
          />
        </div>
      ))}
    </>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Km expense claim</h2>
            <p className="muted" style={{ margin: 0 }}>
              {consultantName} · {formatDate(from)} – {formatDate(to)}
            </p>
          </div>
          <button className="btn btn-sm" onClick={onClose}>
            Close
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}
        {!preview && !error && <p className="muted">Loading…</p>}

        {preview && (showCompanyForm || consultantMissing) && (
          <form onSubmit={saveDetails} className="card" style={{ marginBottom: 16 }}>
            <h3>Details needed for the claim</h3>
            {missing.length > 0 && <p className="muted">Missing: {missing.join(', ')}.</p>}
            {showCompanyForm && (
              <>
                <h3 style={{ fontSize: 14, marginTop: 8 }}>Company</h3>
                {companyFields}
              </>
            )}
            {consultantMissing && (
              <>
                <h3 style={{ fontSize: 14, marginTop: 8 }}>{consultantName}</h3>
                <div className="field">
                  <label>Home address</label>
                  <input
                    required
                    placeholder="Street & number"
                    value={consultant.street}
                    onChange={(e) => setConsultant({ ...consultant, street: e.target.value })}
                  />
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Postal code</label>
                    <input
                      required
                      value={consultant.postalCode}
                      onChange={(e) => setConsultant({ ...consultant, postalCode: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>City</label>
                    <input
                      required
                      value={consultant.city}
                      onChange={(e) => setConsultant({ ...consultant, city: e.target.value })}
                    />
                  </div>
                </div>
                <div className="field">
                  <label>IBAN (for the reimbursement)</label>
                  <input
                    required
                    placeholder="BE.. .... .... ...."
                    value={consultant.iban}
                    onChange={(e) => setConsultant({ ...consultant, iban: e.target.value })}
                  />
                </div>
              </>
            )}
            <button className="btn btn-primary" type="submit" disabled={busy}>
              Save details
            </button>
          </form>
        )}

        {preview && (
          <>
            {preview.lines.length === 0 ? (
              <p className="muted">No unclaimed trips in this period.</p>
            ) : (
              <>
                <div className="table-wrap" style={{ marginBottom: 12 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Client</th>
                        <th>Km (round trip)</th>
                        <th>Rate</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.lines.map((l) => (
                        <tr key={l.timeEntry}>
                          <td>{formatDate(l.date)}</td>
                          <td>{l.clientName}</td>
                          <td>
                            {l.km}
                            {l.kmEstimated ? ' *' : ''}
                          </td>
                          <td>€ {l.rate.toFixed(4).replace('.', ',')}</td>
                          <td>{formatEUR(l.amount)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td>
                          <strong>Total</strong>
                        </td>
                        <td></td>
                        <td>
                          <strong>{preview.totalKm}</strong>
                        </td>
                        <td></td>
                        <td>
                          <strong>{formatEUR(preview.totalAmount)}</strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="muted" style={{ fontSize: 13 }}>
                  Official annual km rate per trip date. Charged to clients for these trips:{' '}
                  {formatEUR(preview.clientCharged)}.
                  {preview.lines.some((l) => l.kmEstimated) &&
                    ' * Km estimated from an earlier travel amount (0.45 €/km rounded up to €5), lower bound.'}
                </p>
              </>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
              <button
                className="btn btn-primary"
                onClick={issueClaim}
                disabled={busy || missing.length > 0 || preview.lines.length === 0}
              >
                {busy ? 'Working…' : 'Create claim & download PDF'}
              </button>
              {!showCompanyForm && (
                <button className="btn" onClick={() => setEditingCompany(true)}>
                  Edit company details
                </button>
              )}
            </div>

            {claims.length > 0 && (
              <>
                <h3>Issued claims</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Number</th>
                        <th>Period</th>
                        <th>Km</th>
                        <th>Amount</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {claims.map((c, i) => (
                        <tr key={c._id}>
                          <td>{c.number}</td>
                          <td>
                            {formatDate(c.periodFrom)} – {formatDate(c.periodTo)}
                          </td>
                          <td>{c.totalKm}</td>
                          <td>{formatEUR(c.totalAmount)}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button className="btn btn-sm" onClick={() => downloadPdf(c)}>
                              PDF
                            </button>{' '}
                            {i === 0 && (
                              <button className="btn btn-sm btn-danger" onClick={() => withdraw(c)}>
                                Withdraw
                              </button>
                            )}
                          </td>
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
    </div>
  );
}
