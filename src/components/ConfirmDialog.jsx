import { useState } from 'react';
import Modal from './Modal.jsx';

function ConfirmDialog({ title, message, confirmText = 'Видалити', onConfirm, onCancel }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={onCancel} width={440}>
      <p>{message}</p>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button className="btn" onClick={onCancel} disabled={busy}>
          Скасувати
        </button>
        <button className="btn btn-danger" onClick={handleConfirm} disabled={busy}>
          {busy ? 'Видалення…' : confirmText}
        </button>
      </div>
    </Modal>
  );
}

export default ConfirmDialog;
