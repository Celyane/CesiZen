import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    firstname: '',
    lastname: '',
    email: '',
    password: '',
  });
  const [rgpdConsent, setRgpdConsent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rgpdConsent) {
      setError('Vous devez accepter la politique de confidentialité pour créer un compte.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.post('/api/register', form);
      // Auto-login after registration
      const loginRes = await api.post('/api/login', {
        email: form.email,
        password: form.password,
      });
      login(loginRes.data.token);
      navigate('/resources');
    } catch (err) {
      const message = err.response?.data?.message || err.response?.data?.error;
      setError(message || 'Une erreur est survenue lors de l\'inscription.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page auth-page">
      <div className="auth-card">
        <h2>Créer un compte</h2>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit} className="form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="firstname">Prénom</label>
              <input
                id="firstname"
                name="firstname"
                type="text"
                value={form.firstname}
                onChange={handleChange}
                placeholder="Alice"
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label htmlFor="lastname">Nom</label>
              <input
                id="lastname"
                name="lastname"
                type="text"
                value={form.lastname}
                onChange={handleChange}
                placeholder="Martin"
                required
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="alice@email.fr"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Minimum 8 caractères"
              required
              minLength={8}
            />
          </div>
          <div className="form-group form-group-checkbox">
            <label htmlFor="rgpdConsent">
              <input
                id="rgpdConsent"
                type="checkbox"
                checked={rgpdConsent}
                onChange={(e) => setRgpdConsent(e.target.checked)}
                required
              />
              J'accepte que mes données personnelles soient traitées conformément à la politique de confidentialité.
            </label>
          </div>
          <button type="submit" className="btn btn-primary btn-full" disabled={loading || !rgpdConsent}>
            {loading ? 'Création...' : 'Créer mon compte'}
          </button>
        </form>
        <p className="auth-link">
          Déjà un compte ? <Link to="/login">Se connecter</Link>
        </p>
      </div>
    </div>
  );
}
