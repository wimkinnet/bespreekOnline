import { useState } from 'react';

export const emptyClientForm = {
  name: '',
  type: 'school',
  parentPool: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  vatNumber: '',
  street: '',
  postalCode: '',
  city: '',
  status: 'active',
  notes: '',
};

// Flatten a client from the API into form values
export function clientToForm(client) {
  return {
    name: client.name || '',
    type: client.type || 'school',
    parentPool: client.parentPool?._id || client.parentPool || '',
    contactName: client.contactName || '',
    contactEmail: client.contactEmail || '',
    contactPhone: client.contactPhone || '',
    vatNumber: client.vatNumber || '',
    street: client.address?.street || '',
    postalCode: client.address?.postalCode || '',
    city: client.address?.city || '',
    status: client.status || 'active',
    notes: client.notes || '',
  };
}

// Turn form values into the payload the clients API expects
export function formToPayload(form) {
  return {
    name: form.name,
    type: form.type,
    parentPool: form.type === 'school' ? form.parentPool || null : null,
    status: form.status,
    contactName: form.contactName,
    contactEmail: form.contactEmail,
    contactPhone: form.contactPhone,
    vatNumber: form.vatNumber,
    notes: form.notes,
    address: { street: form.street, postalCode: form.postalCode, city: form.city },
  };
}

// Shared create/edit form for clients. `groups` are the selectable school groups;
// `excludeId` keeps a client from being offered as its own school group.
export default function ClientForm({ initial = emptyClientForm, groups, excludeId, onSubmit, saving, submitLabel }) {
  const [form, setForm] = useState(initial);

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit(formToPayload(form));
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label>Name</label>
        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Type</label>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="school">School</option>
            <option value="school_pool">School group</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="field">
          <label>Status</label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="prospect">Prospect</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>
      {form.type === 'school' && (
        <div className="field">
          <label>School group (optional)</label>
          <select value={form.parentPool} onChange={(e) => setForm({ ...form, parentPool: e.target.value })}>
            <option value="">Independent school</option>
            {groups
              .filter((g) => g._id !== excludeId)
              .map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name}
                </option>
              ))}
          </select>
        </div>
      )}
      <div className="field-row">
        <div className="field">
          <label>Contact name</label>
          <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
        </div>
        <div className="field">
          <label>Contact email</label>
          <input
            type="email"
            value={form.contactEmail}
            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
          />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Contact phone</label>
          <input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
        </div>
        <div className="field">
          <label>VAT number</label>
          <input value={form.vatNumber} onChange={(e) => setForm({ ...form, vatNumber: e.target.value })} />
        </div>
      </div>
      <div className="field">
        <label>Street & number</label>
        <input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
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
      <div className="field">
        <label>Notes</label>
        <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
      <button className="btn btn-primary" type="submit" disabled={saving}>
        {saving ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
