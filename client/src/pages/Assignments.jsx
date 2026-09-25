import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { billingTypeLabel, statusLabel } from '../utils/format';

export default function Assignments() {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState([]);
  const [status, setStatus] = useState('active');
  const [mine, setMine] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await api.get('/assignments', {
      params: { status: status || undefined, mine: mine ? 'true' : undefined },
    });
    setAssignments(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, mine]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Assignments</h1>
          <p>All billable work across your clients.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 14, alignItems: 'center' }}>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 6 }}
        >
          <option value="">All statuses</option>
          <option value="prospect">Prospect</option>
          <option value="active">Active</option>
          <option value="on_hold">On hold</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <label className="checkbox-row">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          Only assignments I'm staffed on
        </label>
      </div>

      <div className="table-wrap">
        {loading ? (
          <p className="muted" style={{ padding: 20 }}>
            Loading…
          </p>
        ) : assignments.length === 0 ? (
          <div className="empty-state">No assignments match these filters.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Client</th>
                <th>Billing</th>
                <th>Rate</th>
                <th>Consultants</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a._id} className="clickable" onClick={() => navigate(`/assignments/${a._id}`)}>
                  <td>
                    <strong>{a.title}</strong>
                  </td>
                  <td>
                    {a.client?.name}
                    {a.client?.type === 'school_pool' && <span className="muted"> (school group)</span>}
                  </td>
                  <td>{billingTypeLabel(a.billingType)}</td>
                  <td>
                    €{a.rate}
                    {a.billingType !== 'fixed' ? ` / ${a.billingType === 'hourly' ? 'h' : 'day'}` : ''}
                  </td>
                  <td>{a.consultants?.map((c) => c.name).join(', ') || '—'}</td>
                  <td>
                    <span className={`badge status-${a.status}`}>{statusLabel(a.status)}</span>
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
