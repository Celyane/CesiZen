import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import AdminLayout from '../components/AdminLayout';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/admin/stats')
      .then((res) => setStats(res.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <AdminLayout><div className="loading">Chargement...</div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="admin-page">
        <h1 className="admin-page-title">Tableau de bord</h1>

        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-value">{stats.usersCount}</span>
            <span className="stat-label">Utilisateurs</span>
            <Link to="/admin/users" className="stat-link">Gérer →</Link>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.resourcesCount}</span>
            <span className="stat-label">Ressources</span>
            <span className="stat-sub">{stats.visibleResourcesCount} publiées</span>
            <Link to="/admin/resources" className="stat-link">Gérer →</Link>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.exercicesCount}</span>
            <span className="stat-label">Exercices de respiration</span>
            <Link to="/admin/breathing-exercices" className="stat-link">Gérer →</Link>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
