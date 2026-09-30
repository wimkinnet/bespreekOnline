import { useEffect, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { formatEUR, formatDate } from '../utils/format';
import TimeEntryForm from '../components/TimeEntryForm';

export default function TimeRegistration() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  // Refreshes in place (no loading screen) so the entry form keeps its selected assignment
  async function load() {
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
        <TimeEntryForm assignments={assignments} onSaved={load} />
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
