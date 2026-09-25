import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const emptyForm = {
  name: '',
  type: 'school',
  parentPool: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  vatNumber: '',
  street: '',
  postalCode: '',
  city: '',
  status: 'active',
  notes: '',
};

export default function Clients() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await api.get('/clients', {
      params: { search: search || undefined, type: typeFilter || undefined },
    });
    setClients(data);
    setLoading(false);
  }

  useEffect(() => {
    api.get('/clients', { params: { type: 'school_pool' } }).then(({ data }) => setGroups(data));
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter]);

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/clients', {
        name: form.name,
        type: form.type,
        parentPool: form.type === 'school' ? form.parentPool || null : null,
        status: form.status,
        contactName: form.contactName,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
        vatNumber: form.vatNumber,
        notes: form.notes,
        address: { street: form.street, postalCode: form.postalCode, city: form.city },
      });
      setShowForm(false);
      setForm(emptyForm);
      load();
      if (form.type === 'school_pool') {
        api.get('/clients', { params: { type: 'school_pool' } }).then(({ data }) => setGroups(data));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create client.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Clients</h1>
          <p>Schools and school groups you advise.</p>
        </div>
        {user.role === 'admin' && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            + New client
          </button>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <input
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 6 }}
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{ padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 6 }}
        >
          <option value="">All types</option>
          <option value="school">School</option>
          <option value="school_pool">School group</option>
        </select>
      </div>

      <div className="table-wrap">
        {loading ? (
          <p className="muted" style={{ padding: 20 }}>
            Loading…
          </p>
        ) : clients.length === 0 ? (
          <div className="empty-state">No clients found. Try adjusting your search, or add one.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>School group</th>
                <th>City</th>
                <th>Contact</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c._id} className="clickable" onClick={() => navigate(`/clients/${c._id}`)}>
                  <td>
                    <strong>{c.name}</strong>
                  </td>
                  <td>{c.type === 'school_pool' ? 'School group' : 'School'}</td>
                  <td>{c.parentPool?.name || '—'}</td>
                  <td>{c.address?.city || '—'}</td>
                  <td>{c.contactName || '—'}</td>
                  <td>
                    <span className={`badge status-${c.status}`}>{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New client</h2>
              <button className="btn btn-sm" onClick={() => setShowForm(false)}>
                Close
              </button>
            </div>
            {error && <div className="error-banner">{error}</div>}
            <form onSubmit={handleCreate}>
              <div className="field">
                <label>Name</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Type</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    <option value="school">School</option>
                    <option value="school_pool">School group</option>
                  </select>
                </div>
                <div className="field">
                  <label>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="prospect">Prospect</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              {form.type === 'school' && (
                <div className="field">
                  <label>School group (optional)</label>
                  <select value={form.parentPool} onChange={(e) => setForm({ ...form, parentPool: e.target.value })}>
                    <option value="">Independent school</option>
                    {groups.map((g) => (
                      <option key={g._id} value={g._id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field-row">
                <div className="field">
                  <label>Contact name</label>
                  <input
                    value={form.contactName}
                    onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Contact email</label>
                  <input
                    type="email"
                    value={form.contactEmail}
                    onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                  />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Contact phone</label>
                  <input
                    value={form.contactPhone}
                    onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>VAT number</label>
                  <input value={form.vatNumber} onChange={(e) => setForm({ ...form, vatNumber: e.target.value })} />
                </div>
              </div>
              <div className="field">
                <label>Street & number</label>
                <input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Postal code</label>
                  <input
                    value={form.postalCode}
                    onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>City</label>
                  <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                </div>
              </div>
              <div className="field">
                <label>Notes</label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Create client'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
