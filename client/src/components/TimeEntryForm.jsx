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
const emptyEntry = (assignment = '', consultant = '') => ({
  assignment,
  consultant,
  date: today(),
  amountValue: '',
  feeAmount: '',
  description: '',
  billable: true,
  includeTravel: null,
  travelType: 'km',
  travelKm: '',
  travelRate: DEFAULT_TRAVEL_RATE,
  travelAmount: '',
  travelNote: '',
});

// Flatten a time entry from the API into form values
function entryToForm(entry) {
  const usesHours = ['hourly', 'fixed'].includes(entry.billingType);
  const logged = usesHours ? entry.hours : entry.days;
  return {
    assignment: entry.assignment._id,
    date: entry.date.slice(0, 10),
    amountValue: logged ? String(logged) : '',
    feeAmount: entry.billingType === 'fixed' ? String(entry.amount) : '',
    description: entry.description || '',
    billable: entry.billable,
    includeTravel: entry.travelIncluded || entry.travelAmount > 0,
    travelType: entry.travelType || 'km',
    travelKm: entry.travelKm ? String(entry.travelKm) : '',
    travelRate: entry.travelRate !== undefined ? String(entry.travelRate) : DEFAULT_TRAVEL_RATE,
    travelAmount: entry.travelType === 'other' ? String(entry.travelAmount) : '',
    travelNote: entry.travelNote || '',
  };
}

// Why a time entry can no longer be edited or deleted, or null when it still can be.
// `assignmentStatus` defaults to the status on a populated assignment.
export function entryLockReason(entry, assignmentStatus = entry.assignment?.status) {
  if (entry.invoiced || assignmentStatus === 'invoiced') return 'Invoiced';
  if (entry.travelClaim) return 'On expense claim';
  return null;
}

