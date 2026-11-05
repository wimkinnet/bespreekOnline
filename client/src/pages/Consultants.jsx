import { useEffect, useState } from 'react';
import api from '../api/axios';

const emptyForm = {
  name: '',
  email: '',
  password: '',
  role: 'consultant',
  phone: '',
  street: '',
  postalCode: '',
  city: '',
};

function homeAddressPayload(form) {
  return { street: form.street, postalCode: form.postalCode, city: form.city };
}

function formatHomeAddress(address) {
  if (!address?.city && !address?.postalCode) return '—';
  return [address.street, [address.postalCode, address.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

function HomeAddressFields({ form, setForm }) {
  return (
    <>
      <div className="field">
        <label>Home address (used for travel distances)</label>
        <input
          placeholder="Street & number"
          value={form.street}
          onChange={(e) => setForm({ ...form, street: e.target.value })}
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Postal code</label>
          <input value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
        </div>
        <div className="field">
          <label>City</label>
          <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
      </div>
    </>
  );
}

export default function Consultants() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState('');

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
      const { street, postalCode, city, ...rest } = form;
      await api.post('/users', { ...rest, homeAddress: homeAddressPayload(form) });
      setShowForm(false);
      setForm(emptyForm);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create account.');
    } finally {
      setSaving(false);
    }
  }

  // The photo of the account being edited, as an object URL, or null without one
  const [photoUrl, setPhotoUrl] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  async function loadPhoto(u) {
    setPhotoUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    if (!u.hasPhoto) return;
    const res = await api.get(`/users/${u.id}/photo`, { responseType: 'blob' });
    setPhotoUrl(URL.createObjectURL(res.data));
  }

  async function changePhoto(file) {
    if (!file) return;
    setPhotoBusy(true);
    setEditError('');
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const { data } = await api.put(`/users/${editUser.id}/photo`, formData);
      setEditUser(data);
      await loadPhoto(data);
      load();
    } catch (err) {
      setEditError(err.response?.data?.message || 'Could not save the photo.');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    if (!window.confirm(`Remove the photo of ${editUser.name}?`)) return;
    const { data } = await api.delete(`/users/${editUser.id}/photo`);
    setEditUser(data);
    await loadPhoto(data);
    load();
  }

  function openEdit(u) {
    loadPhoto(u).catch(() => setPhotoUrl(null));
    setEditUser(u);
    setEditError('');
    setEditForm({
      name: u.name,
      role: u.role,
      phone: u.phone || '',
      street: u.homeAddress?.street || '',
      postalCode: u.homeAddress?.postalCode || '',
      city: u.homeAddress?.city || '',
      jobTitle: u.jobTitle || '',
      bio: u.bio || '',
    });
  }

  async function handleUpdate(e) {
    e.preventDefault();
    setSaving(true);
    setEditError('');
    try {
      await api.put(`/users/${editUser.id}`, {
        name: editForm.name,
        role: editForm.role,
        phone: editForm.phone,
        homeAddress: homeAddressPayload(editForm),
        jobTitle: editForm.jobTitle,
        bio: editForm.bio,
      });
      setEditUser(null);
      load();
    } catch (err) {
      setEditError(err.response?.data?.message || 'Could not update account.');
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
                <th>Home address</th>
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
                  <td>{formatHomeAddress(u.homeAddress)}</td>
                  <td>
                    <span className={`badge status-${u.active ? 'active' : 'inactive'}`}>
                      {u.active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-sm" onClick={() => openEdit(u)} style={{ marginRight: 6 }}>
                      Edit
                    </button>
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
              <HomeAddressFields form={form} setForm={setForm} />
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Creating…' : 'Create account'}
              </button>
            </form>
          </div>
        </div>
      )}

      {editUser && (
        <div className="modal-backdrop" onClick={() => setEditUser(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit {editUser.name}</h2>
              <button className="btn btn-sm" onClick={() => setEditUser(null)}>
                Close
              </button>
            </div>
            {editError && <div className="error-banner">{editError}</div>}
            <form onSubmit={handleUpdate}>
              <div className="field">
                <label>Name</label>
                <input
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Role</label>
                  <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                    <option value="consultant">Consultant</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="field">
                  <label>Phone</label>
                  <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                </div>
              </div>
              <HomeAddressFields form={editForm} setForm={setEditForm} />
              <div className="field">
                <label>Job title on proposals</label>
                <input
                  placeholder="Begeleider"
                  value={editForm.jobTitle}
                  onChange={(e) => setEditForm({ ...editForm, jobTitle: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Photo on proposals</label>
                <div className="consultant-photo">
                  {photoUrl ? <img src={photoUrl} alt={editUser.name} /> : <span className="muted">No photo yet</span>}
                  <div className="row-actions">
                    <label className="btn btn-sm" style={{ margin: 0 }}>
                      {photoBusy ? 'Saving…' : editUser.hasPhoto ? 'Replace photo' : 'Add photo'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png"
                        hidden
                        disabled={photoBusy}
                        onChange={(e) => changePhoto(e.target.files[0])}
                      />
                    </label>
                    {editUser.hasPhoto && (
                      <button type="button" className="btn btn-sm btn-danger" onClick={removePhoto}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="field">
                <label>Profile on proposals</label>
                <textarea rows={6} value={editForm.bio} onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })} />
              </div>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
