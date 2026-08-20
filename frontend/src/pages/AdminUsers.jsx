import { useState, useEffect } from 'react';
import { getUsers, createUser, updateUserRole, toggleUserActive, deleteUser } from '../api/users';
import { useAuth } from '../context/AuthContext';
import AdminLayout from '../components/AdminLayout';

const ROLES = ['ROLE_USER', 'ROLE_REDACTOR', 'ROLE_ADMIN'];

const ROLE_LABELS = {
  ROLE_USER: 'Utilisateur',
  ROLE_REDACTOR: 'Rédacteur',
  ROLE_ADMIN: 'Administrateur',
};

function getPrimaryRole(roles) {
  if (!roles) return 'ROLE_USER';
  if (roles.includes('ROLE_ADMIN')) return 'ROLE_ADMIN';
  if (roles.includes('ROLE_REDACTOR')) return 'ROLE_REDACTOR';
  return 'ROLE_USER';
}

const EMPTY_FORM = { firstname: '', lastname: '', email: '', password: '', role: 'ROLE_USER' };

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    getUsers()
      .then((res) => setUsers(res.data))
      .catch(() => setError('Impossible de charger les utilisateurs.'))
      .finally(() => setLoading(false));
  }, []);

  const handleRoleChange = async (userId, newRole) => {
    setSuccessMsg('');
    try {
      await updateUserRole(userId, newRole);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, roles: [newRole] } : u
        )
      );
      setSuccessMsg('Rôle mis à jour avec succès.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setError('Erreur lors de la mise à jour du rôle.');
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFormLoading(true);
    try {
      const res = await createUser(form);
      setUsers((prev) => [...prev, res.data]);
      setSuccessMsg('Utilisateur créé avec succès.');
      setTimeout(() => setSuccessMsg(''), 3000);
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (err) {
      const msg = err.response?.data?.message || 'Erreur lors de la création.';
      setError(msg);
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleActive = async (userId) => {
    setSuccessMsg('');
    try {
      const res = await toggleUserActive(userId);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, isActive: res.data.isActive } : u))
      );
      setSuccessMsg(res.data.isActive ? 'Compte réactivé.' : 'Compte désactivé.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setError('Erreur lors de la modification du statut du compte.');
    }
  };

  const handleDelete = async (userId) => {
    if (userId === currentUser?.id) {
      alert('Vous ne pouvez pas supprimer votre propre compte.');
      return;
    }
    if (!window.confirm('Supprimer cet utilisateur ? Cette action est irréversible.')) return;
    try {
      await deleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setSuccessMsg('Utilisateur supprimé.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setError('Erreur lors de la suppression.');
    }
  };

  if (loading) return <AdminLayout><div className="loading">Chargement...</div></AdminLayout>;

  return (
    <AdminLayout>
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Utilisateurs</h1>
        <button className="btn btn-primary" onClick={() => { setShowForm((v) => !v); setError(''); }}>
          {showForm ? 'Annuler' : '+ Nouvel utilisateur'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}

      {showForm && (
        <form onSubmit={handleCreateSubmit} className="form admin-create-form">
          <div className="form-row form-row-2">
            <div className="form-group">
              <label htmlFor="new-firstname">Prénom *</label>
              <input
                id="new-firstname"
                type="text"
                value={form.firstname}
                onChange={(e) => setForm({ ...form, firstname: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="new-lastname">Nom *</label>
              <input
                id="new-lastname"
                type="text"
                value={form.lastname}
                onChange={(e) => setForm({ ...form, lastname: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label htmlFor="new-email">Email *</label>
              <input
                id="new-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="new-password">Mot de passe *</label>
              <input
                id="new-password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={6}
              />
            </div>
          </div>
          <div className="form-group form-group-inline">
            <label htmlFor="new-role">Rôle</label>
            <select
              id="new-role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={formLoading}>
              {formLoading ? 'Création...' : 'Créer l\'utilisateur'}
            </button>
          </div>
        </form>
      )}

      <div className="table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nom</th>
              <th>Email</th>
              <th>Rôle</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const primaryRole = getPrimaryRole(u.roles);
              const isSelf = u.id === currentUser?.id;
              return (
                <tr key={u.id} className={`${isSelf ? 'row-self' : ''} ${u.isActive === false ? 'row-inactive' : ''}`}>
                  <td>{u.id}</td>
                  <td>
                    {u.firstname} {u.lastname}
                    {isSelf && <span className="badge badge-self">Vous</span>}
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <select
                      value={primaryRole}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      disabled={isSelf}
                      className="role-select"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className={`badge ${u.isActive === false ? 'badge-inactive' : 'badge-active'}`}>
                      {u.isActive === false ? 'Désactivé' : 'Actif'}
                    </span>
                  </td>
                  <td className="actions-cell">
                    <button
                      className={`btn btn-sm ${u.isActive === false ? 'btn-success' : 'btn-warning'}`}
                      onClick={() => handleToggleActive(u.id)}
                      disabled={isSelf}
                      title={isSelf ? 'Vous ne pouvez pas modifier votre propre compte' : (u.isActive === false ? 'Réactiver' : 'Désactiver')}
                    >
                      {u.isActive === false ? 'Réactiver' : 'Désactiver'}
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDelete(u.id)}
                      disabled={isSelf}
                      title={isSelf ? 'Vous ne pouvez pas supprimer votre propre compte' : 'Supprimer'}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="table-count">{users.length} utilisateur{users.length > 1 ? 's' : ''} au total.</p>
    </div>
    </AdminLayout>
  );
}
