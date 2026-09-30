import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { formatEUR, formatDate, statusLabel } from '../utils/format';

// One colour per assignment; logs take the colour of their assignment
const PALETTE = [
  '#3f6659', '#c0612b', '#3b6fb6', '#a9832f', '#8e4a8f', '#c23b5a',
  '#2f9a9a', '#6b8e23', '#7a5c3e', '#5a5fd6', '#d08a1e', '#6d7a72',
];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Statuses during which an assignment is not actually running
const NOT_RUNNING = ['prospect', 'cancelled'];
const MAX_STRIPES = 4;
const MAX_DOTS = 5;

function pad(n) {
  return String(n).padStart(2, '0');
}
// yyyy-mm-dd of a local calendar day
function dayKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// yyyy-mm-dd of a date sent by the API (stored as midnight UTC)
function isoKey(value) {
  return value ? String(value).slice(0, 10) : null;
}
function keyLabel(key) {
  return formatDate(`${key}T12:00:00`);
}

// Six weeks, Monday first, covering the given month
function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

// Greedy interval colouring: assignments that overlap in time never share a colour (as long as the
// palette allows). Among the free colours the least used one is picked, so colours vary over time.
function assignColours(periods) {
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  const colours = {};
  const used = PALETTE.map(() => 0);
  const placed = [];
  for (const p of sorted) {
    const taken = new Set(placed.filter((q) => q.start <= p.end && p.start <= q.end).map((q) => colours[q.id]));
    const free = PALETTE.map((_, i) => i).filter((i) => !taken.has(i));
    const candidates = free.length ? free : PALETTE.map((_, i) => i);
    const index = candidates.reduce((best, i) => (used[i] < used[best] ? i : best));
    colours[p.id] = index;
    used[index]++;
    placed.push(p);
  }
  return Object.fromEntries(Object.entries(colours).map(([id, i]) => [id, PALETTE[i]]));
}

function describeTime(e) {
  if (e.hours) return `${e.hours} h`;
  if (e.days) return `${e.days} day${e.days === 1 ? '' : 's'}`;
  return '';
}

