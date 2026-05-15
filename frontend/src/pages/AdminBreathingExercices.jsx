import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { deleteBreathingExercice } from '../api/breathingExercices';
import AdminLayout from '../components/AdminLayout';

export default function AdminBreathingExercices() {
  const [exercices, setExercices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get('/api/admin/breathing-exercices')
      .then((res) => setExercices(res.data))
      .finally(() => setLoading(false));
  }, []);

  const flash = (text) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 3000);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cet exercice ?')) return;
    try {
      await deleteBreathingExercice(id);
      setExercices((prev) => prev.filter((e) => e.id !== id));
      flash('Exercice supprimé.');
    } catch {
      flash('Erreur lors de la suppression.');
    }
  };

  if (loading) return <AdminLayout><div className="loading">Chargement...</div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="admin-page">
        <div className="admin-page-header">
          <h1 className="admin-page-title">Exercices de respiration</h1>
          <Link to="/breathing-exercices/new" className="btn btn-primary">+ Créer</Link>
        </div>

        {msg && <div className="alert alert-success">{msg}</div>}

        <div className="table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Type</th>
                <th>Durée</th>
                <th>Inspire</th>
                <th>Retenir</th>
                <th>Expire</th>
                <th>Cycles</th>
                <th>Complétés</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {exercices.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link to={`/breathing-exercices/${e.id}`}>{e.name}</Link>
                  </td>
                  <td><span className="badge">{e.type}</span></td>
                  <td>{e.duration}s</td>
                  <td>{e.timeInhale}s</td>
                  <td>{e.timeHold ? `${e.timeHold}s` : '—'}</td>
                  <td>{e.timeExhale}s</td>
                  <td>{e.numberCycle}</td>
                  <td>{e.completedByCount}</td>
                  <td className="table-actions">
                    <Link to={`/breathing-exercices/${e.id}/edit`} className="btn btn-sm btn-outline">
                      Modifier
                    </Link>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDelete(e.id)}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="table-count">{exercices.length} exercice{exercices.length > 1 ? 's' : ''} au total.</p>
      </div>
    </AdminLayout>
  );
}
