import { useState, useEffect } from 'react';
import { getUsers, updateUserRole, deleteUser } from '../api/users';
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

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

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
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}

      <div className="table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nom</th>
              <th>Email</th>
              <th>Rôle</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const primaryRole = getPrimaryRole(u.roles);
              const isSelf = u.id === currentUser?.id;
              return (
                <tr key={u.id} className={isSelf ? 'row-self' : ''}>
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
