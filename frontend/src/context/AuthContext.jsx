import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount (or when token changes), fetch current user info
  useEffect(() => {
    if (token) {
      api.get('/api/me')
        .then((res) => setUser(res.data))
        .catch(() => {
          // Token is invalid or expired
          localStorage.removeItem('token');
          setToken(null);
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setUser(null);
      setLoading(false);
    }
  }, [token]);

  const login = (newToken) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const refreshUser = () => {
    if (!token) return;
    api.get('/api/me').then((res) => setUser(res.data)).catch(() => {});
  };

  const isAuthenticated = !!token && !!user;

  const hasRole = (role) => {
    if (!user || !user.roles) return false;
    // Role hierarchy: ADMIN > REDACTOR > USER
    if (role === 'ROLE_USER') return true; // every authenticated user has USER
    if (role === 'ROLE_REDACTOR') {
      return user.roles.includes('ROLE_REDACTOR') || user.roles.includes('ROLE_ADMIN');
    }
    if (role === 'ROLE_ADMIN') {
      return user.roles.includes('ROLE_ADMIN');
    }
    return user.roles.includes(role);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, refreshUser, isAuthenticated, hasRole, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its provider, standard pattern
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
