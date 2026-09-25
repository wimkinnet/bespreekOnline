import { useEffect, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { formatEUR, formatDate, billingTypeLabel } from '../utils/format';

const today = () => new Date().toISOString().slice(0, 10);

export default function TimeRegistration() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    assignment: '',
    date: today(),
    amountValue: '',
    description: '',
    billable: true,
  });

  const selectedAssignment = assignments.find((a) => a._id === form.assignment);

  async function load() {
    setLoading(true);
    const params = user.role === 'admin' ? {} : { mine: 'true' };
    const [assignmentsRes, entriesRes] = await Promise.all([
      api.get('/assignments', { params: { ...params, status: undefined } }),
      api.get('/time-entries'),
    ]);
    // Keep only assignments this consultant can actually log against; admins see all
    setAssignments(assignmentsRes.data);
    setEntries(entriesRes.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedAssignment) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        assignment: form.assignment,
        date: form.date,
        description: form.description,
        billable: form.billable,
      };
      if (selectedAssignment.billingType === 'hourly') payload.hours = Number(form.amountValue);
      if (selectedAssignment.billingType === 'daily') payload.days = Number(form.amountValue);
      // Fixed-fee assignments still track days worked internally for visibility
      if (selectedAssignment.billingType === 'fixed') payload.days = Number(form.amountValue) || undefined;

      await api.post('/time-entries', payload);
      setForm({ assignment: form.assignment, date: today(), amountValue: '', description: '', billable: true });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save time entry.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entryId) {
    if (!window.confirm('Delete this time entry?')) return;
    await api.delete(`/time-entries/${entryId}`);
    load();
  }

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Time registration</h1>
          <p>Log hours or days against an assignment. Rates are applied automatically.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2>New entry</h2>
        {error && <div className="error-banner">{error}</div>}
        {assignments.length === 0 ? (
          <p className="muted">
            You're not staffed on any assignment yet. Ask an admin to add you to one before logging time.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field-row">
              <div className="field">
                <label>Assignment</label>
                <select
                  required
                  value={form.assignment}
                  onChange={(e) => setForm({ ...form, assignment: e.target.value, amountValue: '' })}
                >
                  <option value="">Select an assignment…</option>
                  {assignments.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.client?.name} — {a.title} ({billingTypeLabel(a.billingType)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Date</label>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
            </div>

            {selectedAssignment && (
              <div className="field-row">
                <div className="field">
                  <label>
                    {selectedAssignment.billingType === 'hourly'
                      ? 'Hours worked'
                      : selectedAssignment.billingType === 'daily'
                      ? 'Days worked'
                      : 'Days worked (for tracking, not billed separately)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step={selectedAssignment.billingType === 'hourly' ? '0.25' : '0.5'}
                    required={selectedAssignment.billingType !== 'fixed'}
                    value={form.amountValue}
                    onChange={(e) => setForm({ ...form, amountValue: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Rate applied</label>
                  <input
                    disabled
                    value={
                      selectedAssignment.billingType === 'fixed'
                        ? `${formatEUR(selectedAssignment.rate)} total, fixed fee`
                        : `${formatEUR(selectedAssignment.rate)} / ${
                            selectedAssignment.billingType === 'hourly' ? 'hour' : 'day'
                          }`
                    }
                  />
                </div>
              </div>
            )}

            <div className="field">
              <label>Description</label>
              <input
                placeholder="What did you work on?"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="checkbox-row" style={{ marginBottom: 14 }}>
              <input
                type="checkbox"
                checked={form.billable}
                onChange={(e) => setForm({ ...form, billable: e.target.checked })}
              />
              <label style={{ margin: 0 }}>Billable</label>
            </div>

            <button className="btn btn-primary" type="submit" disabled={saving || !selectedAssignment}>
              {saving ? 'Saving…' : 'Log time'}
            </button>
          </form>
        )}
      </div>

      <h2 style={{ marginBottom: 10 }}>{user.role === 'admin' ? 'All time entries' : 'Your time entries'}</h2>
      <div className="table-wrap">
        {entries.length === 0 ? (
          <div className="empty-state">No time entries yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                {user.role === 'admin' && <th>Consultant</th>}
                <th>Assignment</th>
                <th>Logged</th>
                <th>Amount</th>
                <th>Billable</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e._id}>
                  <td>{formatDate(e.date)}</td>
                  {user.role === 'admin' && <td>{e.consultant?.name}</td>}
                  <td>{e.assignment?.title}</td>
                  <td>{e.hours ? `${e.hours} h` : e.days ? `${e.days} d` : '—'}</td>
                  <td>{formatEUR(e.amount)}</td>
                  <td>{e.billable ? 'Yes' : 'No'}</td>
                  <td style={{ textAlign: 'right' }}>
                    {!e.invoiced && (
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(e._id)}>
                        Delete
                      </button>
                    )}
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
