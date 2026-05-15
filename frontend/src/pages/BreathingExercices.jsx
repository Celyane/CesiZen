import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getBreathingExercices, deleteBreathingExercice } from '../api/breathingExercices';
import { useAuth } from '../context/AuthContext';

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}min`;
  return `${m}min ${s}s`;
}

export default function BreathingExercices() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();

  const [exercices, setExercices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getBreathingExercices()
      .then((res) => setExercices(res.data))
      .catch(() => setError('Impossible de charger les exercices.'))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Supprimer cet exercice ?')) return;
    try {
      await deleteBreathingExercice(id);
      setExercices((prev) => prev.filter((ex) => ex.id !== id));
    } catch {
      alert('Erreur lors de la suppression.');
    }
  };

  if (loading) return <div className="loading">Chargement des exercices...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Exercices de respiration</h1>
        {hasRole('ROLE_ADMIN') && (
          <Link to="/breathing-exercices/new" className="btn btn-primary">
            + Nouvel exercice
          </Link>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {exercices.length === 0 ? (
        <p className="empty-state">Aucun exercice disponible pour le moment.</p>
      ) : (
        <div className="card-grid">
          {exercices.map((ex) => (
            <div
              key={ex.id}
              className="card breathing-card"
              onClick={() => navigate(`/breathing-exercices/${ex.id}`)}
            >
              <div className="card-body">
                <div className="card-meta">
                  <span className="badge badge-type">{ex.type}</span>
                  {ex.isDone && <span className="badge badge-done">✓ Fait</span>}
                </div>
                <h3 className="card-title">{ex.name}</h3>
                <p className="card-description">{ex.description}</p>
                <div className="breathing-info">
                  <span>⏱ {formatDuration(ex.duration)}</span>
                  <span>🔄 {ex.numberCycle} cycles</span>
                </div>
                <div className="breathing-phases">
                  <span>Inspir: {ex.timeInhale}s</span>
                  {ex.timeHold && <span>Rétention: {ex.timeHold}s</span>}
                  <span>Expir: {ex.timeExhale}s</span>
                </div>
                {hasRole('ROLE_ADMIN') && (
                  <div className="card-admin-actions" onClick={(e) => e.stopPropagation()}>
                    <Link
                      to={`/breathing-exercices/${ex.id}/edit`}
                      className="btn btn-sm btn-outline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Modifier
                    </Link>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={(e) => handleDelete(e, ex.id)}
                    >
                      Supprimer
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
