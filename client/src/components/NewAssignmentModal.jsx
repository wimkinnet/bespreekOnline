import { useEffect, useState } from 'react';
import api from '../api/axios';
import { rateUnitLabel } from '../utils/format';

const emptyAssignment = {
  title: '',
  description: '',
  billingType: 'hourly',
  rate: '',
  status: 'active',
  startDate: '',
  endDate: '',
  consultants: [],
};

// Creates an assignment for `client`; `onCreated` gets the new assignment.
export default function NewAssignmentModal({ client, onClose, onCreated }) {
  const [form, setForm] = useState(emptyAssignment);
  const [consultants, setConsultants] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/users').then(({ data }) => setConsultants(data.filter((u) => u.active)));
  }, []);

  function toggleConsultant(userId) {
    setForm((f) => ({
      ...f,
      consultants: f.consultants.includes(userId)
        ? f.consultants.filter((c) => c !== userId)
        : [...f.consultants, userId],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/assignments', {
        client: client._id,
        title: form.title,
        description: form.description,
        billingType: form.billingType,
        rate: Number(form.rate),
        status: form.status,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        consultants: form.consultants,
      });
      onCreated(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create assignment.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>New assignment</h2>
            <p className="muted" style={{ margin: 0 }}>
              {client.name}
            </p>
          </div>
          <button className="btn btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Title</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Billing type</label>
              <select
                value={form.billingType}
                onChange={(e) => setForm({ ...form, billingType: e.target.value })}
              >
                <option value="hourly">Per hour</option>
                <option value="daily">Per day</option>
                <option value="half_day">Per half day</option>
                <option value="fixed">Fixed fee</option>
              </select>
            </div>
            <div className="field">
              <label>
                Rate (€
                {form.billingType === 'fixed'
                  ? ' total'
                  : ` / ${rateUnitLabel(form.billingType)}`}
                )
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Start date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div className="field">
              <label>End date</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label>Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="prospect">Prospect</option>
              <option value="active">Active</option>
              <option value="on_hold">On hold</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div className="field">
            <label>Staffed consultants</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {consultants.map((u) => (
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
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Create assignment'}
          </button>
        </form>
      </div>
    </div>
  );
}
