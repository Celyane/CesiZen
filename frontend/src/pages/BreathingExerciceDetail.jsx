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
  const { hasRole } = useAuth();

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

  const intervalRef = useRef(null);
  const stateRef = useRef({ phaseIndex: 0, countdown: 0, currentCycle: 0 });

  useEffect(() => {
    getBreathingExercice(id)
      .then((res) => {
        setExercice(res.data);
        setIsDone(res.data.isDone);
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
    try {
      await completeBreathingExercice(id);
    } catch {
      // silently ignore – mark local state anyway
    }
  }, [id, stopTimer]);

  const startTimer = useCallback(() => {
    if (!exercice) return;
    const phases = buildPhases(exercice);

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
        // Move to next phase
        let nextPhase = stateRef.current.phaseIndex + 1;

        if (nextPhase >= phases.length) {
          // End of a cycle
          nextPhase = 0;
          stateRef.current.currentCycle += 1;

          if (stateRef.current.currentCycle >= exercice.numberCycle) {
            // All cycles done
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
  }, [exercice, handleComplete]);

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

  // Circle animation scale: inhale = big, hold = big, exhale = small
  const circleScale = isRunning
    ? (currentPhase?.key === 'exhale' ? 0.5 : 1)
    : 0.75;

  // Progress for the circle fill (countdown within phase)
  const phaseProgress = isRunning && currentPhase
    ? (countdown / currentPhase.duration)
    : 0;

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
          <p className="breathing-description">{exercice.description}</p>

          <div className="breathing-stats">
            <div className="stat">
              <span className="stat-label">Durée totale</span>
              <span className="stat-value">{formatDuration(exercice.duration)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Cycles</span>
              <span className="stat-value">{exercice.numberCycle}</span>
            </div>
          </div>

          <div className="breathing-phases-detail">
            <div className="phase-item">
              <span className="phase-label">Inspiration</span>
              <span className="phase-duration">{exercice.timeInhale}s</span>
            </div>
            {exercice.timeHold && (
              <div className="phase-item">
                <span className="phase-label">Rétention</span>
                <span className="phase-duration">{exercice.timeHold}s</span>
              </div>
            )}
            <div className="phase-item">
              <span className="phase-label">Expiration</span>
              <span className="phase-duration">{exercice.timeExhale}s</span>
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
              <p>Félicitations, vous avez complété les {exercice.numberCycle} cycles.</p>
              <button className="btn btn-primary" onClick={() => { setCompleted(false); setIsRunning(false); }}>
                Recommencer
              </button>
            </div>
          ) : (
            <>
              <div className="breathing-circle-wrapper">
                <div
                  className={`breathing-circle ${isRunning ? `phase-${currentPhase?.key}` : ''}`}
                  style={{
                    transform: `scale(${circleScale})`,
                    transition: isRunning
                      ? `transform ${currentPhase?.key === 'hold' ? 0 : countdown}s ease-in-out`
                      : 'transform 0.5s ease',
                  }}
                >
                  {isRunning ? (
                    <>
                      <span className="circle-phase">{currentPhase?.label}</span>
                      <span className="circle-countdown">{countdown}</span>
                    </>
                  ) : (
                    <span className="circle-phase">Prêt ?</span>
                  )}
                </div>
              </div>

              {isRunning && (
                <div className="cycle-progress">
                  Cycle {currentCycle + 1} / {exercice.numberCycle}
                </div>
              )}

              <div className="timer-controls">
                {!isRunning ? (
                  <button className="btn btn-primary btn-large" onClick={startTimer}>
                    ▶ Commencer
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
