import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { formatEUR, formatDate } from '../utils/format';
import FilePreviewModal from '../components/FilePreviewModal';

const STATUS_LABELS = { draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined' };
const STATUS_BADGES = { draft: 'invoice-open', sent: 'status-on_hold', accepted: 'invoice-paid', declined: 'status-cancelled' };
const DAY_OPTIONS = Array.from({ length: 40 }, (_, i) => (i + 1) / 4); // 0.25 to 10 days
const INVOICING_OPTIONS = [
  ['monthly', 'Monthly, for the day parts done'],
  ['per_step', 'After each completed step'],
  ['end', 'At the end of the assignment'],
];
const ASSIGNMENT_OPTIONS = [
  ['none', "Don't create assignments"],
  ['single', 'One assignment for the whole proposal'],
  ['per_step', 'One assignment per step'],
];

const today = () => new Intl.DateTimeFormat('en-CA').format(new Date());

// The texts of the Sint Lutgardis proposal, which a new proposal starts from
const EXAMPLE = {
  introduction:
    'De school wil een kwaliteitscyclus implementeren en uitvoeren de komende jaren. Het beleidsteam heeft hiertoe nood aan een houvast: een flexibel kwaliteitsdatasysteem dat in eerste instantie gebouwd wordt op basis van het huidige strategische plan van de school.',
  goal:
    'Catalista heeft voor deze doelstellingen een plan van aanpak uitgewerkt. Dit plan laat toe een concreet kwaliteitszorgproces op te starten in de loop van het tweede trimester van het schooljaar 2026-2027.',
  steps: [
    {
      title: 'Kwaliteitsdossier opmaken',
      days: 0.5,
      description:
        'We werken een halve dag met het beleidsteam aan een kwaliteitsdossier: vanuit het ROK en het strategisch plan van de school kijken we naar welke databronnen de school al actief gebruikt en waar nog kansen liggen. We denken samen na over geschikte drempelwaarden voor de kwaliteit van de school. (halve dag voorbereiding + halve dag naverwerking voor Catalista)',
    },
    {
      title: 'Data voor het kwaliteitsdossier vinden, interpreteren en gebruiken in het kwaliteitsdossier',
      days: 2,
      description:
        'We werken 2 dagen samen met het beleidsteam aan een datawijzer/dataloep/… analyse in functie van het invullen en versterken van het kwaliteitsdossier. Het team gaat effectief mee aan de slag zodat data helder en vindbaar worden. Tussen de 2 dagen werkt het team verder, zodat op het einde van dag 2 het dossier zo goed als klaar kan worden beschouwd. (+ halve dag tussendoor begeleidingswerk door Catalista)',
    },
    {
      title: 'Vanuit de data het strategisch en actieplan effectiever maken door scherpe doelen te stellen en een proces te bepalen',
      days: 0.5,
      description:
        'Vanuit het kwaliteitsdossier met de data kijken wij terug naar het strategisch plan en het actieplan van de school. We scherpen de doelen aan om ze zo effectief en meetbaar mogelijk te formuleren. We bepalen ook het proces of de cyclus om de kwaliteitsopvolging effectief neer te zetten op de beleidsvloer en eventueel de klasvloer. Deze laatste stap neemt een halve dag samenwerken met het beleidsteam op. (+ een halve dag voorbereiding voor Catalista)',
    },
  ],
  requirements:
    'Voor stap 1 is toegang nodig tot de kerndocumenten en de databronnen van de school (datawijzer, smartschool, … en ook strategische plannen, prioriteitenplannen, …).',
  supportDays: 2,
  supportLabel: 'Ondersteunend werk in voorbereiding of verwerking van de begeleidingsdagen',
  dayRate: 950,
  conditions: {
    travelRate: 0.45,
    invoicing: 'monthly',
    paymentTermDays: 30,
    clientCosts: true,
    gdpr: true,
    cancellation: true,
    validity: true,
    latePayment: true,
    extraWork: true,
    liability: true,
    materials: true,
    confidentiality: true,
    indexation: false,
    acceptance: true,
    law: true,
  },
};

// The clauses that can be switched on or off; the full Dutch text is in the PDF
const CLAUSE_OPTIONS = [
  ['clientCosts', 'Practical organisation, copies, catering and rooms are paid by the client'],
  ['gdpr', 'Personal data: we act as processor under article 28 GDPR, with its main duties'],
  ['cancellation', 'Cancelling: 50% under 10 working days, 100% under 2 working days'],
  ['validity', 'The proposal is valid for 60 days'],
  ['latePayment', 'Statutory interest and fixed compensation for late payment'],
  ['extraWork', 'Extra days at the day rate, after agreement'],
  ['liability', 'Best-efforts obligation, liability limited to the amount invoiced'],
  ['materials', 'Client may use the materials internally; methods and templates stay ours'],
  ['confidentiality', 'Both parties keep confidential information confidential'],
  ['indexation', 'Day rate indexed each 1 January (health index)'],
  ['acceptance', 'Accepted by signature or by email'],
  ['law', 'Belgian law, courts of the district of our registered office'],
];

// The texts, steps and budget of `source` (a proposal or the example), for a new proposal; the dates stay empty
function copyTexts(form, source) {
  return {
    ...form,
    introduction: source.introduction || '',
    goal: source.goal || '',
    steps: (source.steps || []).map((s) => ({
      title: s.title,
      description: s.description || '',
      proposedDates: '',
      unit: s.unit || 'days',
      days: s.days ?? 0.5,
      hours: s.hours ?? '',
      rate: s.rate ?? '',
    })),
    requirements: source.requirements || '',
    supportDays: source.supportDays || 0,
    supportLabel: source.supportLabel || EXAMPLE.supportLabel,
    dayRate: source.dayRate ?? EXAMPLE.dayRate,
    conditions: { ...EXAMPLE.conditions, ...source.conditions },
  };
}

function emptyProposal(source = EXAMPLE) {
  return copyTexts(
    {
      client: '',
      title: '',
      date: today(),
      brand: 'catalista',
      status: 'draft',
      consultants: [],
      assignmentMode: 'none',
    },
    source
  );
}

// The stored proposal as form values
function toForm(p) {
  return {
    ...emptyProposal(),
    ...p,
    client: p.client?._id || p.client,
    date: String(p.date).slice(0, 10),
    consultants: (p.consultants || []).map(String),
    conditions: { ...emptyProposal().conditions, ...p.conditions },
  };
}

// The price of one step, as the server computes it: days at the day rate (or the step's own), hours at a rate,
// or a fixed amount
function stepAmount(step, dayRate) {
  if (step.unit === 'hours') return Number(step.hours || 0) * Number(step.rate || 0);
  if (step.unit === 'amount') return Number(step.rate || 0);
  return Number(step.days || 0) * Number(step.rate || dayRate || 0);
}

function totals(form) {
  const days =
    form.steps.reduce((s, step) => s + ((step.unit || 'days') === 'days' ? Number(step.days || 0) : 0), 0) +
    Number(form.supportDays || 0);
  const amount =
    form.steps.reduce((s, step) => s + stepAmount(step, form.dayRate), 0) +
    Number(form.supportDays || 0) * Number(form.dayRate || 0) +
    Number(form.travelAmount || 0);
  return { days, amount };
}

// The dialog in which a proposal is written, previewed and saved
function ProposalEditor({ initial, source, proposals, clients, users, onClose, onSaved }) {
  const [form, setForm] = useState(() => (initial ? toForm(initial) : emptyProposal(source || EXAMPLE)));
  const [sourceId, setSourceId] = useState(source?._id || 'example');

  // A new proposal can take its texts from the example or from any earlier proposal
  function chooseSource(id) {
    setSourceId(id);
    setForm((f) => copyTexts(f, id === 'example' ? EXAMPLE : proposals.find((p) => p._id === id)));
  }

  // Choosing a client suggests the title of the example, until a title is typed
  function chooseClient(id) {
    const client = clients.find((c) => c._id === id);
    setForm((f) => ({ ...f, client: id, title: f.title || (client ? `Opzet kwaliteitszorgsysteem voor ${client.name}` : '') }));
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const locked = (initial?.createdAssignments || []).length > 0;
  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));
  const setCondition = (field, value) => setForm((f) => ({ ...f, conditions: { ...f.conditions, [field]: value } }));
  const setStep = (i, field, value) =>
    setForm((f) => ({ ...f, steps: f.steps.map((s, j) => (j === i ? { ...s, [field]: value } : s)) }));
  const moveStep = (i, delta) =>
    setForm((f) => {
      const steps = [...f.steps];
      [steps[i], steps[i + delta]] = [steps[i + delta], steps[i]];
      return { ...f, steps };
    });
  const toggleConsultant = (id) =>
    set('consultants', form.consultants.includes(id) ? form.consultants.filter((c) => c !== id) : [...form.consultants, id]);
  const { days, amount } = totals(form);

  async function showPreview() {
    setError('');
    try {
      const res = await api.post('/proposals/preview', { ...form, number: initial?.number }, { responseType: 'blob' });
      setPreview({
        title: `Offerte ${initial?.number || '(concept)'}`,
        url: URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' })),
        fileName: `offerte_${initial?.number || 'concept'}.pdf`,
      });
    } catch (err) {
      const text = await err.response?.data?.text?.();
      let message = 'Could not create the preview.';
      try {
        message = JSON.parse(text).message || message;
      } catch {
        // keep the general message
      }
      setError(message);
    }
  }

  async function save(e) {
    e.preventDefault();
    if (
      form.status === 'accepted' &&
      initial?.status !== 'accepted' &&
      form.assignmentMode !== 'none' &&
      !locked &&
      !window.confirm(
        form.assignmentMode === 'single'
          ? 'Accepting creates one assignment for this proposal. Continue?'
          : `Accepting creates ${form.steps.length + (Number(form.supportDays) > 0 ? 1 : 0)} assignments, one per step. Continue?`
      )
    ) {
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, steps: form.steps.filter((s) => s.title.trim()) };
      const { data } = initial ? await api.put(`/proposals/${initial._id}`, payload) : await api.post('/proposals', payload);
      onSaved(data.assignmentsCreated || 0, data.storedDocument);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save the proposal.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal modal-wide proposal-editor">
        <div className="modal-header">
          <div>
            <h2>{initial ? `Proposal ${initial.number}` : 'New proposal'}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {num(days)} days · {formatEUR(amount)} excl. VAT
            </p>
          </div>
          <button className="btn btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={save}>
          {!initial && (
            <div className="field">
              <label>Start from</label>
              <select value={sourceId} onChange={(e) => chooseSource(e.target.value)}>
                <option value="example">The example texts (Sint Lutgardis)</option>
                {proposals.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.number} · {p.client?.name} · {p.title}
                  </option>
                ))}
              </select>
              <p className="muted" style={{ marginTop: 6 }}>
                Copies the texts, steps, budget and conditions. Dates, client, title and consultants are not copied.
              </p>
            </div>
          )}
          <div className="field-row">
            <div className="field">
              <label>Client</label>
              <select required value={form.client} onChange={(e) => chooseClient(e.target.value)}>
                <option value="">Choose a client</option>
                {clients.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Date</label>
              <input type="date" required value={form.date} onChange={(e) => set('date', e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Title</label>
            <input
              required
              placeholder="Opzet kwaliteitszorgsysteem voor …"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Brand</label>
              <select value={form.brand} onChange={(e) => set('brand', e.target.value)}>
                <option value="catalista">Catalista</option>
                <option value="bespreek">bespreek</option>
              </select>
            </div>
            <div className="field">
              <label>Status</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)}>
                {Object.entries(STATUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <h3>Consultants</h3>
          <div className="proposal-chips">
            {users.map((u) => (
              <label key={u.id} className={'proposal-chip' + (form.consultants.includes(u.id) ? ' on' : '')}>
                <input type="checkbox" checked={form.consultants.includes(u.id)} onChange={() => toggleConsultant(u.id)} />
                {u.name}
                {!u.bio && <span className="muted"> (no profile yet)</span>}
              </label>
            ))}
          </div>

          <h3>Situation</h3>
          <div className="field">
            <label>Aanleiding</label>
            <textarea rows={4} value={form.introduction} onChange={(e) => set('introduction', e.target.value)} />
          </div>
          <div className="field">
            <label>Doelstelling</label>
            <textarea rows={3} value={form.goal} onChange={(e) => set('goal', e.target.value)} />
          </div>

          <h3>Plan of approach</h3>
          {form.steps.map((step, i) => (
            <div key={i} className="proposal-step">
              <div className="proposal-step-head">
                <strong>Stap {i + 1}</strong>
                <div className="row-actions">
                  <button type="button" className="btn btn-sm" disabled={i === 0} onClick={() => moveStep(i, -1)} aria-label="Move up">
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={i === form.steps.length - 1}
                    onClick={() => moveStep(i, 1)}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    disabled={form.steps.length === 1}
                    onClick={() => set('steps', form.steps.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="field">
                <label>Title</label>
                <input value={step.title} onChange={(e) => setStep(i, 'title', e.target.value)} />
              </div>
              <div className="field-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                <div className="field">
                  <label>Priced per</label>
                  <select value={step.unit || 'days'} onChange={(e) => setStep(i, 'unit', e.target.value)}>
                    <option value="days">Day</option>
                    <option value="hours">Hour</option>
                    <option value="amount">Fixed amount</option>
                  </select>
                </div>
                {(step.unit || 'days') === 'days' && (
                  <div className="field">
                    <label>Days</label>
                    <select value={step.days} onChange={(e) => setStep(i, 'days', Number(e.target.value))}>
                      {DAY_OPTIONS.map((d) => (
                        <option key={d} value={d}>
                          {num(d)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {step.unit === 'hours' && (
                  <div className="field">
                    <label>Hours</label>
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      value={step.hours ?? ''}
                      onChange={(e) => setStep(i, 'hours', e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </div>
                )}
                <div className="field">
                  <label>
                    {step.unit === 'hours' ? '€ per hour' : step.unit === 'amount' ? 'Amount (€)' : '€ per day'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={(step.unit || 'days') === 'days' ? `${form.dayRate} (day rate)` : ''}
                    value={step.rate ?? ''}
                    onChange={(e) => setStep(i, 'rate', e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="field">
                <label>Description</label>
                <textarea rows={3} value={step.description} onChange={(e) => setStep(i, 'description', e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Proposed dates</label>
                <input
                  placeholder="28/09 voormiddag"
                  value={step.proposedDates}
                  onChange={(e) => setStep(i, 'proposedDates', e.target.value)}
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginBottom: 14 }}
            onClick={() =>
              set('steps', [...form.steps, { title: '', description: '', proposedDates: '', unit: 'days', days: 0.5, hours: '', rate: '' }])
            }
          >
            + Add step
          </button>
          <div className="field">
            <label>What the client provides</label>
            <textarea
              rows={2}
              placeholder="Voor stap 1 is toegang nodig tot de kerndocumenten en de databronnen van de school."
              value={form.requirements}
              onChange={(e) => set('requirements', e.target.value)}
            />
          </div>

          <h3>Budget</h3>
          <div className="field-row" style={{ gridTemplateColumns: '3fr 1fr' }}>
            <div className="field">
              <label>Supporting work (without the client)</label>
              <input value={form.supportLabel} onChange={(e) => set('supportLabel', e.target.value)} />
            </div>
            <div className="field">
              <label>Days</label>
              <select value={form.supportDays} onChange={(e) => set('supportDays', Number(e.target.value))}>
                <option value={0}>None</option>
                {DAY_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {num(d)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Day rate (€, excl. VAT)</label>
              <input type="number" min="0" step="5" value={form.dayRate} onChange={(e) => set('dayRate', Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Travel (€ per km)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.conditions.travelRate}
                onChange={(e) => setCondition('travelRate', Number(e.target.value))}
              />
            </div>
          </div>

          <div className="field-row" style={{ gridTemplateColumns: '1fr 2fr' }}>
            <div className="field">
              <label>Travel already known (€)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.travelAmount || ''}
                onChange={(e) => set('travelAmount', e.target.value === '' ? 0 : Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label>Travel description</label>
              <input placeholder="230 km" value={form.travelNote || ''} onChange={(e) => set('travelNote', e.target.value)} />
            </div>
          </div>

          <h3>Conditions</h3>
          <div className="field-row">
            <div className="field">
              <label>Invoicing</label>
              <select value={form.conditions.invoicing} onChange={(e) => setCondition('invoicing', e.target.value)}>
                {INVOICING_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Payment term</label>
              <select
                value={form.conditions.paymentTermDays}
                onChange={(e) => setCondition('paymentTermDays', Number(e.target.value))}
              >
                {[14, 30, 45, 60].map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="proposal-clauses">
            {CLAUSE_OPTIONS.map(([key, label]) => (
              <label key={key} className="checkbox-row">
                <input type="checkbox" checked={!!form.conditions[key]} onChange={(e) => setCondition(key, e.target.checked)} />
                {label}
              </label>
            ))}
          </div>

          <h3>When accepted</h3>
          <div className="field">
            <select value={form.assignmentMode} disabled={locked} onChange={(e) => set('assignmentMode', e.target.value)}>
              {ASSIGNMENT_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            {locked ? (
              <p className="muted" style={{ marginTop: 6 }}>
                Created:{' '}
                {initial.createdAssignments.map((a, i) => (
                  <span key={a._id}>
                    {i > 0 && ', '}
                    <Link to={`/assignments/${a._id}`}>{a.title}</Link>
                  </span>
                ))}
              </p>
            ) : (
              <p className="muted" style={{ marginTop: 6 }}>
                Assignments are created once, when the status is set to Accepted, billed per day at the day rate with the
                chosen consultants.
              </p>
            )}
          </div>

          <div className="row-actions">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save proposal'}
            </button>
            <button type="button" className="btn" onClick={showPreview}>
              Preview
            </button>
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
      {preview && (
        <FilePreviewModal
          {...preview}
          mimeType="application/pdf"
          onClose={() => {
            URL.revokeObjectURL(preview.url);
            setPreview(null);
          }}
        />
      )}
    </div>
  );
}

const num = (n) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(n);

export default function Proposals() {
  const [proposals, setProposals] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null, 'new' or the proposal being edited
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);

  async function load() {
    const [p, c, u] = await Promise.all([api.get('/proposals'), api.get('/clients'), api.get('/users')]);
    setProposals(p.data);
    setClients(c.data);
    setUsers(u.data.filter((x) => x.active));
    setLoading(false);
  }

  useEffect(() => {
    load().catch(() => setError('Could not load the proposals.'));
  }, []);

  async function openEditor(proposal, duplicate = false) {
    setMessage('');
    if (!proposal) return setEditing('new');
    if (duplicate) return setEditing({ duplicateOf: proposal });
    const { data } = await api.get(`/proposals/${proposal._id}`);
    setEditing(data);
  }

  async function showPdf(p, download) {
    setError('');
    try {
      const res = await api.get(`/proposals/${p._id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const fileName = `offerte_${p.number}_${(p.client?.name || '').replace(/[^\w-]+/g, '_')}.pdf`;
      if (!download) return setPreview({ title: `Offerte ${p.number} · ${p.client?.name}`, url, fileName });
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(`Could not create the PDF of ${p.number}.`);
    }
  }

  // For work that was already invoiced in detail: an invoice with one line referring to this proposal
  async function invoiceProposal(p) {
    const ok = window.confirm(
      `Create an invoice for proposal ${p.number} to ${p.client?.name}?\n\n` +
        `One line: "Prestaties zoals beschreven in offerte ${p.number}", ${formatEUR(p.budget.amount)} excl. VAT.\n\n` +
        'It gets the next invoice number and is stored with the client. Time logs are not changed. The app cannot undo this.'
    );
    if (!ok) return;
    setError('');
    setMessage('');
    try {
      const { data } = await api.post(`/proposals/${p._id}/invoice`);
      const res = await api.get(`/documents/${data.document._id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = data.document.originalName;
      link.click();
      URL.revokeObjectURL(url);
      setMessage(`Invoice ${data.invoiceNumber} created and downloaded.`);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create the invoice.');
    }
  }

  async function remove(p) {
    if (!window.confirm(`Delete proposal ${p.number}?`)) return;
    setError('');
    try {
      await api.delete(`/proposals/${p._id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete the proposal.');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Proposals</h1>
          <p>Offertes to clients. An accepted proposal can create its assignments.</p>
        </div>
        <button className="btn btn-primary" onClick={() => openEditor(null)}>
          + New proposal
        </button>
      </div>

      {message && <div className="success-banner">{message}</div>}
      {error && <div className="error-banner">{error}</div>}

      <div className="table-wrap" style={{ overflowX: 'auto' }}>
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : proposals.length === 0 ? (
          <div className="empty-state">No proposals yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Proposal</th>
                <th>Date</th>
                <th>Client</th>
                <th>Title</th>
                <th>Days</th>
                <th>Total excl. VAT</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((p) => (
                <tr key={p._id}>
                  <td>
                    <strong>{p.number}</strong>
                  </td>
                  <td>{formatDate(p.date)}</td>
                  <td>{p.client?.name}</td>
                  <td>{p.title}</td>
                  <td>{num(p.budget.days)}</td>
                  <td>{formatEUR(p.budget.amount)}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGES[p.status]}`}>{STATUS_LABELS[p.status]}</span>
                    {p.invoiceNumber && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        Invoice {p.invoiceNumber}
                      </div>
                    )}
                    {p.createdAssignments?.length > 0 && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        {p.createdAssignments.length} assignment{p.createdAssignments.length === 1 ? '' : 's'}
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="row-actions">
                      <button className="btn btn-sm btn-primary" onClick={() => openEditor(p)}>
                        Edit
                      </button>
                      <button className="btn btn-sm" onClick={() => openEditor(p, true)}>
                        Duplicate
                      </button>
                      <button className="btn btn-sm" onClick={() => showPdf(p, false)}>
                        Preview
                      </button>
                      <button className="btn btn-sm" onClick={() => showPdf(p, true)}>
                        Download
                      </button>
                      {['sent', 'accepted'].includes(p.status) && !p.invoiceNumber && (
                        <button className="btn btn-sm" onClick={() => invoiceProposal(p)}>
                          Invoice
                        </button>
                      )}
                      {!p.createdAssignments?.length && !p.invoiceNumber && (
                        <button className="btn btn-sm btn-danger" onClick={() => remove(p)}>
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

      {editing && (
        <ProposalEditor
          initial={editing === 'new' || editing.duplicateOf ? null : editing}
          source={editing.duplicateOf}
          proposals={proposals}
          clients={clients}
          users={users}
          onClose={() => setEditing(null)}
          onSaved={(created, storedDocument) => {
            setEditing(null);
            setMessage(
              [
                'Proposal saved.',
                created && `${created} assignment${created === 1 ? '' : 's'} created.`,
                storedDocument && `The PDF is stored with the client's documents as ${storedDocument}.`,
              ]
                .filter(Boolean)
                .join(' ')
            );
            load();
          }}
        />
      )}
      {preview && (
        <FilePreviewModal
          {...preview}
          mimeType="application/pdf"
          onClose={() => {
            URL.revokeObjectURL(preview.url);
            setPreview(null);
          }}
        />
      )}
    </div>
  );
}
