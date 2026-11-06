import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { formatEUR, formatDate } from '../utils/format';

const HOURS_PER_DAY = 8;
const MONTHS_SHOWN = 6;
const FOLLOW_UP_DAYS = 14; // a sent proposal without an answer after two weeks deserves a reminder

const monthKey = (date) => String(date).slice(0, 7); // dates arrive as midnight UTC, so the ISO month is the calendar month
const formatDays = (days) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(days);
const loggedDays = (entries) => entries.reduce((s, e) => s + (e.days || 0) + (e.hours || 0) / HOURS_PER_DAY, 0);
const billableValue = (entries) =>
  entries.filter((e) => e.billable !== false).reduce((s, e) => s + (e.amount || 0) + (e.travelAmount || 0), 0);

function lastMonths(count) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(d),
      long: new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(d),
    };
  });
}

// Rounded axis steps that cover the highest value
function axisTicks(max) {
  if (max <= 0) return [0];
  const rough = max / 3;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough);
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

const compactEUR = (n) =>
  n >= 1000 ? `€${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(n / 1000)}K` : `€${n}`;

function MonthlyChart({ months }) {
  const [active, setActive] = useState(null);
  const ticks = axisTicks(Math.max(...months.map((m) => m.value)));
  const top = ticks[ticks.length - 1] || 1;
  const shown = active ?? months.length - 1;

  return (
    <div className="card dash-chart">
      <div className="dash-card-head">
        <h2>Billable per month</h2>
        <span className="muted">excl. VAT, incl. travel</span>
      </div>
      <div className="dash-chart-readout">
        <strong>{formatEUR(months[shown].value)}</strong>
        <span className="muted">
          {months[shown].long}
          {shown === months.length - 1 && ' so far'}
        </span>
      </div>
      <div className="dash-chart-plot" onMouseLeave={() => setActive(null)}>
        <div className="dash-chart-grid" aria-hidden="true">
          {[...ticks].reverse().map((t) => (
            <div key={t} className="dash-chart-tick">
              <span>{compactEUR(t)}</span>
            </div>
          ))}
        </div>
        <div className="dash-chart-columns" role="list">
          {months.map((m, i) => (
            <button
              type="button"
              role="listitem"
              key={m.key}
              className={'dash-chart-slot' + (i === shown ? ' active' : '')}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${m.long}: ${formatEUR(m.value)}`}
            >
              <span className="dash-chart-bar" style={{ height: `${(m.value / top) * 100}%` }} />
            </button>
          ))}
        </div>
      </div>
      <div className="dash-chart-labels" aria-hidden="true">
        {months.map((m) => (
          <span key={m.key}>{m.label}</span>
        ))}
      </div>
      <details className="dash-chart-table">
        <summary>Show as table</summary>
        <table>
          <tbody>
            {months.map((m) => (
              <tr key={m.key}>
                <td>{m.long}</td>
                <td>{formatEUR(m.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function Stat({ label, value, note, to }) {
  const body = (
    <>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {note && <div className="dash-stat-note">{note}</div>}
    </>
  );
  return to ? (
    <Link to={to} className="stat dash-stat-link">
      {body}
    </Link>
  ) : (
    <div className="stat">{body}</div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const [data, setData] = useState(null);

  useEffect(() => {
    const requests = [
      api.get('/time-entries'),
      api.get('/assignments', { params: isAdmin ? { status: 'active' } : { status: 'active', mine: 'true' } }),
    ];
    if (isAdmin) requests.push(api.get('/invoices/open'), api.get('/invoices/created'), api.get('/proposals'));
    Promise.all(requests).then(([entries, assignments, open, created, proposals]) =>
      setData({
        entries: entries.data,
        assignments: assignments.data,
        open: open?.data || [],
        created: created?.data || [],
        proposals: proposals?.data || [],
      })
    );
  }, [isAdmin]);

  if (!data) return <p className="muted">Loading…</p>;
  const { entries, assignments, open, created, proposals } = data;

  const months = lastMonths(MONTHS_SHOWN).map((m) => ({
    ...m,
    value: billableValue(entries.filter((e) => monthKey(e.date) === m.key)),
  }));
  const thisMonth = entries.filter((e) => monthKey(e.date) === months[months.length - 1].key);
  const lastMonth = months[months.length - 2];
  const nonBillableDays = loggedDays(thisMonth.filter((e) => e.billable === false));

  const today = new Intl.DateTimeFormat('en-CA').format(new Date());
  const unpaid = created.filter((i) => !i.paidAt);
  const overdue = unpaid.filter((i) => today > String(i.dueDate).slice(0, 10));
  const sum = (list, field) => list.reduce((s, i) => s + i[field], 0);

  // Proposals sent but not yet accepted or declined, the longest waiting first
  const daysSince = (date) => Math.max(0, Math.floor((Date.now() - new Date(date)) / 86400000));
  const awaiting = proposals
    .filter((p) => p.status === 'sent')
    .map((p) => ({ ...p, waitingDays: daysSince(p.sentAt || p.date) }))
    .sort((a, b) => b.waitingDays - a.waitingDays);
  const drafts = proposals.filter((p) => p.status === 'draft').length;
  const awaitingValue = awaiting.reduce((s, p) => s + p.budget.amount, 0);

  const byConsultant = Object.values(
    thisMonth.reduce((acc, e) => {
      const id = e.consultant?._id || 'unknown';
      (acc[id] ||= { name: e.consultant?.name || '—', entries: [] }).entries.push(e);
      return acc;
    }, {})
  ).sort((a, b) => billableValue(b.entries) - billableValue(a.entries));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Welcome back, {user?.name?.split(' ')[0]}</h1>
          <p>{new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p>
        </div>
        <Link to="/time" className="btn btn-primary">
          + Log time
        </Link>
      </div>

      <div className="stat-grid">
        {isAdmin && (
          <>
            <Stat
              label="To invoice"
              value={formatEUR(sum(open, 'totalExclVat'))}
              note={open.length ? `${open.length} client${open.length === 1 ? '' : 's'}, excl. VAT` : 'Nothing waiting'}
              to="/invoices"
            />
            <Stat
              label="Unpaid invoices"
              value={formatEUR(sum(unpaid, 'totalInclVat'))}
              note={
                overdue.length
                  ? `${formatEUR(sum(overdue, 'totalInclVat'))} overdue`
                  : `${unpaid.length} invoice${unpaid.length === 1 ? '' : 's'}, none overdue`
              }
              to="/invoices"
            />
            <Stat
              label="Proposals awaiting answer"
              value={formatEUR(awaitingValue)}
              note={
                awaiting.length
                  ? `${awaiting.length} sent, longest ${awaiting[0].waitingDays} day${awaiting[0].waitingDays === 1 ? '' : 's'}` +
                    (drafts ? ` · ${drafts} draft${drafts === 1 ? '' : 's'}` : '')
                  : `None waiting${drafts ? ` · ${drafts} draft${drafts === 1 ? '' : 's'}` : ''}`
              }
              to="/proposals"
            />
          </>
        )}
        <Stat
          label={isAdmin ? 'Billable this month' : 'My billable this month'}
          value={formatEUR(months[months.length - 1].value)}
          note={`${lastMonth.long.split(' ')[0]}: ${formatEUR(lastMonth.value)}`}
        />
        <Stat
          label={isAdmin ? 'Days logged this month' : 'My days this month'}
          value={formatDays(loggedDays(thisMonth))}
          note={nonBillableDays ? `${formatDays(nonBillableDays)} non-billable` : `${assignments.length} active assignments`}
        />
      </div>

      <div className="dash-grid">
        <MonthlyChart months={months} />

        {isAdmin ? (
          <div className="card dash-list">
            <div className="dash-card-head">
              <h2>Needs attention</h2>
            </div>
            {awaiting.length === 0 && overdue.length === 0 && open.length === 0 && (
              <p className="muted">Nothing to do: no proposals waiting, all time invoiced and paid on time.</p>
            )}
            {awaiting.map((p) => (
              <Link key={p._id} to="/proposals" className="dash-item">
                <span className={`badge ${p.waitingDays >= FOLLOW_UP_DAYS ? 'proposal-follow-up' : 'proposal-waiting'}`}>
                  {p.waitingDays >= FOLLOW_UP_DAYS ? 'Follow up' : 'Awaiting answer'}
                </span>
                <span className="dash-item-main">
                  {p.number} · {p.client?.name}
                  <span className="muted">
                    sent {p.waitingDays === 0 ? 'today' : `${p.waitingDays} day${p.waitingDays === 1 ? '' : 's'} ago`} · {p.title}
                  </span>
                </span>
                <strong>{formatEUR(p.budget.amount)}</strong>
              </Link>
            ))}
            {overdue.map((i) => (
              <Link key={i._id} to="/invoices" className="dash-item">
                <span className="badge invoice-overdue">Overdue</span>
                <span className="dash-item-main">
                  {i.invoiceNumber} · {i.client?.name}
                  <span className="muted">due {formatDate(i.dueDate)}</span>
                </span>
                <strong>{formatEUR(i.totalInclVat)}</strong>
              </Link>
            ))}
            {open.slice(0, 6).map((i) => (
              <Link key={i.client._id} to="/invoices" className="dash-item">
                <span className="badge invoice-open">To invoice</span>
                <span className="dash-item-main">
                  {i.client.name}
                  <span className="muted">
                    {i.entries} log{i.entries === 1 ? '' : 's'}
                  </span>
                </span>
                <strong>{formatEUR(i.totalExclVat)}</strong>
              </Link>
            ))}
            {open.length > 6 && (
              <Link to="/invoices" className="dash-more">
                {open.length - 6} more clients to invoice
              </Link>
            )}
          </div>
        ) : (
          <div className="card dash-list">
            <div className="dash-card-head">
              <h2>My assignments</h2>
            </div>
            {assignments.length === 0 && <p className="muted">You are not staffed on an active assignment.</p>}
            {assignments.map((a) => (
              <Link key={a._id} to={`/assignments/${a._id}`} className="dash-item">
                <span className="dash-item-main">
                  {a.title}
                  <span className="muted">{a.client?.name}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {isAdmin ? (
        <div className="card">
          <div className="dash-card-head">
            <h2>This month per consultant</h2>
          </div>
          {byConsultant.length === 0 ? (
            <p className="muted">No time logged this month yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Consultant</th>
                  <th>Days logged</th>
                  <th>Non-billable days</th>
                  <th>Billable</th>
                </tr>
              </thead>
              <tbody>
                {byConsultant.map((c) => (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td>{formatDays(loggedDays(c.entries))}</td>
                    <td>{formatDays(loggedDays(c.entries.filter((e) => e.billable === false)))}</td>
                    <td>{formatEUR(billableValue(c.entries))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="dash-card-head">
            <h2>My recent time</h2>
            <Link to="/time">All time registration</Link>
          </div>
          {entries.length === 0 ? (
            <p className="muted">No time logged yet.</p>
          ) : (
            <table>
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
                {entries.slice(0, 6).map((e) => (
                  <tr key={e._id}>
                    <td>{formatDate(e.date)}</td>
                    <td>{e.assignment?.title}</td>
                    <td>{e.client?.name}</td>
                    <td>{e.hours ? `${e.hours} h` : e.days ? `${formatDays(e.days)} d` : '—'}</td>
                    <td>{e.billable === false ? <span className="muted">Non-billable</span> : formatEUR(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
