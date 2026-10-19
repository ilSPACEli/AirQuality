import { useEffect } from 'react';

// Модальне вікно: вміст передається через children (композиція)
function Modal({ title, onClose, children, width = 560 }) {
  // Закриття клавішею Escape
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ maxWidth: width }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Закрити">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default Modal;
