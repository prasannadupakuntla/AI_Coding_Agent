import { useState, useEffect } from 'react';
import type { MentorAction, AIProviderType, MentorResponse, ExecutionContext } from '../../server/types.ts';
import { MarkdownView } from './MarkdownView.tsx';

interface AIMentorProps {
  code: string;
  executionState: ExecutionContext;
  onPlayRequest?: () => void;
}

type ExtendedTab = MentorAction | 'predict';

export function AIMentor({ code, executionState, onPlayRequest }: AIMentorProps) {
  const [activeTab, setActiveTab] = useState<ExtendedTab>('explain');
  const [question, setQuestion] = useState('');
  const [hintLevel, setHintLevel] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<MentorResponse | null>(null);
  const [provider, setProvider] = useState<AIProviderType>('google');
  const [customKey, setCustomKey] = useState<string>(() => sessionStorage.getItem('bytebot_api_key') || '');
  const [showSettings, setShowSettings] = useState(false);
  const [serverHasKey, setServerHasKey] = useState(false);

  // Prediction Quiz state
  const [predictionAnswer, setPredictionAnswer] = useState<number | null>(null);
  const [predictionFeedback, setPredictionFeedback] = useState<string | null>(null);

  // Suggested beginner questions
  const exampleQuestions = [
    'Why does range(5) stop at 4 instead of 5?',
    "What does the letter 'i' stand for?",
    "What is an 'iteration' in plain English?",
    'Why does Python need 2 spaces (indentation)?',
  ];

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
    setActiveTab(action);
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
        reply: `### ⚠️ Tutor Connection Note\n${msg}\n\nByteBot is still ready to help in offline mode!`,
        action,
        providerUsed: 'Error Handler',
        isFallback: true,
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

  const handlePredict = (choice: number) => {
    setPredictionAnswer(choice);
    const expected = executionState.total ?? 0;
    if (choice === expected) {
      setPredictionFeedback(
        `🎉 **Spot on!** Because your loop has \`range(${expected})\`, it will run for ${expected} turns (\`i = ${Array.from({ length: Math.min(expected, 4) }, (_, idx) => idx).join(', ')}${expected > 4 ? '...' : ''}\`). Each turn collects 1 coin, so ByteBot collects exactly **${expected} coins**!`
      );
    } else {
      setPredictionFeedback(
        `🤔 **Not quite, but great try!** You predicted **${choice}**, but \`range(${expected})\` dispenses ${expected} numbers starting from 0. That means the loop repeats **${expected} times**, collecting **${expected} coins**.`
      );
    }
  };

  const isConfigured = serverHasKey || Boolean(customKey);
  const currentTotal = executionState.total ?? 0;
  const predictionOptions = Array.from(new Set([
    Math.max(0, currentTotal - 1),
    currentTotal,
    currentTotal + 1,
    0
  ])).sort((a, b) => a - b);

  return (
    <section className="panel mentor-panel">
      {/* Mentor Header */}
      <div className="ph mentor-ph">
        <div className="mentor-title">
          <span>🤖</span>
          <strong>ByteBot Beginner Tutor</strong>
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
            No API key is needed to learn! ByteBot includes a comprehensive built-in offline tutor. To connect live Gemini or OpenRouter models:
          </p>
          <div className="settings-row">
            <label>Provider:</label>
            <select
              value={provider}
              onChange={e => setProvider(e.target.value as AIProviderType)}
              className="settings-select"
            >
              <option value="google">Google AI Studio (Gemini 1.5 Flash)</option>
              <option value="openrouter">OpenRouter (Free Tier Models)</option>
            </select>
          </div>
          <div className="settings-row">
            <label>API Key:</label>
            <input
              type="password"
              placeholder={serverHasKey ? 'Server key detected (optional override)' : 'Paste your free API key here...'}
              value={customKey}
              onChange={e => setCustomKey(e.target.value)}
              className="settings-input"
            />
          </div>
          <p className="privacy-note">
            🔒 <em>Keys stay strictly in your local browser session memory. Never saved to files or shared.</em>
          </p>
          <div className="settings-actions">
            <button className="btn" onClick={() => handleSaveKey(customKey)}>Save Configuration</button>
            {customKey && (
              <button className="btn reset" onClick={() => handleSaveKey('')}>Clear Key</button>
            )}
          </div>
        </div>
      )}

      {/* Action Navigation Tabs */}
      <div className="mentor-actions">
        <button
          className={`btn mentor-btn ${activeTab === 'explain' ? 'active' : ''}`}
          onClick={() => requestMentor('explain')}
          disabled={loading}
        >
          💡 Explain Code
        </button>
        <button
          className={`btn mentor-btn ${activeTab === 'hint' ? 'active' : ''}`}
          onClick={() => requestMentor('hint', hintLevel)}
          disabled={loading}
        >
          🧭 Give Me a Hint {hintLevel > 1 ? `(${hintLevel}/3)` : ''}
        </button>
        <button
          className={`btn mentor-btn ${activeTab === 'mistake' ? 'active' : ''}`}
          onClick={() => requestMentor('mistake')}
          disabled={loading}
        >
          🔍 Find My Mistake
        </button>
        <button
          className={`btn mentor-btn ${activeTab === 'ask' ? 'active' : ''}`}
          onClick={() => setActiveTab('ask')}
          disabled={loading}
        >
          ❓ Ask AI
        </button>
        <button
          className={`btn mentor-btn predict-tab ${activeTab === 'predict' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('predict');
            setPredictionAnswer(null);
            setPredictionFeedback(null);
          }}
        >
          🧠 Predict &amp; Test
        </button>
      </div>

      {/* Mode 1: Ask AI Input & Question Suggestions */}
      {activeTab === 'ask' && (
        <div className="ask-container">
          <form
            className="ask-form"
            onSubmit={e => {
              e.preventDefault();
              if (question.trim()) {
                requestMentor('ask', undefined, question.trim());
              }
            }}
          >
            <input
              type="text"
              className="ask-input"
              placeholder="Ask anything about Python loops, e.g. Why does range(5) stop at 4?"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              disabled={loading}
              maxLength={250}
            />
            <button type="submit" className="btn play" disabled={loading || !question.trim()}>
              Ask ByteBot ➜
            </button>
          </form>

          {/* Quick Example Question Chips */}
          <div className="example-chips">
            <span className="chips-label">💡 Beginner Questions:</span>
            {exampleQuestions.map((q, idx) => (
              <button
                key={idx}
                type="button"
                className="chip-btn"
                onClick={() => {
                  setQuestion(q);
                  requestMentor('ask', undefined, q);
                }}
                disabled={loading}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mode 2: Predict & Test Practice Feature */}
      {activeTab === 'predict' && (
        <div className="predict-container">
          <div className="predict-card">
            <h4>🧠 Beginner Practice: Predict Before You Run!</h4>
            <p className="predict-question">
              Look at your loop above: <strong>How many total coins will ByteBot collect?</strong>
            </p>
            <div className="predict-options">
              {predictionOptions.map((opt) => (
                <button
                  key={opt}
                  className={`btn predict-option-btn ${predictionAnswer === opt ? 'selected' : ''}`}
                  onClick={() => handlePredict(opt)}
                >
                  🪙 {opt} Coin{opt !== 1 ? 's' : ''}
                </button>
              ))}
            </div>

            {predictionFeedback && (
              <div className="prediction-feedback-box">
                <MarkdownView content={predictionFeedback} />
                {onPlayRequest && (
                  <button className="btn play test-run-btn" onClick={onPlayRequest}>
                    ▶ Run Animation &amp; Confirm Prediction!
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Response Display */}
      {activeTab !== 'predict' && (
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
                  ℹ️ <strong>Offline Tutor Mode:</strong> ByteBot's built-in story guide. Add a free API key in Settings to activate live Gemini AI!
                </div>
              )}
              <div className="mentor-badge-row">
                <span className="mentor-source-badge">
                  Source: {response.providerUsed}
                </span>
                {activeTab === 'hint' && (
                  <button className="btn-next-hint" onClick={handleNextHint}>
                    {hintLevel >= 3 ? '↺ Restart from Hint 1' : `Next Hint (${hintLevel + 1}/3) ➜`}
                  </button>
                )}
              </div>

              {/* Formatted Markdown Content */}
              <div className="mentor-text">
                <MarkdownView content={response.reply} />
              </div>

              <div className="mentor-footer-tip">
                🛡️ <em>ByteBot guides your understanding, but never changes your code for you. Try typing what you learned into the editor!</em>
              </div>
            </div>
          ) : (
            <div className="mentor-placeholder">
              <p>👋 Hey there! I'm <strong>ByteBot</strong>, your personal Python coding tutor.</p>
              <p className="dim-text">
                Click <strong>💡 Explain Code</strong> for a simple story breakdown, <strong>🧭 Give Me a Hint</strong> for progressive clues, or <strong>🧠 Predict &amp; Test</strong> to test your intuition!
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
