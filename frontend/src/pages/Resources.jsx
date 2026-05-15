import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getResources } from '../api/resources';
import { useAuth } from '../context/AuthContext';

const TYPE_LABELS = {
  article: 'Article',
  video: 'Vidéo',
  audio: 'Audio',
  tool: 'Outil',
};

export default function Resources() {
  const { isAuthenticated, hasRole } = useAuth();
  const navigate = useNavigate();

  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    getResources()
      .then((res) => setResources(res.data))
      .catch(() => setError('Impossible de charger les ressources.'))
      .finally(() => setLoading(false));
  }, []);

  const types = ['all', ...Object.keys(TYPE_LABELS)];

  const filtered = typeFilter === 'all'
    ? resources
    : resources.filter((r) => r.type === typeFilter);

  if (loading) return <div className="loading">Chargement des ressources...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Ressources</h1>
        {isAuthenticated && hasRole('ROLE_REDACTOR') && (
          <Link to="/resources/new" className="btn btn-primary">
            + Nouvelle ressource
          </Link>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="filter-bar">
        {types.map((t) => (
          <button
            key={t}
            className={`filter-btn ${typeFilter === t ? 'active' : ''}`}
            onClick={() => setTypeFilter(t)}
          >
            {t === 'all' ? 'Tous' : TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="empty-state">Aucune ressource trouvée.</p>
      ) : (
        <div className="card-grid">
          {filtered.map((resource) => (
            <div
              key={resource.id}
              className="card resource-card"
              onClick={() => navigate(`/resources/${resource.id}`)}
            >
              {resource.image && (
                <img src={resource.image} alt={resource.title} className="card-image" />
              )}
              <div className="card-body">
                <div className="card-meta">
                  <span className={`badge badge-type badge-${resource.type}`}>
                    {TYPE_LABELS[resource.type] || resource.type}
                  </span>
                  {resource.isFavorite && (
                    <span className="badge badge-favorite">⭐ Favori</span>
                  )}
                  {resource.isRead && (
                    <span className="badge badge-read">✓ Lu</span>
                  )}
                </div>
                <h3 className="card-title">{resource.title}</h3>
                <p className="card-author">
                  Par {resource.author?.firstname} {resource.author?.lastname}
                </p>
                <p className="card-date">
                  {new Date(resource.createdAt).toLocaleDateString('fr-FR')}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
