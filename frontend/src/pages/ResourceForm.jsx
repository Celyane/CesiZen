import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getResource, createResource, updateResource } from '../api/resources';

const TYPES = ['article', 'video'];

const TYPE_LABELS = {
  article: 'Article',
  video: 'Vidéo',
};

export default function ResourceForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = !!id;

  const [form, setForm] = useState({
    title: '',
    text: '',
    type: 'article',
    image: '',
    visible: true,
  });
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(isEditing);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isEditing) {
      getResource(id)
        .then((res) => {
          const r = res.data;
          setForm({
            title: r.title || '',
            text: r.text || '',
            type: r.type || 'article',
            image: r.image || '',
            visible: r.visible ?? true,
          });
        })
        .catch(() => setError('Impossible de charger la ressource.'))
        .finally(() => setFetchLoading(false));
    }
  }, [id, isEditing]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const payload = {
      ...form,
      image: form.image || null,
    };

    try {
      if (isEditing) {
        await updateResource(id, payload);
        navigate(`/resources/${id}`);
      } else {
        const res = await createResource(payload);
        navigate(`/resources/${res.data.id}`);
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
        <button className="btn btn-ghost" onClick={() => navigate(isEditing ? `/resources/${id}` : '/resources')}>
          &larr; Retour
        </button>
        <h1>{isEditing ? 'Modifier la ressource' : 'Nouvelle ressource'}</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit} className="form form-large">
        <div className="form-group">
          <label htmlFor="title">Titre *</label>
          <input
            id="title"
            name="title"
            type="text"
            value={form.title}
            onChange={handleChange}
            placeholder="Titre de la ressource"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="type">Type *</label>
          <select id="type" name="type" value={form.type} onChange={handleChange} required>
            {TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="text">Contenu *</label>
          <textarea
            id="text"
            name="text"
            value={form.text}
            onChange={handleChange}
            placeholder="Contenu de la ressource..."
            rows={10}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="image">URL de l’image (optionnel)</label>
          <input
            id="image"
            name="image"
            type="url"
            value={form.image}
            onChange={handleChange}
            placeholder="https://..."
          />
        </div>

        <div className="form-group form-group-checkbox">
          <label>
            <input
              name="visible"
              type="checkbox"
              checked={form.visible}
              onChange={handleChange}
            />
            <span>Publier la ressource</span>
          </label>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => navigate(isEditing ? `/resources/${id}` : '/resources')}
          >
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Enregistrement...' : (isEditing ? 'Mettre à jour' : 'Créer la ressource')}
          </button>
        </div>
      </form>
    </div>
  );
}
