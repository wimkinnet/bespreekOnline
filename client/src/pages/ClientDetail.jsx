import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { formatDate, billingTypeLabel, statusLabel } from '../utils/format';

const emptyAssignment = {
  title: '',
  description: '',
  billingType: 'hourly',
  rate: '',
  status: 'active',
  startDate: '',
  endDate: '',
};

export default function ClientDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [client, setClient] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [groupAssignments, setGroupAssignments] = useState([]);
  const [schools, setSchools] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupError, setGroupError] = useState('');
  const [documents, setDocuments] = useState([]);
  const [tab, setTab] = useState('assignments');
  const [loading, setLoading] = useState(true);

  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState(emptyAssignment);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [assignmentError, setAssignmentError] = useState('');

  const [uploadFile, setUploadFile] = useState(null);
  const [uploadCategory, setUploadCategory] = useState('document');
  const [uploadAssignment, setUploadAssignment] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await api.get(`/clients/${id}`);
    setClient(data.client);
    setAssignments(data.assignments);
    setGroupAssignments(data.groupAssignments);
    setSchools(data.schools);
    const docsRes = await api.get('/documents', { params: { client: id } });
    setDocuments(docsRes.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (user.role !== 'admin') return;
    api.get('/clients', { params: { type: 'school_pool' } }).then(({ data }) => setGroups(data));
  }, [user.role]);

  async function handleChangeGroup(parentPool) {
    setGroupError('');
    try {
      await api.put(`/clients/${id}`, { parentPool: parentPool || null });
      load();
    } catch (err) {
      setGroupError(err.response?.data?.message || 'Could not change school group.');
    }
  }

  async function handleCreateAssignment(e) {
    e.preventDefault();
    setSavingAssignment(true);
    setAssignmentError('');
    try {
      await api.post('/assignments', {
        client: id,
        title: assignmentForm.title,
        description: assignmentForm.description,
        billingType: assignmentForm.billingType,
        rate: Number(assignmentForm.rate),
        status: assignmentForm.status,
        startDate: assignmentForm.startDate || undefined,
        endDate: assignmentForm.endDate || undefined,
      });
      setShowAssignmentForm(false);
      setAssignmentForm(emptyAssignment);
      load();
    } catch (err) {
      setAssignmentError(err.response?.data?.message || 'Could not create assignment.');
    } finally {
      setSavingAssignment(false);
    }
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('client', id);
      formData.append('category', uploadCategory);
      if (uploadAssignment) formData.append('assignment', uploadAssignment);
      await api.post('/documents', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setUploadFile(null);
      setUploadAssignment('');
      e.target.reset();
      load();
    } catch (err) {
      setUploadError(err.response?.data?.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(doc) {
    const res = await api.get(`/documents/${doc._id}/download`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', doc.originalName);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function handleDeleteDocument(docId) {
    if (!window.confirm('Delete this file? This cannot be undone.')) return;
    await api.delete(`/documents/${docId}`);
    load();
  }

  if (loading || !client) return <p className="muted">Loading…</p>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{client.name}</h1>
          <p>
            {client.type === 'school_pool' ? 'School group' : 'School'}
            {client.parentPool && (
              <>
                {' · part of '}
                <Link to={`/clients/${client.parentPool._id}`}>{client.parentPool.name}</Link>
              </>
            )}
            {client.address?.city ? ` · ${client.address.city}` : ''}
          </p>
        </div>
        <span className={`badge status-${client.status}`}>{client.status}</span>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="field-row">
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              CONTACT
            </div>
            <p style={{ marginBottom: 2 }}>{client.contactName || '—'}</p>
            <p style={{ marginBottom: 2 }}>{client.contactEmail || '—'}</p>
            <p style={{ marginBottom: 0 }}>{client.contactPhone || '—'}</p>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              ADDRESS
            </div>
            <p style={{ marginBottom: 2 }}>{client.address?.street || '—'}</p>
            <p style={{ marginBottom: 2 }}>
              {client.address?.postalCode} {client.address?.city}
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              VAT: {client.vatNumber || '—'}
            </p>
          </div>
        </div>
        {client.type === 'school' && user.role === 'admin' && (
          <>
            <div className="muted" style={{ fontSize: 12, margin: '14px 0 4px' }}>
              SCHOOL GROUP
            </div>
            {groupError && <div className="error-banner">{groupError}</div>}
            <select value={client.parentPool?._id || ''} onChange={(e) => handleChangeGroup(e.target.value)}>
              <option value="">Independent school</option>
              {groups.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name}
                </option>
              ))}
            </select>
          </>
        )}
        {client.notes && (
          <>
            <div className="muted" style={{ fontSize: 12, margin: '14px 0 4px' }}>
              NOTES
            </div>
            <p style={{ marginBottom: 0 }}>{client.notes}</p>
          </>
        )}
      </div>

      <div className="tabs">
        <div className={`tab ${tab === 'assignments' ? 'active' : ''}`} onClick={() => setTab('assignments')}>
          Assignments ({assignments.length})
        </div>
        <div className={`tab ${tab === 'documents' ? 'active' : ''}`} onClick={() => setTab('documents')}>
          Documents & bills ({documents.length})
        </div>
        {client.type === 'school_pool' && (
          <div className={`tab ${tab === 'schools' ? 'active' : ''}`} onClick={() => setTab('schools')}>
            Schools ({schools.length})
          </div>
        )}
      </div>

      {tab === 'schools' && (
        <div className="table-wrap">
          {schools.length === 0 ? (
            <div className="empty-state">No schools linked to this group yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>City</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {schools.map((s) => (
                  <tr key={s._id} className="clickable" onClick={() => navigate(`/clients/${s._id}`)}>
                    <td>
                      <strong>{s.name}</strong>
                    </td>
                    <td>{s.address?.city || '—'}</td>
                    <td>
                      <span className={`badge status-${s.status}`}>{s.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'assignments' && (
        <div>
          {user.role === 'admin' && (
            <div style={{ marginBottom: 14, textAlign: 'right' }}>
              <button className="btn btn-primary" onClick={() => setShowAssignmentForm(true)}>
                + New assignment
              </button>
            </div>
          )}
          <div className="table-wrap">
            {assignments.length === 0 ? (
              <div className="empty-state">No assignments yet for this client.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Billing</th>
                    <th>Rate</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => (
                    <tr key={a._id} className="clickable" onClick={() => navigate(`/assignments/${a._id}`)}>
                      <td>
                        <strong>{a.title}</strong>
                      </td>
                      <td>{billingTypeLabel(a.billingType)}</td>
                      <td>
                        €{a.rate}
                        {a.billingType !== 'fixed' ? ` / ${a.billingType === 'hourly' ? 'h' : 'day'}` : ''}
                      </td>
                      <td>
                        <span className={`badge status-${a.status}`}>{statusLabel(a.status)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {groupAssignments.length > 0 && (
            <>
              <h3 style={{ marginTop: 20 }}>Via school group {client.parentPool.name}</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Billing</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupAssignments.map((a) => (
                      <tr key={a._id} className="clickable" onClick={() => navigate(`/assignments/${a._id}`)}>
                        <td>
                          <strong>{a.title}</strong>
                        </td>
                        <td>{billingTypeLabel(a.billingType)}</td>
                        <td>
                          <span className={`badge status-${a.status}`}>{statusLabel(a.status)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'documents' && (
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <h3>Upload a file</h3>
            {uploadError && <div className="error-banner">{uploadError}</div>}
            <form onSubmit={handleUpload} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
                <label>File</label>
                <input type="file" onChange={(e) => setUploadFile(e.target.files[0])} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Category</label>
                <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)}>
                  <option value="document">Document</option>
                  <option value="bill">Bill / invoice</option>
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Assignment (optional)</label>
                <select value={uploadAssignment} onChange={(e) => setUploadAssignment(e.target.value)}>
                  <option value="">General / not linked</option>
                  {assignments.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.title}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn btn-primary" type="submit" disabled={uploading || !uploadFile}>
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </form>
          </div>

          <div className="table-wrap">
            {documents.length === 0 ? (
              <div className="empty-state">No files uploaded yet.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Category</th>
                    <th>Uploaded</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((d) => (
                    <tr key={d._id}>
                      <td>{d.originalName}</td>
                      <td>
                        <span className="badge">{d.category === 'bill' ? 'Bill' : 'Document'}</span>
                      </td>
                      <td>
                        {formatDate(d.createdAt)} · {d.uploadedBy?.name}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-sm" onClick={() => handleDownload(d)}>
                          Download
                        </button>{' '}
                        <button className="btn btn-sm btn-danger" onClick={() => handleDeleteDocument(d._id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {showAssignmentForm && (
        <div className="modal-backdrop" onClick={() => setShowAssignmentForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New assignment</h2>
              <button className="btn btn-sm" onClick={() => setShowAssignmentForm(false)}>
                Close
              </button>
            </div>
            {assignmentError && <div className="error-banner">{assignmentError}</div>}
            <form onSubmit={handleCreateAssignment}>
              <div className="field">
                <label>Title</label>
                <input
                  required
                  value={assignmentForm.title}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, title: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Description</label>
                <textarea
                  rows={2}
                  value={assignmentForm.description}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, description: e.target.value })}
                />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Billing type</label>
                  <select
                    value={assignmentForm.billingType}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, billingType: e.target.value })}
                  >
                    <option value="hourly">Per hour</option>
                    <option value="daily">Per day</option>
                    <option value="fixed">Fixed fee</option>
                  </select>
                </div>
                <div className="field">
                  <label>
                    Rate (€
                    {assignmentForm.billingType === 'fixed'
                      ? ' total'
                      : assignmentForm.billingType === 'daily'
                      ? ' / day'
                      : ' / hour'}
                    )
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={assignmentForm.rate}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, rate: e.target.value })}
                  />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Start date</label>
                  <input
                    type="date"
                    value={assignmentForm.startDate}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, startDate: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>End date</label>
                  <input
                    type="date"
                    value={assignmentForm.endDate}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, endDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="field">
                <label>Status</label>
                <select
                  value={assignmentForm.status}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, status: e.target.value })}
                >
                  <option value="prospect">Prospect</option>
                  <option value="active">Active</option>
                  <option value="on_hold">On hold</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <button className="btn btn-primary" type="submit" disabled={savingAssignment}>
                {savingAssignment ? 'Saving…' : 'Create assignment'}
              </button>
            </form>
          </div>
        </div>
      )}

      <p style={{ marginTop: 20 }}>
        <Link to="/clients">&larr; Back to clients</Link>
      </p>
    </div>
  );
}
