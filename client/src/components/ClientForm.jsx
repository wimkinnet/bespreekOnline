import { useState } from 'react';

const COUNTRIES = ['Belgium', 'Netherlands', 'Germany', 'France', 'Luxembourg', 'United Kingdom'];

export const emptyClientForm = {
  name: '',
  type: 'school',
  parentPool: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  vatNumber: '',
  vatExempt: false,
  street: '',
  postalCode: '',
  city: '',
  country: 'Belgium',
  billingContactName: '',
  billingContactEmail: '',
  billingStreet: '',
  billingPostalCode: '',
  billingCity: '',
  billingCountry: 'Belgium',
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
    vatExempt: !!client.vatExempt,
    street: client.address?.street || '',
    postalCode: client.address?.postalCode || '',
    city: client.address?.city || '',
    country: client.address?.country || 'Belgium',
    billingContactName: client.billing?.contactName || '',
    billingContactEmail: client.billing?.contactEmail || '',
    billingStreet: client.billing?.address?.street || '',
    billingPostalCode: client.billing?.address?.postalCode || '',
    billingCity: client.billing?.address?.city || '',
    billingCountry: client.billing?.address?.country || 'Belgium',
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
    vatExempt: form.vatExempt,
    notes: form.notes,
    address: { street: form.street, postalCode: form.postalCode, city: form.city, country: form.country },
    billing: {
      contactName: form.billingContactName,
      contactEmail: form.billingContactEmail,
      address: {
        street: form.billingStreet,
        postalCode: form.billingPostalCode,
        city: form.billingCity,
        country: form.billingCountry,
      },
    },
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
      <label className="checkbox-row" style={{ marginBottom: 14 }}>
        <input
          type="checkbox"
          checked={form.vatExempt}
          onChange={(e) => setForm({ ...form, vatExempt: e.target.checked })}
        />
        Foreign client: invoice without VAT
      </label>
      <div className="field">
        <label>Street & number (used for travel)</label>
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
        <div className="field">
          <label>Country</label>
          <select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {!COUNTRIES.includes(form.country) && <option value={form.country}>{form.country}</option>}
          </select>
        </div>
      </div>
      <h3>Billing details</h3>
      <p className="muted" style={{ marginBottom: 10 }}>
        Only if invoices go elsewhere. Anything left empty uses the contact and address above.
      </p>
      <div className="field-row">
        <div className="field">
          <label>Billing contact name</label>
          <input
            value={form.billingContactName}
            onChange={(e) => setForm({ ...form, billingContactName: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Billing email</label>
          <input
            type="email"
            value={form.billingContactEmail}
            onChange={(e) => setForm({ ...form, billingContactEmail: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label>Billing street & number</label>
        <input value={form.billingStreet} onChange={(e) => setForm({ ...form, billingStreet: e.target.value })} />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Postal code</label>
          <input
            value={form.billingPostalCode}
            onChange={(e) => setForm({ ...form, billingPostalCode: e.target.value })}
          />
        </div>
        <div className="field">
          <label>City</label>
          <input value={form.billingCity} onChange={(e) => setForm({ ...form, billingCity: e.target.value })} />
        </div>
        <div className="field">
          <label>Country</label>
          <select value={form.billingCountry} onChange={(e) => setForm({ ...form, billingCountry: e.target.value })}>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {!COUNTRIES.includes(form.billingCountry) && <option value={form.billingCountry}>{form.billingCountry}</option>}
          </select>
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
