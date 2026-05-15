import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

export default function Profile() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    firstname: user?.firstname || '',
    lastname: user?.lastname || '',
    email: user?.email || '',
    password: '',
    confirmPassword: '',
  });

  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activity, setActivity] = useState(null);
  const [activeTab, setActiveTab] = useState('favorites');

  useEffect(() => {
    api.get('/api/me/activity').then((res) => setActivity(res.data));
  }, []);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
    setSuccessMsg('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (form.password && form.password !== form.confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    const payload = {
      firstname: form.firstname,
      lastname: form.lastname,
      email: form.email,
    };
    if (form.password) {
      payload.password = form.password;
    }

    setSaving(true);
    try {
      await api.put('/api/me', payload);
      refreshUser();
      setSuccessMsg('Profil mis à jour avec succès.');
      setForm((prev) => ({ ...prev, password: '', confirmPassword: '' }));
    } catch (err) {
      setError(err.response?.data?.message || 'Une erreur est survenue.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete('/api/me');
      logout();
      navigate('/');
    } catch {
      setError('Impossible de supprimer le compte.');
    }
  };

  return (
    <div className="page">
      <div className="profile-container">
        <h1 className="profile-title">Mon profil</h1>

        <form onSubmit={handleSave} className="profile-form">
          <h2>Informations personnelles</h2>

          {successMsg && <div className="alert alert-success">{successMsg}</div>}
          {error && <div className="alert alert-error">{error}</div>}

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="firstname">Prénom</label>
              <input
                id="firstname"
                name="firstname"
                type="text"
                value={form.firstname}
                onChange={handleChange}
                required
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
              required
            />
          </div>

          <h2>Changer le mot de passe</h2>
          <p className="form-hint">Laissez vide pour ne pas changer le mot de passe.</p>

          <div className="form-group">
            <label htmlFor="password">Nouveau mot de passe</label>
            <input
              id="password"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              autoComplete="new-password"
            />
          </div>
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirmer le mot de passe</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={handleChange}
              autoComplete="new-password"
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
          </button>
        </form>

        <div className="profile-activity">
          <h2>Mon activité</h2>
          <div className="activity-tabs">
            <button
              className={'activity-tab' + (activeTab === 'favorites' ? ' active' : '')}
              onClick={() => setActiveTab('favorites')}
            >
              Favoris ({activity?.favoriteResources?.length ?? '…'})
            </button>
            <button
              className={'activity-tab' + (activeTab === 'read' ? ' active' : '')}
              onClick={() => setActiveTab('read')}
            >
              Consultées ({activity?.readResources?.length ?? '…'})
            </button>
            <button
              className={'activity-tab' + (activeTab === 'exercises' ? ' active' : '')}
              onClick={() => setActiveTab('exercises')}
            >
              Exercices ({activity?.completedExercises?.length ?? '…'})
            </button>
          </div>

          <div className="activity-list">
            {activeTab === 'favorites' && (
              activity?.favoriteResources?.length === 0
                ? <p className="activity-empty">Aucune ressource en favori.</p>
                : activity?.favoriteResources?.map((r) => (
                  <Link key={r.id} to={`/resources/${r.id}`} className="activity-item">
                    <span className="activity-item-title">{r.title}</span>
                    <span className="badge">{r.type}</span>
                  </Link>
                ))
            )}
            {activeTab === 'read' && (
              activity?.readResources?.length === 0
                ? <p className="activity-empty">Aucune ressource consultée.</p>
                : activity?.readResources?.map((r) => (
                  <Link key={r.id} to={`/resources/${r.id}`} className="activity-item">
                    <span className="activity-item-title">{r.title}</span>
                    <span className="badge">{r.type}</span>
                  </Link>
                ))
            )}
            {activeTab === 'exercises' && (
              activity?.completedExercises?.length === 0
                ? <p className="activity-empty">Aucun exercice complété.</p>
                : activity?.completedExercises?.map((e) => (
                  <Link key={e.id} to={`/breathing-exercices/${e.id}`} className="activity-item">
                    <span className="activity-item-title">{e.name}</span>
                    <span className="badge">{e.type}</span>
                  </Link>
                ))
            )}
          </div>
        </div>

        <div className="profile-delete-section">
          <p>La suppression de votre compte est irréversible. Toutes vos données seront perdues.</p>

          {!showDeleteConfirm ? (
            <button
              className="btn btn-danger"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Supprimer mon compte
            </button>
          ) : (
            <div className="delete-confirm">
              <p>Êtes-vous sûr(e) ? Cette action est définitive.</p>
              <div className="delete-confirm-actions">
                <button className="btn btn-danger" onClick={handleDelete}>
                  Oui, supprimer mon compte
                </button>
                <button className="btn btn-outline" onClick={() => setShowDeleteConfirm(false)}>
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
