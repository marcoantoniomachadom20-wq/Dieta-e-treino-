import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { User } from 'lucide-react';

export function TopBar({ eyebrow, title, right }: { eyebrow?: ReactNode; title: ReactNode; right?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="grow">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
      </div>
      <div className="row">
        {right}
        <Link to="/perfil" className="icon-btn" aria-label="Perfil e configurações">
          <User size={18} color="var(--text)" />
        </Link>
      </div>
    </header>
  );
}
