import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getResources } from '../api/resources';
import { getBreathingExercices } from '../api/breathingExercices';

export default function Home() {
  const { isAuthenticated, user } = useAuth();
  const [resources, setResources] = useState([]);
  const [exercices, setExercices] = useState([]);

  useEffect(() => {
    getResources().then((res) => setResources(res.data.slice(0, 6)));
    getBreathingExercices().then((res) => setExercices(res.data.slice(0, 4))).catch(() => {});
  }, []);

  return (
    <div className="home-page">

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
            {exercices.length === 0 ? (
              <p className="home-empty">Aucun exercice disponible pour le moment.</p>
            ) : (
              exercices.map((ex) => (
                <Link
                  key={ex.id}
                  to={`/breathing-exercices/${ex.id}`}
                  className="carousel-card carousel-card--exercise"
                >
                  <span className="badge">{ex.type}</span>
                  <h3>{ex.name}</h3>
                  <p>{ex.description?.slice(0, 90)}{ex.description?.length > 90 ? '…' : ''}</p>
                </Link>
              ))
            )}
          </div>
          <div className="home-section-footer">
            <Link to="/breathing-exercices" className="btn btn-outline">Consulter tous les exercices</Link>
          </div>
        </section>

      </div>
    </div>
  );
}
