import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button"


interface HealthData {
  status: string;
  message?: string;
  timestamp?: string;
}

function App() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthStatus, setHealthStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [healthError, setHealthError] = useState<string | null>(null);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';

  const checkHealth = async () => {
    setHealthStatus('loading');
    setHealthError(null);
    try {
      const response = await fetch(`${apiUrl}/health`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: HealthData = await response.json();
      setHealth(data);
      setHealthStatus('success');
    } catch (err) {
      setHealthStatus('error');
      setHealthError(err instanceof Error ? err.message : 'Unknown error occurred');
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <>
      <section id="center">
        <div>
          <h1>SupportMind</h1>
          <p>
            Connected to Backend at: <code>{apiUrl}</code>
          </p>
        </div>

        {/* Backend Health Check Box */}
        <div
          style={{
            margin: '16px auto 24px',
            padding: '16px 20px',
            borderRadius: '12px',
            border: `1px solid ${healthStatus === 'success'
              ? '#10b981'
              : healthStatus === 'error'
                ? '#ef4444'
                : '#6366f1'
              }`,
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            maxWidth: '460px',
            width: '100%',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>Backend Health Status:</strong>
            <span
              style={{
                fontWeight: 600,
                color:
                  healthStatus === 'success'
                    ? '#10b981'
                    : healthStatus === 'error'
                      ? '#ef4444'
                      : '#fbbf24',
              }}
            >
              {healthStatus === 'loading' && 'Checking...'}
              {healthStatus === 'success' && 'Healthy (Connected)'}
              {healthStatus === 'error' && 'Connection Failed'}
              {healthStatus === 'idle' && 'Idle'}
            </span>
          </div>

          {healthStatus === 'success' && health && (
            <div style={{ marginTop: '10px', fontSize: '14px', opacity: 0.9 }}>
              <div>Status: <strong>{health.status}</strong></div>
              {health.message && <div>Message: {health.message}</div>}
              {health.timestamp && (
                <div>Checked at: {new Date(health.timestamp).toLocaleTimeString()}</div>
              )}
            </div>
          )}

          {healthStatus === 'error' && (
            <div style={{ marginTop: '10px', fontSize: '14px', color: '#f87171' }}>
              Error: {healthError}
            </div>
          )}

          <button
            type="button"
            className="counter"
            onClick={checkHealth}
            style={{ marginTop: '12px', marginBottom: 0, width: '100%', cursor: 'pointer' }}
          >
            Refresh Health Check
          </button>
        </div>

        <div className="flex min-h-svh flex-col items-center justify-center">
          <Button>Click me</Button>
        </div>
      </section>
    </>
  );
}

export default App;