export default function Calendar() {
  const { user } = useAuth();
  const today = dayKey(new Date());
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selected, setSelected] = useState(today);
  const [assignments, setAssignments] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = user.role === 'admin' ? {} : { mine: 'true' };
    Promise.all([api.get('/assignments', { params }), api.get('/time-entries')]).then(([a, t]) => {
      setAssignments(a.data);
      setEntries(t.data);
      setLoading(false);
    });
  }, [user.role]);

  const { logsByDay, periods, colours, assignmentById } = useMemo(() => {
    const logsByDay = {};
    const logSpan = {}; // first and last log per assignment
    for (const e of entries) {
      const key = isoKey(e.date);
      (logsByDay[key] ||= []).push(e);
      const id = e.assignment?._id;
      if (!id) continue;
      const span = (logSpan[id] ||= { start: key, end: key });
      if (key < span.start) span.start = key;
      if (key > span.end) span.end = key;
    }

    // Running period of each assignment. Without an end date, an ongoing assignment runs until
    // today and a finished one until its last log.
    const periods = [];
    for (const a of assignments) {
      const start = isoKey(a.startDate);
      if (!start || NOT_RUNNING.includes(a.status)) continue;
      let end = isoKey(a.endDate);
      if (!end) {
        end = ['active', 'on_hold'].includes(a.status) ? (today > start ? today : start) : logSpan[a._id]?.end || start;
      }
      if (end < start) end = start;
      periods.push({ id: a._id, start, end, assignment: a });
    }

    // Colour every assignment that shows up, by running period or else by the span of its logs
    const colourPeriods = [...periods];
    for (const [id, span] of Object.entries(logSpan)) {
      if (!periods.some((p) => p.id === id)) colourPeriods.push({ id, ...span });
    }
    const assignmentById = Object.fromEntries(assignments.map((a) => [a._id, a]));
    return { logsByDay, periods, colours: assignColours(colourPeriods), assignmentById };
  }, [assignments, entries, today]);

  const days = monthGrid(month.year, month.month);
  const runningOn = (key) => periods.filter((p) => p.start <= key && key <= p.end);

  function shiftMonth(delta) {
    setMonth(({ year, month: m }) => {
      const d = new Date(year, m + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }
  function goToday() {
    const d = new Date();
    setMonth({ year: d.getFullYear(), month: d.getMonth() });
    setSelected(today);
  }
  function selectDay(d) {
    setSelected(dayKey(d));
    if (d.getMonth() !== month.month) setMonth({ year: d.getFullYear(), month: d.getMonth() });
  }

  // Legend: every assignment with a log or a running day in the visible month
  const monthStart = dayKey(new Date(month.year, month.month, 1));
  const monthEnd = dayKey(new Date(month.year, month.month + 1, 0));
  const legend = new Map();
  for (const p of periods) {
    if (p.start <= monthEnd && monthStart <= p.end) legend.set(p.id, p.assignment.title);
  }
  for (const [key, logs] of Object.entries(logsByDay)) {
    if (key < monthStart || key > monthEnd) continue;
    for (const e of logs) if (e.assignment) legend.set(e.assignment._id, e.assignment.title);
  }

  const dayLogs = logsByDay[selected] || [];
  const dayRunning = runningOn(selected);
  const dayHours = dayLogs.reduce((s, e) => s + (e.hours || 0), 0);
  const dayDays = dayLogs.reduce((s, e) => s + (e.days || 0), 0);
  const monthTitle = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(
    new Date(month.year, month.month, 1)
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Calendar</h1>
          <p>Days with logged time and the periods during which assignments run.</p>
        </div>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="calendar-layout">
          <div className="card calendar-card">
            <div className="calendar-toolbar">
              <button className="btn btn-sm" onClick={() => shiftMonth(-1)} aria-label="Previous month">
                ‹
              </button>
              <h2>{monthTitle}</h2>
              <button className="btn btn-sm" onClick={() => shiftMonth(1)} aria-label="Next month">
                ›
              </button>
              <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={goToday}>
                Today
              </button>
            </div>

            <div className="calendar-grid">
              {WEEKDAYS.map((w) => (
                <div key={w} className="calendar-weekday">
                  {w}
                </div>
              ))}
              {days.map((d) => {
                const key = dayKey(d);
                const logs = logsByDay[key] || [];
                const running = runningOn(key);
                const classes = ['calendar-day'];
                if (d.getMonth() !== month.month) classes.push('outside');
                if (key === today) classes.push('today');
                if (key === selected) classes.push('selected');
                return (
                  <button key={key} className={classes.join(' ')} onClick={() => selectDay(d)}>
                    <span className="calendar-date">{d.getDate()}</span>
                    {logs.length > 0 && (
                      <span className="calendar-dots">
                        {logs.slice(0, MAX_DOTS).map((e) => (
                          <span key={e._id} className="calendar-dot" style={{ background: colours[e.assignment?._id] }} />
                        ))}
                        {logs.length > MAX_DOTS && <span className="calendar-more">+{logs.length - MAX_DOTS}</span>}
                      </span>
                    )}
                    <span className="calendar-stripes">
                      {running.slice(0, MAX_STRIPES).map((p) => (
                        <span key={p.id} className="calendar-stripe" style={{ background: colours[p.id] }} />
                      ))}
                      {running.length > MAX_STRIPES && (
                        <span className="calendar-more">+{running.length - MAX_STRIPES}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="calendar-key muted">
              <span>
                <span className="calendar-dot" /> time log
              </span>
              <span>
                <span className="calendar-stripe" style={{ width: 18 }} /> assignment running
              </span>
            </div>
            {legend.size > 0 && (
              <div className="calendar-legend">
                {[...legend].map(([id, title]) => (
                  <span key={id}>
                    <span className="calendar-swatch" style={{ background: colours[id] }} />
                    {title}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="card calendar-details">
            <h2>{keyLabel(selected)}</h2>
            {dayLogs.length === 0 && dayRunning.length === 0 && (
              <p className="muted">Nothing logged and no assignments running on this day.</p>
            )}

            {dayLogs.length > 0 && (
              <>
                <h3>
                  Time logged
                  <span className="muted">
                    {[dayHours && `${dayHours} h`, dayDays && `${dayDays} day${dayDays === 1 ? '' : 's'}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </h3>
                {dayLogs.map((e) => (
                  <div key={e._id} className="calendar-item" style={{ borderLeftColor: colours[e.assignment?._id] }}>
                    <div className="calendar-item-title">
                      {e.assignment ? <Link to={`/assignments/${e.assignment._id}`}>{e.assignment.title}</Link> : '—'}
                    </div>
                    <div className="muted">
                      {e.client?.name}
                      {user.role === 'admin' && e.consultant && ` · ${e.consultant.name}`}
                    </div>
                    <div>
                      {[describeTime(e), formatEUR(e.amount)].filter(Boolean).join(' · ')}
                      {e.travelIncluded && ` · travel ${formatEUR(e.travelAmount)} (${e.travelKm} km)`}
                      {e.invoiced && <span className="badge status-invoiced" style={{ marginLeft: 6 }}>Invoiced</span>}
                    </div>
                    {e.description && <div className="muted">{e.description}</div>}
                  </div>
                ))}
              </>
            )}

            {dayRunning.length > 0 && (
              <>
                <h3>Assignments running</h3>
                {dayRunning.map(({ id, start, end }) => {
                  const a = assignmentById[id];
                  return (
                    <div key={id} className="calendar-item" style={{ borderLeftColor: colours[id] }}>
                      <div className="calendar-item-title">
                        <Link to={`/assignments/${id}`}>{a.title}</Link>
                        <span className={`badge status-${a.status}`} style={{ marginLeft: 6 }}>
                          {statusLabel(a.status)}
                        </span>
                      </div>
                      <div className="muted">{a.client?.name}</div>
                      <div>
                        {keyLabel(start)} – {a.endDate ? keyLabel(end) : 'no end date'}
                      </div>
                      {a.consultants?.length > 0 && (
                        <div className="muted">{a.consultants.map((c) => c.name).join(', ')}</div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
