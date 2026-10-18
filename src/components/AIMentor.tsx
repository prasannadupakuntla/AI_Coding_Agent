import { useState, useEffect } from 'react';
import type { MentorAction, AIProviderType, MentorResponse, ExecutionContext } from '../../server/types.ts';

interface AIMentorProps {
  code: string;
  executionState: ExecutionContext;
}

export function AIMentor({ code, executionState }: AIMentorProps) {
  const [activeAction, setActiveAction] = useState<MentorAction>('explain');
  const [question, setQuestion] = useState('');
  const [hintLevel, setHintLevel] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<MentorResponse | null>(null);
  const [provider, setProvider] = useState<AIProviderType>('google');
  const [customKey, setCustomKey] = useState<string>(() => sessionStorage.getItem('bytebot_api_key') || '');
  const [showSettings, setShowSettings] = useState(false);
  const [serverHasKey, setServerHasKey] = useState(false);

  // Check backend health & configured status
  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        if (data.status === 'ok') {
          setServerHasKey(data.hasEnvKey);
          if (data.configuredProvider) setProvider(data.configuredProvider);
        }
      })
      .catch(() => {
        // Dev server or static mode: gracefully fallback
      });
  }, []);

  const requestMentor = async (action: MentorAction, requestedHintLevel?: number, customQuestion?: string) => {
    setLoading(true);
    setActiveAction(action);
    if (action === 'hint') {
      const nextLevel = requestedHintLevel ?? (hintLevel >= 3 ? 1 : hintLevel);
      setHintLevel(nextLevel);
    }

    try {
      const res = await fetch('/api/mentor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(customKey ? { 'x-api-key': customKey } : {}),
        },
        body: JSON.stringify({
          action,
          code,
          studentQuestion: customQuestion || (action === 'ask' ? question : undefined),
          hintLevel: action === 'hint' ? (requestedHintLevel ?? hintLevel) : undefined,
          executionState,
          provider,
        }),
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.reply || errorJson.error || `HTTP ${res.status}`);
      }

      const data: MentorResponse = await res.json();
      setResponse(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reach AI Mentor';
      setResponse({
        success: false,
        reply: `⚠️ ${msg}. You can continue experimenting with the code and controls above!`,
        action,
        providerUsed: 'Error Handler',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleNextHint = () => {
    const next = hintLevel >= 3 ? 1 : hintLevel + 1;
    setHintLevel(next);
    requestMentor('hint', next);
  };

  const handleSaveKey = (key: string) => {
    setCustomKey(key);
    if (key) {
      sessionStorage.setItem('bytebot_api_key', key);
    } else {
      sessionStorage.removeItem('bytebot_api_key');
    }
    setShowSettings(false);
  };

  const isConfigured = serverHasKey || Boolean(customKey);

  return (
    <section className="panel mentor-panel">
      {/* Mentor Header */}
      <div className="ph mentor-ph">
        <div className="mentor-title">
          <span>🤖</span>
          <strong>ByteBot AI Mentor</strong>
          <span className={`status-pill ${isConfigured ? 'live' : 'offline'}`}>
            {isConfigured ? '🟢 Live AI' : '🟡 Offline Mentor'}
          </span>
        </div>
        <button
          className="btn-settings-toggle"
          onClick={() => setShowSettings(s => !s)}
          title="Configure AI Provider & API Key"
        >
          ⚙️ {showSettings ? 'Close' : 'Settings'}
        </button>
      </div>

      {/* Settings Drawer */}
      {showSettings && (
        <div className="mentor-settings-card">
          <h4>AI Provider Configuration</h4>
          <p className="dim-text">
            No API key is required to learn! Offline mode provides instant guidance. For live Gemini/OpenRouter responses, add a free API key:
          </p>
          <div className="settings-row">
            <label>Provider:</label>
            <select
              value={provider}
              onChange={e => setProvider(e.target.value as AIProviderType)}
              className="settings-select"
            >
              <option value="google">Google AI Studio (Gemini 1.5 Flash)</option>
              <option value="openrouter">OpenRouter (Free Models)</option>
            </select>
          </div>
          <div className="settings-row">
            <label>API Key:</label>
            <input
              type="password"
              placeholder={serverHasKey ? 'Server key detected (optional override)' : 'Enter free API key...'}
              value={customKey}
              onChange={e => setCustomKey(e.target.value)}
              className="settings-input"
            />
          </div>
          <p className="privacy-note">
            🔒 <em>Keys stay strictly in your local browser session. Never committed or shared.</em>
          </p>
          <div className="settings-actions">
            <button className="btn" onClick={() => handleSaveKey(customKey)}>Save Configuration</button>
            {customKey && (
              <button className="btn reset" onClick={() => handleSaveKey('')}>Clear Key</button>
            )}
          </div>
        </div>
      )}

      {/* Quick Action Navigation */}
      <div className="mentor-actions">
        <button
          className={`btn mentor-btn ${activeAction === 'explain' ? 'active' : ''}`}
          onClick={() => requestMentor('explain')}
          disabled={loading}
        >
          💡 Explain Code
        </button>
        <button
          className={`btn mentor-btn ${activeAction === 'hint' ? 'active' : ''}`}
          onClick={() => requestMentor('hint', hintLevel)}
          disabled={loading}
        >
          🧭 Give Me a Hint {hintLevel > 1 ? `(${hintLevel}/3)` : ''}
        </button>
        <button
          className={`btn mentor-btn ${activeAction === 'mistake' ? 'active' : ''}`}
          onClick={() => requestMentor('mistake')}
          disabled={loading}
        >
          🔍 Find My Mistake
        </button>
        <button
          className={`btn mentor-btn ${activeAction === 'ask' ? 'active' : ''}`}
          onClick={() => setActiveAction('ask')}
          disabled={loading}
        >
          ❓ Ask AI
        </button>
      </div>

      {/* Ask Question Input Form */}
      {activeAction === 'ask' && (
        <form
          className="ask-form"
          onSubmit={e => {
            e.preventDefault();
            if (question.trim()) requestMentor('ask', undefined, question.trim());
          }}
        >
          <input
            type="text"
            className="ask-input"
            placeholder="e.g. Why does range(5) count 0 to 4 instead of 1 to 5?"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            disabled={loading}
            maxLength={250}
          />
          <button type="submit" className="btn play" disabled={loading || !question.trim()}>
            Send ➜
          </button>
        </form>
      )}

      {/* Mentor Response Display */}
      <div className="mentor-content">
        {loading ? (
          <div className="mentor-thinking">
            <div className="robot-pulse">🤖</div>
            <p>ByteBot is analyzing your code and thinking...</p>
          </div>
        ) : response ? (
          <div className="mentor-response-card">
            {response.isFallback && (
              <div className="fallback-banner">
                ℹ️ <strong>Offline Mentor Guide:</strong> Using built-in lesson tutor. Add a free API key in Settings to activate live Gemini AI.
              </div>
            )}
            <div className="mentor-badge-row">
              <span className="mentor-source-badge">
                {response.providerUsed}
              </span>
              {activeAction === 'hint' && (
                <button className="btn-next-hint" onClick={handleNextHint}>
                  {hintLevel >= 3 ? '↺ Restart from Hint 1' : `Next Hint (${hintLevel + 1}/3) ➜`}
                </button>
              )}
            </div>
            <div className="mentor-text">
              {response.reply.split('\n').map((paragraph, idx) => (
                paragraph.trim() ? (
                  <p key={idx}>{paragraph}</p>
                ) : (
                  <br key={idx} />
                )
              ))}
            </div>
            <div className="mentor-footer-tip">
              🛡️ <em>ByteBot guides you to learn, but will never replace your code for you. Try typing what you learned into the editor!</em>
            </div>
          </div>
        ) : (
          <div className="mentor-placeholder">
            <p>👋 Hey there! I'm <strong>ByteBot</strong>, your Python loop companion.</p>
            <p className="dim-text">
              Click <strong>💡 Explain Code</strong> for a breakdown, <strong>🧭 Give Me a Hint</strong> for progressive clues, or ask me anything!
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
