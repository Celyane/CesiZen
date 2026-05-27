import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getBreathingExercice, completeBreathingExercice } from '../api/breathingExercices';
import { useAuth } from '../context/AuthContext';

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} secondes`;
  if (s === 0) return `${m} minute${m > 1 ? 's' : ''}`;
  return `${m}min ${s}s`;
}

// Phase definitions
function buildPhases(ex) {
  const phases = [];
  phases.push({ label: 'Inspirez', duration: ex.timeInhale, key: 'inhale' });
  if (ex.timeHold) {
    phases.push({ label: 'Retenez', duration: ex.timeHold, key: 'hold' });
  }
  phases.push({ label: 'Expirez', duration: ex.timeExhale, key: 'exhale' });
  return phases;
}

export default function BreathingExerciceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole, isAuthenticated } = useAuth();

  const [exercice, setExercice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Timer state
  const [isRunning, setIsRunning] = useState(false);
  const [currentCycle, setCurrentCycle] = useState(0);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [isDone, setIsDone] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [customCycles, setCustomCycles] = useState(null);

  const intervalRef = useRef(null);
  const stateRef = useRef({ phaseIndex: 0, countdown: 0, currentCycle: 0 });

  useEffect(() => {
    getBreathingExercice(id)
      .then((res) => {
        setExercice(res.data);
        setIsDone(res.data.isDone);
        setCustomCycles(res.data.numberCycle);
      })
      .catch(() => setError('Exercice introuvable.'))
      .finally(() => setLoading(false));
  }, [id]);

  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
  }, []);

  const handleComplete = useCallback(async () => {
    stopTimer();
    setCompleted(true);
    setIsDone(true);
    if (isAuthenticated) {
      try {
        await completeBreathingExercice(id);
      } catch {
        // silently ignore – mark local state anyway
      }
    }
  }, [id, isAuthenticated, stopTimer]);

  const startTimer = useCallback(() => {
    if (!exercice || !customCycles) return;
    const phases = buildPhases(exercice);
    const totalCycles = customCycles;

    // Reset
    setCurrentCycle(0);
    setPhaseIndex(0);
    setCountdown(phases[0].duration);
    setIsRunning(true);
    setCompleted(false);

    stateRef.current = {
      phaseIndex: 0,
      countdown: phases[0].duration,
      currentCycle: 0,
    };

    intervalRef.current = setInterval(() => {
      stateRef.current.countdown -= 1;

      if (stateRef.current.countdown <= 0) {
        let nextPhase = stateRef.current.phaseIndex + 1;

        if (nextPhase >= phases.length) {
          nextPhase = 0;
          stateRef.current.currentCycle += 1;

          if (stateRef.current.currentCycle >= totalCycles) {
            setCurrentCycle(stateRef.current.currentCycle);
            setPhaseIndex(0);
            setCountdown(0);
            handleComplete();
            return;
          }
          setCurrentCycle(stateRef.current.currentCycle);
        }

        stateRef.current.phaseIndex = nextPhase;
        stateRef.current.countdown = phases[nextPhase].duration;
        setPhaseIndex(nextPhase);
      }

      setCountdown(stateRef.current.countdown);
    }, 1000);
  }, [exercice, handleComplete, customCycles]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleStop = () => {
    stopTimer();
    setCurrentCycle(0);
    setPhaseIndex(0);
    setCountdown(exercice ? buildPhases(exercice)[0].duration : 0);
  };

  if (loading) return <div className="loading">Chargement...</div>;
  if (error) return <div className="page"><div className="alert alert-error">{error}</div></div>;
  if (!exercice) return null;

  const phases = buildPhases(exercice);
  const currentPhase = phases[phaseIndex];

  const cycles = customCycles ?? exercice.numberCycle;
  const cycleDuration = exercice.timeInhale + (exercice.timeHold || 0) + exercice.timeExhale;
  const computedDuration = cycles * cycleDuration;

  const BAR_HEIGHT = 360;
  const BALL_SIZE = 52;
  const BALL_PADDING = 8;

  const ballTop = !isRunning
    ? (BAR_HEIGHT - BALL_SIZE) / 2
    : currentPhase?.key === 'exhale'
    ? BAR_HEIGHT - BALL_SIZE - BALL_PADDING
    : BALL_PADDING;

  const ballTransition = !isRunning
    ? 'top 0.6s ease'
    : currentPhase?.key === 'hold'
    ? 'top 0s'
    : currentPhase?.key === 'inhale'
    ? `top ${exercice.timeInhale}s ease-in-out`
    : `top ${exercice.timeExhale}s ease-in-out`;

  return (
    <div className="page breathing-detail">
      <div className="detail-header">
        <button className="btn btn-ghost" onClick={() => navigate('/breathing-exercices')}>
          &larr; Retour
        </button>
        {hasRole('ROLE_ADMIN') && (
          <div className="detail-actions">
            <Link to={`/breathing-exercices/${id}/edit`} className="btn btn-outline">
              Modifier
            </Link>
          </div>
        )}
      </div>

      <div className="breathing-detail-layout">
        <div className="breathing-info-panel">
          <span className="badge badge-type">{exercice.type}</span>
          <h1>{exercice.name}</h1>

          <div className="breathing-phases-inline">
            <span>Inspiration <strong>{exercice.timeInhale}s</strong></span>
            {exercice.timeHold && <span>· Rétention <strong>{exercice.timeHold}s</strong></span>}
            <span>· Expiration <strong>{exercice.timeExhale}s</strong></span>
          </div>

          <p className="breathing-description">{exercice.description}</p>

          <div className="breathing-stats">
            <div className="stat">
              <span className="stat-label">Durée estimée</span>
              <span className="stat-value">{formatDuration(computedDuration)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Cycles</span>
              <div className="cycles-control">
                <button
                  className="cycles-btn"
                  onClick={() => setCustomCycles(Math.max(1, cycles - 1))}
                  disabled={isRunning || cycles <= 1}
                >−</button>
                <span className="cycles-value">{cycles}</span>
                <button
                  className="cycles-btn"
                  onClick={() => setCustomCycles(cycles + 1)}
                  disabled={isRunning}
                >+</button>
              </div>
            </div>
          </div>

          {isDone && !completed && (
            <div className="alert alert-success">✓ Vous avez déjà complété cet exercice.</div>
          )}
        </div>

        <div className="breathing-timer-panel">
          {completed ? (
            <div className="completed-message">
              <div className="completed-icon">✓</div>
              <h2>Exercice terminé !</h2>
              <p>Félicitations, vous avez complété les {cycles} cycles.</p>
              <button className="btn btn-primary" onClick={() => { setCompleted(false); setIsRunning(false); }}>
                Recommencer
              </button>
            </div>
          ) : (
            <>
              <div className="breathing-bar-wrapper">
                <div className="bar-status">
                  <span className="bar-phase-label">
                    {isRunning ? currentPhase?.label : 'Prêt ?'}
                  </span>
                  {isRunning && <span className="bar-countdown">{countdown}</span>}
                </div>

                <div className="breathing-bar-track">
                  <div
                    className={`breathing-ball${isRunning ? ` ball-${currentPhase?.key}` : ''}`}
                    style={{
                      top: `${ballTop}px`,
                      transition: ballTransition,
                    }}
                  />
                </div>

                {isRunning && (
                  <div className="cycle-progress">
                    Cycle {currentCycle + 1} / {cycles}
                  </div>
                )}
              </div>

              <div className="timer-controls">
                {!isRunning ? (
                  <button className="btn btn-primary btn-large" onClick={startTimer}>
                    Lancer la séance
                  </button>
                ) : (
                  <button className="btn btn-danger" onClick={handleStop}>
                    ■ Arrêter
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
