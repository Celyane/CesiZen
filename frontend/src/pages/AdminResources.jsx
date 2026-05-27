import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { deleteResource } from '../api/resources';
import AdminLayout from '../components/AdminLayout';

export default function AdminResources() {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get('/api/admin/resources')
      .then((res) => setResources(res.data))
      .finally(() => setLoading(false));
  }, []);

  const flash = (text) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 3000);
  };

  const handleToggleVisibility = async (id) => {
    try {
      const res = await api.patch(`/api/admin/resources/${id}/visibility`);
      setResources((prev) =>
        prev.map((r) => r.id === id ? { ...r, visible: res.data.visible } : r)
      );
    } catch {
      flash('Erreur lors du changement de visibilité.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette ressource ?')) return;
    try {
      await deleteResource(id);
      setResources((prev) => prev.filter((r) => r.id !== id));
      flash('Ressource supprimée.');
    } catch {
      flash('Erreur lors de la suppression.');
    }
  };

  if (loading) return <AdminLayout><div className="loading">Chargement...</div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="admin-page">
        <div className="admin-page-header">
          <h1 className="admin-page-title">Ressources</h1>
          <Link to="/resources/new" className="btn btn-primary">+ Créer</Link>
        </div>

        {msg && <div className="alert alert-success">{msg}</div>}

        <div className="table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Titre</th>
                <th>Type</th>
                <th>Auteur</th>
                <th>Statut</th>
                <th>Vues</th>
                <th>Favoris</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/resources/${r.id}`}>{r.title}</Link>
                  </td>
                  <td><span className="badge">{r.type}</span></td>
                  <td>{r.author.firstname} {r.author.lastname}</td>
                  <td>
                    <button
                      className={`btn btn-sm ${r.visible ? 'btn-outline btn-suspend' : 'btn-warning'}`}
                      onClick={() => handleToggleVisibility(r.id)}
                      title={r.visible ? 'Suspendre la ressource' : 'Réactiver la ressource'}
                    >
                      {r.visible ? 'Suspendre' : '⚠ Suspendue'}
                    </button>
                  </td>
                  <td>{r.readCount}</td>
                  <td>{r.favoriteCount}</td>
                  <td>{r.createdAt}</td>
                  <td className="table-actions">
                    <Link to={`/resources/${r.id}/edit`} className="btn btn-sm btn-outline">
                      Modifier
                    </Link>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDelete(r.id)}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="table-count">{resources.length} ressource{resources.length > 1 ? 's' : ''} au total.</p>
      </div>
    </AdminLayout>
  );
}
