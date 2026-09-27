import { useEffect, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { formatEUR, formatDate, billingTypeLabel, rateUnitLabel } from '../utils/format';

const today = () => new Date().toISOString().slice(0, 10);
const DEFAULT_TRAVEL_RATE = '0.45'; // EUR per km

// Whether a date (YYYY-MM-DD) falls within an assignment's period; a missing start or end date is open-ended
function inPeriod(assignment, date) {
  const start = assignment.startDate?.slice(0, 10);
  const end = assignment.endDate?.slice(0, 10);
  return (!start || date >= start) && (!end || date <= end);
}

function periodLabel(assignment) {
  if (!assignment.startDate && !assignment.endDate) return 'no period';
  const start = assignment.startDate ? formatDate(assignment.startDate) : '…';
  const end = assignment.endDate ? formatDate(assignment.endDate) : '…';
  return `${start} – ${end}`;
}

// includeTravel starts unanswered (null) so the consultant has to choose yes or no for every entry
const emptyEntry = (assignment = '') => ({
  assignment,
  date: today(),
  amountValue: '',
  feeAmount: '',
  description: '',
  billable: true,
  includeTravel: null,
  travelKm: '',
  travelRate: DEFAULT_TRAVEL_RATE,
});

export default function TimeRegistration() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(emptyEntry());
  const [travel, setTravel] = useState(null); // distance lookup result for the selected assignment
  const [travelError, setTravelError] = useState('');
  const [travelLoading, setTravelLoading] = useState(false);
  const [feeRemaining, setFeeRemaining] = useState(null); // part of a fixed fee not yet registered

  const selectedAssignment = assignments.find((a) => a._id === form.assignment);
  const currentAssignments = assignments.filter((a) => inPeriod(a, form.date));
  const otherAssignments = assignments.filter((a) => !inPeriod(a, form.date));

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

  // For a fixed fee, suggest billing whatever part of the fee has not been registered yet
  const fixedAssignmentId = selectedAssignment?.billingType === 'fixed' ? selectedAssignment._id : null;
  useEffect(() => {
    setFeeRemaining(null);
    if (!fixedAssignmentId) return;
    let cancelled = false;
    api.get(`/assignments/${fixedAssignmentId}`).then(({ data }) => {
      if (cancelled) return;
      const remaining = Math.max(0, Math.round((data.assignment.rate - data.totals.amount) * 100) / 100);
      setFeeRemaining(remaining);
      setForm((f) => (f.feeAmount === '' ? { ...f, feeAmount: String(remaining) } : f));
    });
    return () => {
      cancelled = true;
    };
  }, [fixedAssignmentId, entries]);

  // Look up the distance from the consultant's home to the client once travel costs are requested
  const clientId = selectedAssignment?.client?._id;
  useEffect(() => {
    if (!form.includeTravel || !clientId) return;
    let cancelled = false;
    setTravel(null);
    setTravelError('');
    setTravelLoading(true);
    api
      .get('/distance', { params: { client: clientId } })
      .then(({ data }) => {
        if (cancelled) return;
        setTravel(data);
        setForm((f) => ({ ...f, travelKm: String(data.roundTripKm) }));
      })
      .catch((err) => {
        if (!cancelled) setTravelError(err.response?.data?.message || 'Could not calculate the distance.');
      })
      .finally(() => {
        if (!cancelled) setTravelLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form.includeTravel, clientId]);

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
        includeTravel: form.includeTravel,
      };
      if (form.includeTravel) {
        if (form.travelKm !== '') payload.travelKm = Number(form.travelKm);
        payload.travelRate = Number(form.travelRate);
      }
      if (selectedAssignment.billingType === 'hourly') payload.hours = Number(form.amountValue);
      if (['daily', 'half_day'].includes(selectedAssignment.billingType)) payload.days = Number(form.amountValue);
      // Fixed fees are billed by registering an amount; hours worked are tracked for visibility only
      if (selectedAssignment.billingType === 'fixed') {
        payload.feeAmount = Number(form.feeAmount);
        payload.hours = Number(form.amountValue) || undefined;
      }

      await api.post('/time-entries', payload);
      setForm(emptyEntry(form.assignment));
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
          <p>Log hours, days or fixed-fee amounts against an assignment. Only registered entries count as income.</p>
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
                  onChange={(e) =>
                    setForm({ ...form, assignment: e.target.value, amountValue: '', feeAmount: '', travelKm: '' })
                  }
                >
                  <option value="">Select an assignment…</option>
                  <optgroup label="Within the assignment period">
                    {currentAssignments.map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.client?.name} — {a.title} ({billingTypeLabel(a.billingType)})
                      </option>
                    ))}
                  </optgroup>
                  {otherAssignments.length > 0 && (
                    <optgroup label="Outside the assignment period">
                      {otherAssignments.map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.client?.name} — {a.title} ({periodLabel(a)})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {selectedAssignment && !inPeriod(selectedAssignment, form.date) && (
                  <div className="muted" style={{ fontSize: 12 }}>
                    This date is outside the assignment period ({periodLabel(selectedAssignment)}).
                  </div>
                )}
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
                      : selectedAssignment.billingType === 'half_day'
                      ? 'Days worked (0.5 = one half day)'
                      : 'Hours worked (optional, for tracking)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step={['hourly', 'fixed'].includes(selectedAssignment.billingType) ? '0.25' : '0.5'}
                    required={selectedAssignment.billingType !== 'fixed'}
                    value={form.amountValue}
                    onChange={(e) => setForm({ ...form, amountValue: e.target.value })}
                  />
                </div>
                {selectedAssignment.billingType === 'fixed' ? (
                  <div className="field">
                    <label>Amount to bill (€)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      max={feeRemaining ?? undefined}
                      required
                      value={form.feeAmount}
                      onChange={(e) => setForm({ ...form, feeAmount: e.target.value })}
                    />
                    <div className="muted" style={{ fontSize: 12 }}>
                      Fixed fee {formatEUR(selectedAssignment.rate)}
                      {feeRemaining !== null && ` · ${formatEUR(feeRemaining)} not yet registered`}
                    </div>
                  </div>
                ) : (
                  <div className="field">
                    <label>Rate applied</label>
                    <input
                      disabled
                      value={`${formatEUR(selectedAssignment.rate)} / ${rateUnitLabel(selectedAssignment.billingType)}`}
                    />
                  </div>
                )}
              </div>
            )}

            {selectedAssignment && (
              <div className="field">
                <label>Include travel costs?</label>
                <div style={{ display: 'flex', gap: 18 }}>
                  <label className="checkbox-row" style={{ margin: 0 }}>
                    <input
                      type="radio"
                      name="includeTravel"
                      required
                      checked={form.includeTravel === true}
                      onChange={() => setForm({ ...form, includeTravel: true })}
                    />
                    Yes
                  </label>
                  <label className="checkbox-row" style={{ margin: 0 }}>
                    <input
                      type="radio"
                      name="includeTravel"
                      required
                      checked={form.includeTravel === false}
                      onChange={() => setForm({ ...form, includeTravel: false, travelKm: '' })}
                    />
                    No
                  </label>
                </div>
              </div>
            )}

            {selectedAssignment && form.includeTravel && (
              <div className="field-row">
                <div className="field">
                  <label>Distance, round trip (km)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    required
                    placeholder={travelLoading ? 'Calculating…' : ''}
                    value={form.travelKm}
                    onChange={(e) => setForm({ ...form, travelKm: e.target.value })}
                  />
                  {travelLoading && <div className="muted" style={{ fontSize: 12 }}>Calculating distance…</div>}
                  {travel && (
                    <div className="muted" style={{ fontSize: 12 }}>
                      {travel.oneWayKm} km each way from {travel.from} to {travel.to}, rounded up to a multiple of 5 km. Adjust if you drove further.
                    </div>
                  )}
                  {travelError && (
                    <div className="muted" style={{ fontSize: 12 }}>
                      {travelError} Enter the distance manually.
                    </div>
                  )}
                </div>
                <div className="field">
                  <label>Rate (€ / km)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={form.travelRate}
                    onChange={(e) => setForm({ ...form, travelRate: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Travel costs</label>
                  <input
                    disabled
                    value={
                      form.travelKm !== '' && form.travelRate !== ''
                        ? formatEUR(Number(form.travelKm) * Number(form.travelRate))
                        : '—'
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
                <th>Travel</th>
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
                  <td>{e.travelIncluded ? `${e.travelKm} km × ${formatEUR(e.travelRate)} = ${formatEUR(e.travelAmount)}` : '—'}</td>
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
