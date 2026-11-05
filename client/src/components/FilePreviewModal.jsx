// Files a browser can show itself; others can only be downloaded
export function canPreview(mimeType) {
  return mimeType === 'application/pdf' || /^image\//.test(mimeType || '');
}

// Shows a file from an object URL, with download and new-tab links. The caller revokes the URL in `onClose`.
export default function FilePreviewModal({ title, url, fileName, mimeType, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal pdf-preview" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <div className="row-actions">
            <a className="btn btn-sm" href={url} download={fileName}>
              Download
            </a>
            <a className="btn btn-sm" href={url} target="_blank" rel="noreferrer">
              Open in new tab
            </a>
            <button className="btn btn-sm" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        {/^image\//.test(mimeType || '') ? (
          <div className="file-preview-image">
            <img src={url} alt={title} />
          </div>
        ) : (
          <iframe title={title} src={url} />
        )}
      </div>
    </div>
  );
}
