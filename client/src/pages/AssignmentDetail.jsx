import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { formatEUR, formatDate, billingTypeLabel, statusLabel } from '../utils/format';

export default function AssignmentDetail() {
  const { id } = useParams();
  const { user } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    const { data: res } = await api.get(`/assignments/${id}`);
    setData(res);
    setForm({
      status: res.assignment.status,
      billingType: res.assignment.billingType,
      rate: res.assignment.rate,
      consultants: res.assignment.consultants.map((c) => c._id),
    });
    if (user.role === 'admin') {
      const { data: userList } = await api.get('/users');
      setUsers(userList);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.put(`/assignments/${id}`, {
        status: form.status,
        billingType: form.billingType,
        rate: Number(form.rate),
        consultants: form.consultants,
      });
      setEditing(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  function toggleConsultant(userId) {
    setForm((f) => ({
      ...f,
      consultants: f.consultants.includes(userId)
        ? f.consultants.filter((c) => c !== userId)
        : [...f.consultants, userId],
    }));
  }

  if (loading || !data) return <p className="muted">Loading…</p>;
  const { assignment, timeEntries, totals, documents } = data;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{assignment.title}</h1>
          <p>
            {assignment.client.type === 'school_pool' && 'School group · '}
            <Link to={`/clients/${assignment.client._id}`}>{assignment.client.name}</Link>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`badge status-${assignment.status}`}>{statusLabel(assignment.status)}</span>
          {user.role === 'admin' && !editing && (
            <button className="btn btn-sm" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </div>
      </div>

      {assignment.description && <p className="muted" style={{ marginBottom: 18 }}>{assignment.description}</p>}

      <div className="stat-grid">
        <div className="stat">
          <div className="label">Billing</div>
          <div className="value" style={{ fontSize: 18 }}>
            {billingTypeLabel(assignment.billingType)}
          </div>
        </div>
        <div className="stat">
          <div className="label">Rate</div>
          <div className="value" style={{ fontSize: 18 }}>
            {formatEUR(assignment.rate)}
            {assignment.billingType !== 'fixed' ? ` / ${assignment.billingType === 'hourly' ? 'h' : 'd'}` : ''}
          </div>
        </div>
        <div className="stat">
          <div className="label">Logged</div>
          <div className="value" style={{ fontSize: 18 }}>
            {assignment.billingType === 'hourly'
              ? `${totals.hours.toFixed(1)} h`
              : assignment.billingType === 'daily'
              ? `${totals.days.toFixed(1)} d`
              : `${timeEntries.length} entries`}
          </div>
        </div>
        <div className="stat">
          <div className="label">Total value</div>
          <div className="value" style={{ fontSize: 18 }}>
            {formatEUR(totals.amount)}
          </div>
        </div>
      </div>

      {editing && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3>Edit assignment</h3>
          {error && <div className="error-banner">{error}</div>}
          <form onSubmit={handleSave}>
            <div className="field-row">
              <div className="field">
                <label>Billing type</label>
                <select value={form.billingType} onChange={(e) => setForm({ ...form, billingType: e.target.value })}>
                  <option value="hourly">Per hour</option>
                  <option value="daily">Per day</option>
                  <option value="fixed">Fixed fee</option>
                </select>
              </div>
              <div className="field">
                <label>Rate (€)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.rate}
                  onChange={(e) => setForm({ ...form, rate: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label>Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="prospect">Prospect</option>
                <option value="active">Active</option>
                <option value="on_hold">On hold</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="field">
              <label>Staffed consultants</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {users.map((u) => (
                  <label className="checkbox-row" key={u.id}>
                    <input
                      type="checkbox"
                      checked={form.consultants.includes(u.id)}
                      onChange={() => toggleConsultant(u.id)}
                    />
                    {u.name}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button type="button" className="btn" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {!editing && assignment.consultants.length > 0 && (
        <p className="muted" style={{ marginBottom: 18 }}>
          Staffed: {assignment.consultants.map((c) => c.name).join(', ')}
        </p>
      )}

      <h2 style={{ marginBottom: 10 }}>Time entries</h2>
      <div className="table-wrap" style={{ marginBottom: 24 }}>
        {timeEntries.length === 0 ? (
          <div className="empty-state">No time logged on this assignment yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Consultant</th>
                <th>Logged</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Invoiced</th>
              </tr>
            </thead>
            <tbody>
              {timeEntries.map((e) => (
                <tr key={e._id}>
                  <td>{formatDate(e.date)}</td>
                  <td>{e.consultant?.name}</td>
                  <td>{e.hours ? `${e.hours} h` : e.days ? `${e.days} d` : '—'}</td>
                  <td>{e.description || '—'}</td>
                  <td>{formatEUR(e.amount)}</td>
                  <td>{e.invoiced ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2 style={{ marginBottom: 10 }}>Documents</h2>
      <div className="table-wrap">
        {documents.length === 0 ? (
          <div className="empty-state">
            No files linked to this assignment yet. Upload from the client's Documents tab and select this
            assignment.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Category</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d._id}>
                  <td>{d.originalName}</td>
                  <td>{d.category === 'bill' ? 'Bill' : 'Document'}</td>
                  <td>{formatDate(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