// Entry form, used on the Time registration page (pick any assignment), on an assignment's
// detail page (`assignment` given: the form is locked to that assignment) and to edit an
// existing entry (`entry` given: the form is locked to its assignment, billing type and rate).
// An admin logging a new entry can pick the consultant it is for.
export default function TimeEntryForm({ assignments = [], assignment, entry, onSaved, onCancel }) {
  const { user } = useAuth();
  const canPickConsultant = user.role === 'admin' && !entry;
  const [consultants, setConsultants] = useState([]);
  // The entry's own billing type and rate apply, even if the assignment's have changed since
  const lockedAssignment = entry
    ? { ...entry.assignment, client: entry.client, billingType: entry.billingType, rate: entry.rateApplied }
    : assignment;
  // Old entries can have a travel amount without km; it stays as it is unless km are entered
  const legacyTravel = entry?.travelAmount > 0 && !entry.travelKm && entry.travelType !== 'other';
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0); // refreshes the remaining fixed fee after each save
  const [form, setForm] = useState(entry ? entryToForm(entry) : emptyEntry(lockedAssignment?._id, user.id));
  const [travel, setTravel] = useState(null); // distance lookup result for the selected assignment
  const [travelError, setTravelError] = useState('');
  const [travelLoading, setTravelLoading] = useState(false);
  const [feeRemaining, setFeeRemaining] = useState(null); // part of a fixed fee not yet registered

  const selectedAssignment = lockedAssignment || assignments.find((a) => a._id === form.assignment);
  const currentAssignments = assignments.filter((a) => inPeriod(a, form.date));
  const otherAssignments = assignments.filter((a) => !inPeriod(a, form.date));

  useEffect(() => {
    if (!canPickConsultant) return;
    api.get('/users').then(({ data }) => setConsultants(data.filter((u) => u.active)));
  }, [canPickConsultant]);

  // For a fixed fee, suggest billing whatever part of the fee has not been registered yet
  const fixedAssignmentId = selectedAssignment?.billingType === 'fixed' ? selectedAssignment._id : null;
  useEffect(() => {
    setFeeRemaining(null);
    if (!fixedAssignmentId) return;
    let cancelled = false;
    api.get(`/assignments/${fixedAssignmentId}`).then(({ data }) => {
      if (cancelled) return;
      // When editing, this entry's own amount is available again
      const registered = data.totals.amount - (entry?.amount || 0);
      const remaining = Math.max(0, Math.round((data.assignment.rate - registered) * 100) / 100);
      setFeeRemaining(remaining);
      setForm((f) => (f.feeAmount === '' ? { ...f, feeAmount: String(remaining) } : f));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedAssignmentId, savedCount]);

  // Look up the distance from the consultant's home to the client once travel costs are requested
  // (from the entry's or the selected consultant, and never over the km already saved on an entry)
  const clientId = selectedAssignment?.client?._id;
  useEffect(() => {
    if (!form.includeTravel || form.travelType !== 'km' || !clientId || legacyTravel) return;
    if (entry && form.travelKm !== '') return;
    let cancelled = false;
    setTravel(null);
    setTravelError('');
    setTravelLoading(true);
    api
      .get('/distance', { params: { client: clientId, consultant: entry?.consultant?._id || form.consultant || undefined } })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.includeTravel, form.travelType, form.consultant, clientId]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedAssignment) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        assignment: selectedAssignment._id,
        date: form.date,
        description: form.description,
        billable: form.billable,
      };
      if (canPickConsultant) payload.consultant = form.consultant;
      // When editing, unchanged travel is left alone so its amount is not recalculated
      const saved = entry && entryToForm(entry);
      const travelChanged =
        !saved ||
        form.includeTravel !== saved.includeTravel ||
        form.travelType !== saved.travelType ||
        form.travelKm !== saved.travelKm ||
        form.travelRate !== saved.travelRate ||
        form.travelAmount !== saved.travelAmount ||
        form.travelNote !== saved.travelNote;
      if (travelChanged) {
        payload.includeTravel = form.includeTravel;
        payload.travelType = form.travelType;
        if (form.includeTravel && form.travelType === 'other') {
          payload.travelAmount = Number(form.travelAmount);
          payload.travelNote = form.travelNote;
        } else if (form.includeTravel) {
          if (form.travelKm !== '') payload.travelKm = Number(form.travelKm);
          payload.travelRate = Number(form.travelRate);
        }
      }
      if (selectedAssignment.billingType === 'hourly') payload.hours = Number(form.amountValue);
      if (['daily', 'half_day'].includes(selectedAssignment.billingType)) payload.days = Number(form.amountValue);
      // Fixed fees are billed by registering an amount; hours worked are tracked for visibility only
      if (selectedAssignment.billingType === 'fixed') {
        payload.feeAmount = Number(form.feeAmount);
        payload.hours = Number(form.amountValue) || null;
      }

      const { data: savedEntry } = entry
        ? await api.put(`/time-entries/${entry._id}`, payload)
        : await api.post('/time-entries', payload);
      if (!entry) {
        setForm(emptyEntry(selectedAssignment._id, form.consultant));
        setSavedCount((n) => n + 1);
      }

      // The whole fixed fee is now registered: offer to close the assignment
      if (
        savedEntry.assignmentFullyBilled &&
        window.confirm(
          `The full fixed fee of ${formatEUR(selectedAssignment.rate)} for "${selectedAssignment.title}" is now billed.\n\nMark this assignment as completed?`,
        )
      ) {
        await api.put(`/assignments/${selectedAssignment._id}/complete`);
      }
      onSaved?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save time entry.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {error && <div className="error-banner">{error}</div>}
      {!lockedAssignment && assignments.length === 0 ? (
        <p className="muted">
          You're not staffed on any assignment yet. Ask an admin to add you to one before logging time.
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          {canPickConsultant && (
            <div className="field">
              <label>Consultant</label>
              <select
                required
                value={form.consultant}
                onChange={(e) => setForm({ ...form, consultant: e.target.value })}
              >
                {consultants.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              {selectedAssignment?.consultants && !selectedAssignment.consultants.some((c) => c._id === form.consultant) && (
                <div className="muted" style={{ fontSize: 12 }}>
                  This consultant is not staffed on this assignment.
                </div>
              )}
            </div>
          )}

          <div className="field-row">
            <div className="field">
              <label>Date</label>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Assignment</label>
              {lockedAssignment ? (
                <input
                  disabled
                  value={`${lockedAssignment.title} (${billingTypeLabel(lockedAssignment.billingType)})`}
                />
              ) : (
                <select
                  required
                  value={form.assignment}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      assignment: e.target.value,
                      amountValue: '',
                      feeAmount: '',
                      travelKm: '',
                    })
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
              )}
              {selectedAssignment && !inPeriod(selectedAssignment, form.date) && (
                <div className="muted" style={{ fontSize: 12 }}>
                  This date is outside the assignment period ({periodLabel(selectedAssignment)}).
                </div>
              )}
            </div>
          </div>

          {selectedAssignment && (
            <div className="field-row">
              <div className="field">
                <label>
                  {selectedAssignment.billingType === 'hourly'
                    ? 'Hours worked'
                    : selectedAssignment.billingType === 'daily'
                      ? 'Days worked (steps of 0.05, e.g. 0.25 = a quarter of a day)'
                      : selectedAssignment.billingType === 'half_day'
                        ? 'Days worked (0.5 = one half day)'
                        : 'Hours worked (optional, for tracking)'}
                </label>
                <input
                  type="number"
                  min="0"
                  step={selectedAssignment.billingType === 'half_day' ? '0.5' : '0.05'}
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
            <div className="field">
              <label>Type of travel costs</label>
              <div style={{ display: 'flex', gap: 18 }}>
                <label className="checkbox-row" style={{ margin: 0 }}>
                  <input
                    type="radio"
                    name="travelType"
                    checked={form.travelType === 'km'}
                    onChange={() => setForm({ ...form, travelType: 'km' })}
                  />
                  Km
                </label>
                <label className="checkbox-row" style={{ margin: 0 }}>
                  <input
                    type="radio"
                    name="travelType"
                    checked={form.travelType === 'other'}
                    onChange={() => setForm({ ...form, travelType: 'other' })}
                  />
                  Other amount (e.g. train ticket)
                </label>
              </div>
            </div>
          )}

          {selectedAssignment && form.includeTravel && form.travelType === 'other' && (
            <div className="field-row">
              <div className="field">
                <label>Description (shown on the invoice)</label>
                <input
                  required
                  placeholder="e.g. Train ticket Gent - Aalst"
                  value={form.travelNote}
                  onChange={(e) => setForm({ ...form, travelNote: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Amount (€)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={form.travelAmount}
                  onChange={(e) => setForm({ ...form, travelAmount: e.target.value })}
                />
              </div>
            </div>
          )}

          {selectedAssignment && form.includeTravel && form.travelType === 'km' && (
            <div className="field-row">
              <div className="field">
                <label>Distance, round trip (km)</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  required={!legacyTravel}
                  placeholder={travelLoading ? 'Calculating…' : ''}
                  value={form.travelKm}
                  onChange={(e) => setForm({ ...form, travelKm: e.target.value })}
                />
                {travelLoading && (
                  <div className="muted" style={{ fontSize: 12 }}>
                    Calculating distance…
                  </div>
                )}
                {travel && (
                  <div className="muted" style={{ fontSize: 12 }}>
                    {travel.oneWayKm} km each way from {travel.from} to {travel.to}, rounded up to a multiple of 5 km.
                    Adjust if you drove further.
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
                      ? formatEUR(Math.round(Number(form.travelKm) * Number(form.travelRate)))
                      : legacyTravel
                        ? formatEUR(entry.travelAmount)
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
            {saving ? 'Saving…' : entry ? 'Save changes' : 'Log time'}
          </button>
          {onCancel && (
            <button className="btn" type="button" style={{ marginLeft: 8 }} onClick={onCancel}>
              Cancel
            </button>
          )}
        </form>
      )}
    </>
  );
}
