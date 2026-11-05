import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import ClientForm, { clientToForm } from '../components/ClientForm';
import NewAssignmentModal from '../components/NewAssignmentModal';
import FilePreviewModal, { canPreview } from '../components/FilePreviewModal';
import { formatDate, billingTypeLabel, statusLabel, clientTypeLabel, rateUnitLabel } from '../utils/format';

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
  const [editing, setEditing] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [clientError, setClientError] = useState('');
  const [documents, setDocuments] = useState([]);
  const [tab, setTab] = useState('assignments');
  const [loading, setLoading] = useState(true);

  const [showAssignmentForm, setShowAssignmentForm] = useState(false);

  const [uploadFile, setUploadFile] = useState(null);
  const [uploadCategory, setUploadCategory] = useState('document');
  const [uploadAssignment, setUploadAssignment] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [preview, setPreview] = useState(null); // file shown in the preview
  const [documentError, setDocumentError] = useState('');

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

  async function handleUpdateClient(payload) {
    setSavingClient(true);
    setClientError('');
    try {
      await api.put(`/clients/${id}`, payload);
      setEditing(false);
      load();
    } catch (err) {
      setClientError(err.response?.data?.message || 'Could not update client.');
    } finally {
      setSavingClient(false);
    }
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    setUploadError('');
    try {
      const formData = new FormData();
      // The file goes last: the server picks the client's folder from the fields sent before it
      formData.append('client', id);
      formData.append('category', uploadCategory);
      if (uploadAssignment) formData.append('assignment', uploadAssignment);
      formData.append('file', uploadFile);
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

  async function handlePreview(doc) {
    setDocumentError('');
    try {
      const res = await api.get(`/documents/${doc._id}/download`, { responseType: 'blob' });
      const file = new Blob([res.data], { type: doc.mimeType });
      setPreview({ title: doc.originalName, url: URL.createObjectURL(file), fileName: doc.originalName, mimeType: doc.mimeType });
    } catch {
      setDocumentError(`Could not show ${doc.originalName}.`);
    }
  }

  function closePreview() {
    URL.revokeObjectURL(preview.url);
    setPreview(null);
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

  const billingAddress = client.billing?.address;
  const billingCity = [billingAddress?.postalCode, billingAddress?.city].filter(Boolean).join(' ');
  const billingLines = [
    client.billing?.contactName,
    client.billing?.contactEmail,
    billingAddress?.street,
    billingCity && billingAddress?.country && billingAddress.country !== 'Belgium'
      ? `${billingCity}, ${billingAddress.country}`
      : billingCity,
  ].filter(Boolean);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{client.name}</h1>
          <p>
            {clientTypeLabel(client.type)}
            {client.parentPool && (
              <>
                {' · part of '}
                <Link to={`/clients/${client.parentPool._id}`}>{client.parentPool.name}</Link>
              </>
            )}
            {client.address?.city ? ` · ${client.address.city}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`badge status-${client.status}`}>{client.status}</span>
          {user.role === 'admin' && (
            <button
              className="btn btn-sm"
              onClick={() => {
                setClientError('');
                setEditing(true);
              }}
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit client</h2>
              <button className="btn btn-sm" onClick={() => setEditing(false)}>
                Close
              </button>
            </div>
            {clientError && <div className="error-banner">{clientError}</div>}
            <ClientForm
              initial={clientToForm(client)}
              groups={groups}
              excludeId={client._id}
              onSubmit={handleUpdateClient}
              saving={savingClient}
              submitLabel="Save changes"
            />
          </div>
        </div>
      )}

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
              {client.address?.country && client.address.country !== 'Belgium' && `, ${client.address.country}`}
            </p>
            <p className="muted" style={{ marginBottom: 0 }}>
              VAT: {client.vatNumber || '—'}
              {client.vatExempt && ' · invoiced without VAT (foreign client)'}
            </p>
          </div>
        </div>
        {billingLines.length > 0 && (
          <>
            <div className="muted" style={{ fontSize: 12, margin: '14px 0 4px' }}>
              BILLING
            </div>
            {billingLines.map((line) => (
              <p key={line} style={{ marginBottom: 2 }}>
                {line}
              </p>
            ))}
          </>
        )}
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
          Documents & invoices ({documents.length})
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
                        {a.billingType !== 'fixed' ? ` / ${rateUnitLabel(a.billingType, true)}` : ''}
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
                  <option value="bill">Invoice</option>
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

          {documentError && <div className="error-banner">{documentError}</div>}
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
                        <span className="badge">{d.category === 'bill' ? 'Invoice' : 'Document'}</span>
                      </td>
                      <td>
                        {formatDate(d.createdAt)} · {d.uploadedBy?.name}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="row-actions">
                          {canPreview(d.mimeType) && (
                            <button className="btn btn-sm" onClick={() => handlePreview(d)}>
                              Preview
                            </button>
                          )}
                          <button className="btn btn-sm" onClick={() => handleDownload(d)}>
                            Download
                          </button>
                          {!d.invoiceNumber && (
                            <button className="btn btn-sm btn-danger" onClick={() => handleDeleteDocument(d._id)}>
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {preview && <FilePreviewModal {...preview} onClose={closePreview} />}

      {showAssignmentForm && (
        <NewAssignmentModal
          client={client}
          onClose={() => setShowAssignmentForm(false)}
          onCreated={() => {
            setShowAssignmentForm(false);
            load();
          }}
        />
      )}

      <p style={{ marginTop: 20 }}>
        <Link to="/clients">&larr; Back to clients</Link>
      </p>
    </div>
  );
}
