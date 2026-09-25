import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { formatEUR, formatDate } from '../utils/format';

export default function Dashboard() {
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [clientsRes, assignmentsRes, entriesRes] = await Promise.all([
        api.get('/clients', { params: { status: 'active' } }),
        api.get('/assignments', { params: { status: 'active' } }),
        api.get('/time-entries'),
      ]);
      setClients(clientsRes.data);
      setAssignments(assignmentsRes.data);
      setEntries(entriesRes.data.slice(0, 8));
      setLoading(false);
    }
    load();
  }, []);

  const now = new Date();
  const monthEntries = entries.filter((e) => {
    const d = new Date(e.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthHours = monthEntries.reduce((s, e) => s + (e.hours || 0), 0);
  const monthAmount = monthEntries.reduce((s, e) => s + (e.amount || 0), 0);

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Welcome back, {user?.name?.split(' ')[0]}</h1>
          <p>Here's what's happening across your active work.</p>
        </div>
        <Link to="/time" className="btn btn-primary">
          + Log time
        </Link>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="label">Active clients</div>
          <div className="value">{clients.length}</div>
        </div>
        <div className="stat">
          <div className="label">Active assignments</div>
          <div className="value">{assignments.length}</div>
        </div>
        <div className="stat">
          <div className="label">Hours this month</div>
          <div className="value">{monthHours.toFixed(1)}</div>
        </div>
        <div className="stat">
          <div className="label">Billable this month</div>
          <div className="value">{formatEUR(monthAmount)}</div>
        </div>
      </div>

      <div className="card">
        <h2>Recent time entries</h2>
        {entries.length === 0 ? (
          <p className="muted" style={{ marginTop: 8 }}>
            No time logged yet. Head to Time registration to add your first entry.
          </p>
        ) : (
          <table style={{ marginTop: 10 }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Assignment</th>
                <th>Client</th>
                <th>Logged</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e._id}>
                  <td>{formatDate(e.date)}</td>
                  <td>{e.assignment?.title}</td>
                  <td>{e.client?.name}</td>
                  <td>{e.hours ? `${e.hours} h` : e.days ? `${e.days} d` : '—'}</td>
                  <td>{formatEUR(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
