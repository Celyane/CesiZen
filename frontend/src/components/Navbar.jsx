import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { isAuthenticated, user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const handleLogout = () => {
    setDropdownOpen(false);
    logout();
    navigate('/login');
  };

  // Ferme le dropdown si on clique en dehors
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/">CesiZen</Link>
      </div>

      <div className="navbar-links">
        <Link to="/resources">Ressources</Link>
        {isAuthenticated && <Link to="/breathing-exercices">Exercices</Link>}
        {isAuthenticated && hasRole('ROLE_ADMIN') && (
          <Link to="/admin">Admin</Link>
        )}
      </div>

      <div className="navbar-auth">
        {isAuthenticated ? (
          <div className="navbar-user" ref={dropdownRef}>
            <button
              className="navbar-user-btn"
              onClick={() => setDropdownOpen((prev) => !prev)}
              aria-expanded={dropdownOpen}
            >
              <span className="navbar-avatar">
                {user?.firstname?.[0]}{user?.lastname?.[0]}
              </span>
              <span className="navbar-username">
                {user?.firstname} {user?.lastname}
              </span>
              <span className="navbar-chevron">{dropdownOpen ? '▲' : '▼'}</span>
            </button>

            {dropdownOpen && (
              <div className="navbar-dropdown">
                <div className="navbar-dropdown-header">
                  <strong>{user?.firstname} {user?.lastname}</strong>
                  <small>{user?.email}</small>
                </div>
                <hr className="navbar-dropdown-divider" />
                <Link
                  to="/profile"
                  className="navbar-dropdown-item"
                  onClick={() => setDropdownOpen(false)}
                >
                  Mon profil
                </Link>
                <button
                  className="navbar-dropdown-item navbar-dropdown-item--danger"
                  onClick={handleLogout}
                >
                  Déconnexion
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <Link to="/login" className="btn btn-outline">Connexion</Link>
            <Link to="/register" className="btn btn-primary">Inscription</Link>
          </>
        )}
      </div>
    </nav>
  );
}
