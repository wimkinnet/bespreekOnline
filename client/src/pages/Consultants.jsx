import { useEffect, useState } from 'react';
import api from '../api/axios';

const emptyForm = { name: '', email: '', password: '', role: 'consultant', phone: '' };

export default function Consultants() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await api.get('/users');
    setUsers(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/users', form);
      setShowForm(false);
      setForm(emptyForm);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create account.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u) {
    await api.put(`/users/${u.id}`, { active: !u.active });
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Consultants</h1>
          <p>Manage who can log in and what they can do.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + New consultant
        </button>
      </div>

      <div className="table-wrap">
        {loading ? (
          <p className="muted" style={{ padding: 20 }}>
            Loading…
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td style={{ textTransform: 'capitalize' }}>{u.role}</td>
                  <td>
                    <span className={`badge status-${u.active ? 'active' : 'inactive'}`}>
                      {u.active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-sm" onClick={() => toggleActive(u)}>
                      {u.active ? 'Deactivate' : 'Reactivate'}
                    </button>
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
              <h2>New consultant</h2>
              <button className="btn btn-sm" onClick={() => setShowForm(false)}>
                Close
              </button>
            </div>
            {error && <div className="error-banner">{error}</div>}
            <form onSubmit={handleCreate}>
              <div className="field">
                <label>Name</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field">
                <label>Email</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Temporary password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Role</label>
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    <option value="consultant">Consultant</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="field">
                  <label>Phone</label>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Creating…' : 'Create account'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
