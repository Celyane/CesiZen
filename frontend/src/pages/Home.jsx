import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getResources } from '../api/resources';

const EXERCISE_PREVIEWS = [
  { name: 'Cohérence cardiaque', type: 'relaxation', detail: '5s inspiration · 5s expiration · 6 cycles' },
  { name: 'Respiration 4-7-8', type: 'sommeil', detail: '4s inspiration · 7s rétention · 8s expiration' },
  { name: 'Boxe breathing', type: 'énergie', detail: '4s inspiration · 4s rétention · 4s expiration · 4 cycles' },
  { name: 'Respiration abdominale', type: 'relaxation', detail: '6s inspiration · 6s expiration · 8 cycles' },
];

export default function Home() {
  const { isAuthenticated, user } = useAuth();
  const [resources, setResources] = useState([]);

  useEffect(() => {
    getResources().then((res) => setResources(res.data.slice(0, 6)));
  }, []);

  return (
    <div className="home-page">

      {/* Inscription banner — non connecté uniquement, en haut */}
      {!isAuthenticated && (
        <div className="home-banner">
          <p>Inscrivez-vous gratuitement pour accéder aux exercices de respiration guidés.</p>
          <Link to="/register" className="btn btn-primary">S'inscrire</Link>
        </div>
      )}

      {/* Hero */}
      <div className="hero">
        {isAuthenticated && (
          <p className="hero-greeting">Bonjour, <strong>{user.firstname}</strong> !</p>
        )}
        <h1>Prenez soin de vous</h1>
        <p className="hero-subtitle">
          Ressources bien-être et exercices de respiration guidés pour retrouver calme et sérénité au quotidien.
        </p>
      </div>

      <div className="home-sections">

        {/* Resources carousel */}
        <section className="home-section">
          <h2 className="home-section-title">Ressources</h2>
          <div className="carousel">
            {resources.length === 0 ? (
              <p className="home-empty">Aucune ressource disponible pour le moment.</p>
            ) : (
              resources.map((r) => (
                <Link key={r.id} to={`/resources/${r.id}`} className="carousel-card">
                  <span className="badge">{r.type}</span>
                  <h3>{r.title}</h3>
                  <p>{r.text?.slice(0, 90)}{r.text?.length > 90 ? '…' : ''}</p>
                  <span className="carousel-card-author">
                    {r.author.firstname} {r.author.lastname}
                  </span>
                </Link>
              ))
            )}
          </div>
          <div className="home-section-footer">
            <Link to="/resources" className="btn btn-outline">Consulter toutes les ressources</Link>
          </div>
        </section>

        {/* Exercises carousel */}
        <section className="home-section">
          <h2 className="home-section-title">Exercices de respiration</h2>
          <div className="carousel">
            {EXERCISE_PREVIEWS.map((ex) => (
              <div
                key={ex.name}
                className={'carousel-card carousel-card--exercise' + (!isAuthenticated ? ' carousel-card--locked' : '')}
              >
                <span className="badge">{ex.type}</span>
                <h3>{ex.name}</h3>
                <p>{ex.detail}</p>
              </div>
            ))}
          </div>
          <div className="home-section-footer">
            {isAuthenticated ? (
              <Link to="/breathing-exercices" className="btn btn-outline">Consulter tous les exercices</Link>
            ) : (
              <Link to="/register" className="btn btn-outline">S'inscrire pour accéder aux exercices</Link>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
