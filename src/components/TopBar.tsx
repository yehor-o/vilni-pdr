import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

interface Props {
  backTo: string;
  backLabel: string;
  backIcon?: IconName;
  /** Router state passed with the back link. */
  backState?: unknown;
  title?: string;
  children?: ReactNode;
}

/** Sticky top bar: back/close link, then a title or custom content. */
export function TopBar({ backTo, backLabel, backIcon = 'back', backState, title, children }: Props) {
  return (
    <header className="topbar">
      <div className="topbar-row">
        <Link to={backTo} state={backState} className="iconbtn" aria-label={backLabel}>
          <Icon name={backIcon} />
        </Link>
        {title && <h1 className="topbar-title">{title}</h1>}
        {children}
      </div>
    </header>
  );
}
