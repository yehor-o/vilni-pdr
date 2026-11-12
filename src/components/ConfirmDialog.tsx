import { useId } from 'react';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** In-app confirmation for destructive actions. */
export function ConfirmDialog({ open, title, text, confirmLabel, onConfirm, onCancel }: Props) {
  const titleId = useId();
  return (
    <Modal open={open} onClose={onCancel} labelledBy={titleId} className="confirm">
      <div className="confirm-box">
        <h2 id={titleId} className="confirm-title">
          {title}
        </h2>
        <p className="confirm-text">{text}</p>
        <div className="confirm-actions">
          <button type="button" className="cbtn white" onClick={onCancel} autoFocus>
            Скасувати
          </button>
          <button type="button" className="cbtn red" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
