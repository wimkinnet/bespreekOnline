import { formatDate } from '../utils/format';
import TimeEntryForm from './TimeEntryForm';

// Edit an existing time entry; `onSaved` runs after a successful save.
export default function TimeEntryEditModal({ entry, onClose, onSaved }) {
  return (
    <div className="modal-backdrop">
      <div className="modal modal-wide">
        <div className="modal-header">
          <div>
            <h2>Edit time entry</h2>
            <p className="muted" style={{ margin: 0 }}>
              {entry.consultant?.name} · {formatDate(entry.date)}
            </p>
          </div>
        </div>
        <TimeEntryForm entry={entry} onSaved={onSaved} onCancel={onClose} />
      </div>
    </div>
  );
}
