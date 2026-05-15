import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getBreathingExercice, createBreathingExercice, updateBreathingExercice } from '../api/breathingExercices';

const TYPES = ['relaxation', 'cohérence', 'énergie', 'sommeil', 'autre'];

export default function BreathingExerciceForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = !!id;

  const [form, setForm] = useState({
    name: '',
    description: '',
    type: 'relaxation',
    timeInhale: 4,
    timeHold: '',
    timeExhale: 4,
    numberCycle: 5,
  });
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(isEditing);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isEditing) {
      getBreathingExercice(id)
        .then((res) => {
          const ex = res.data;
          setForm({
            name: ex.name || '',
            description: ex.description || '',
            type: ex.type || 'relaxation',
            timeInhale: ex.timeInhale || 4,
            timeHold: ex.timeHold ?? '',
            timeExhale: ex.timeExhale || 4,
            numberCycle: ex.numberCycle || 5,
          });
        })
        .catch(() => setError('Impossible de charger l\'exercice.'))
        .finally(() => setFetchLoading(false));
    }
  }, [id, isEditing]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const timeInhale = parseInt(form.timeInhale, 10);
    const timeHold = form.timeHold !== '' ? parseInt(form.timeHold, 10) : null;
    const timeExhale = parseInt(form.timeExhale, 10);
    const numberCycle = parseInt(form.numberCycle, 10);
    const duration = (timeInhale + (timeHold ?? 0) + timeExhale) * numberCycle;

    const payload = {
      name: form.name,
      description: form.description,
      type: form.type,
      duration,
      timeInhale,
      timeHold,
      timeExhale,
      numberCycle,
    };

    try {
      if (isEditing) {
        await updateBreathingExercice(id, payload);
        navigate(`/breathing-exercices/${id}`);
      } else {
        const res = await createBreathingExercice(payload);
        navigate(`/breathing-exercices/${res.data.id}`);
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error;
      setError(msg || 'Erreur lors de l\'enregistrement.');
    } finally {
      setLoading(false);
    }
  };

  if (fetchLoading) return <div className="loading">Chargement...</div>;

  return (
    <div className="page form-page">
      <div className="page-header">
        <button
          className="btn btn-ghost"
          onClick={() => navigate(isEditing ? `/breathing-exercices/${id}` : '/breathing-exercices')}
        >
          &larr; Retour
        </button>
        <h1>{isEditing ? 'Modifier l\'exercice' : 'Nouvel exercice'}</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit} className="form form-large">
        <div className="form-group">
          <label htmlFor="name">Nom *</label>
          <input
            id="name"
            name="name"
            type="text"
            value={form.name}
            onChange={handleChange}
            placeholder="Cohérence cardiaque"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="type">Type *</label>
          <select id="type" name="type" value={form.type} onChange={handleChange} required>
            {TYPES.map((t) => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            value={form.description}
            onChange={handleChange}
            placeholder="Description de l'exercice..."
            rows={4}
          />
        </div>

        <div className="form-row form-row-4">
          <div className="form-group">
            <label htmlFor="timeInhale">Inspiration (s) *</label>
            <input
              id="timeInhale"
              name="timeInhale"
              type="number"
              value={form.timeInhale}
              onChange={handleChange}
              min={1}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="timeHold">Rétention (s) <em>(optionnel)</em></label>
            <input
              id="timeHold"
              name="timeHold"
              type="number"
              value={form.timeHold}
              onChange={handleChange}
              min={0}
              placeholder="—"
            />
          </div>
          <div className="form-group">
            <label htmlFor="timeExhale">Expiration (s) *</label>
            <input
              id="timeExhale"
              name="timeExhale"
              type="number"
              value={form.timeExhale}
              onChange={handleChange}
              min={1}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="numberCycle">Cycles *</label>
            <input
              id="numberCycle"
              name="numberCycle"
              type="number"
              value={form.numberCycle}
              onChange={handleChange}
              min={1}
              required
            />
          </div>
        </div>

        {(() => {
          const inhale = parseInt(form.timeInhale) || 0;
          const hold = parseInt(form.timeHold) || 0;
          const exhale = parseInt(form.timeExhale) || 0;
          const cycles = parseInt(form.numberCycle) || 0;
          const total = (inhale + hold + exhale) * cycles;
          return (
            <p className="duration-preview">
              Durée totale calculée : <strong>{total}s</strong>
              {total >= 60 && <> ({Math.floor(total / 60)}min {total % 60 > 0 ? `${total % 60}s` : ''})</>}
            </p>
          );
        })()}

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => navigate(isEditing ? `/breathing-exercices/${id}` : '/breathing-exercices')}
          >
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Enregistrement...' : (isEditing ? 'Mettre à jour' : 'Créer l\'exercice')}
          </button>
        </div>
      </form>
    </div>
  );
}
