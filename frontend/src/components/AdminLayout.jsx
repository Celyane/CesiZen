import { NavLink } from 'react-router-dom';

const adminLinks = [
  { to: '/admin', label: 'Tableau de bord', end: true },
  { to: '/admin/users', label: 'Utilisateurs' },
  { to: '/admin/resources', label: 'Ressources' },
  { to: '/admin/breathing-exercices', label: 'Exercices' },
];

export default function AdminLayout({ children }) {
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <p className="admin-sidebar-title">Administration</p>
        <nav>
          {adminLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                'admin-sidebar-link' + (isActive ? ' active' : '')
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="admin-content">{children}</div>
    </div>
  );
}
