import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getResource, deleteResource, markResourceRead, toggleFavorite } from '../api/resources';
import { useAuth } from '../context/AuthContext';

const TYPE_LABELS = {
  article: 'Article',
  video: 'Vidéo',
  audio: 'Audio',
  tool: 'Outil',
};

export default function ResourceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, hasRole, isAuthenticated } = useAuth();

  const [resource, setResource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  useEffect(() => {
    getResource(id)
      .then((res) => setResource(res.data))
      .catch(() => setError('Ressource introuvable.'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleRead = async () => {
    try {
      await markResourceRead(id);
      setResource((r) => ({ ...r, isRead: true }));
      setActionMsg('Ressource marquée comme lue !');
    } catch {
      setActionMsg('Erreur lors du marquage.');
    }
  };

  const handleFavorite = async () => {
    try {
      const res = await toggleFavorite(id);
      setResource((r) => ({ ...r, isFavorite: res.data.isFavorite }));
    } catch {
      setActionMsg('Erreur lors de la mise à jour des favoris.');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Supprimer cette ressource ?')) return;
    try {
      await deleteResource(id);
      navigate('/resources');
    } catch {
      setActionMsg('Erreur lors de la suppression.');
    }
  };

  const isAuthorOrAdmin = () => {
    if (!user || !resource) return false;
    return resource.author?.id === user.id || hasRole('ROLE_ADMIN');
  };

  if (loading) return <div className="loading">Chargement...</div>;
  if (error) return <div className="page"><div className="alert alert-error">{error}</div></div>;
  if (!resource) return null;

  return (
    <div className="page resource-detail">
      <div className="detail-header">
        <button className="btn btn-ghost" onClick={() => navigate('/resources')}>
          &larr; Retour
        </button>
        <div className="detail-actions">
          {isAuthenticated && !resource.isRead && (
            <button className="btn btn-outline" onClick={handleRead}>
              ✓ Marquer comme lu
            </button>
          )}
          {isAuthenticated && resource.isRead && (
            <span className="badge badge-read">✓ Lu</span>
          )}
          {isAuthenticated && (
            <button
              className={`btn ${resource.isFavorite ? 'btn-favorite-active' : 'btn-outline'}`}
              onClick={handleFavorite}
              title={resource.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            >
              {resource.isFavorite ? '⭐ Favori' : '☆ Favori'}
            </button>
          )}
          {isAuthorOrAdmin() && (
            <>
              <Link to={`/resources/${id}/edit`} className="btn btn-outline">
                Modifier
              </Link>
              <button className="btn btn-danger" onClick={handleDelete}>
                Supprimer
              </button>
            </>
          )}
        </div>
      </div>

      {actionMsg && (
        <div className="alert alert-info">{actionMsg}</div>
      )}

      <div className="detail-content">
        <div className="detail-meta">
          <span className={`badge badge-type badge-${resource.type}`}>
            {TYPE_LABELS[resource.type] || resource.type}
          </span>
          {!resource.visible && (
            <span className="badge badge-draft">Non publié</span>
          )}
        </div>

        <h1 className="detail-title">{resource.title}</h1>

        <p className="detail-author">
          Par <strong>{resource.author?.firstname} {resource.author?.lastname}</strong>
          {' · '}
          {new Date(resource.createdAt).toLocaleDateString('fr-FR', {
            year: 'numeric', month: 'long', day: 'numeric'
          })}
        </p>

        {resource.image && (
          <img src={resource.image} alt={resource.title} className="detail-image" />
        )}

        <div className="detail-text">
          {resource.text?.split('\n').map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
