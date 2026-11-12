import { Icon } from './Icon';

interface Props {
  kind: 'loading' | 'error';
  title: string;
  text?: string;
  action?: { label: string; onClick: () => void };
}

/** Full-screen loading or error state. */
export function StatusScreen({ kind, title, text, action }: Props) {
  return (
    <main className="page status" aria-busy={kind === 'loading'}>
      <div className="status-box" role={kind === 'error' ? 'alert' : 'status'}>
        {kind === 'loading' ? (
          <span className="spinner" aria-hidden="true" />
        ) : (
          <span className="status-icon" aria-hidden="true">
            <Icon name="alert" />
          </span>
        )}
        <h1 className="status-title">{title}</h1>
        {text && <p className="status-text">{text}</p>}
        {action && (
          <button type="button" className="cbtn blue" onClick={action.onClick}>
            <Icon name="redo" />
            {action.label}
          </button>
        )}
      </div>
    </main>
  );
}
