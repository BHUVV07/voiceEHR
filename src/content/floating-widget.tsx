import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { DictationController } from './dictation-controller';
import { DictationError, DictationState, FocusTargetInfo, LastCommandFeedback, FieldSummaryInfo } from '../shared/messages';
import { VoiceMode } from '../shared/settings';
import { STORAGE_KEYS, WIDGET_CONTAINER_ID } from '../shared/constants';

interface FloatingWidgetProps {
  controller: DictationController;
}

export const FloatingWidget: React.FC<FloatingWidgetProps> = ({ controller }) => {
  const [state, setState] = useState<DictationState>(controller.getState());
  const [mode, setMode] = useState<VoiceMode>(controller.getMode());
  const [error, setError] = useState<DictationError | null>(controller.getError());
  const [interim, setInterim] = useState('');
  const [final, setFinal] = useState('');
  const [allFinal, setAllFinal] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [lastCommand, setLastCommand] = useState<LastCommandFeedback | null>(controller.getLastCommand());
  const [targetInfo, setTargetInfo] = useState<FocusTargetInfo | null>(null);
  const [discoveredFields, setDiscoveredFields] = useState<FieldSummaryInfo[]>([]);

  // Position state (null = anchored at bottom-right)
  const [customPos, setCustomPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.WIDGET_POSITION);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
          return parsed;
        }
      }
    } catch {}
    return null;
  });

  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number }>({
    startX: 0,
    startY: 0,
    posX: 0,
    posY: 0,
  });

  useEffect(() => {
    const unsubState = controller.onStateChange((newState, newError, newMode) => {
      setState(newState);
      setError(newError);
      setMode(newMode);
      if (newState === 'LISTENING') {
        setElapsed(0);
      }
      const cur = controller.getNavigationEngine().getCurrentField();
      setTargetInfo(cur ? { hasTarget: true, label: cur.label } : null);
      setDiscoveredFields(controller.getDiscoveredFieldsSummary());
    });

    const unsubTranscript = controller.onTranscript((newInterim, newFinal, newAllFinal) => {
      setInterim(newInterim);
      setFinal(newFinal);
      setAllFinal(newAllFinal);
    });

    const unsubToast = controller.onToast((msg, type) => {
      setToast({ msg, type });
      setTimeout(() => setToast(null), 3500);
    });

    const unsubCmd = controller.onCommandFeedback((cmd) => {
      setLastCommand(cmd);
      setDiscoveredFields(controller.getDiscoveredFieldsSummary());
    });

    // Initial fields scan
    setDiscoveredFields(controller.getDiscoveredFieldsSummary());

    return () => {
      unsubState();
      unsubTranscript();
      unsubToast();
      unsubCmd();
    };
  }, [controller]);

  // Elapsed timer when recording
  useEffect(() => {
    let interval: any;
    if (state === 'LISTENING') {
      interval = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsed(0);
    }
    return () => clearInterval(interval);
  }, [state]);

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); // do not blur input field!

    setIsDragging(true);
    const startX = customPos ? customPos.x : (window.innerWidth - 340);
    const startY = customPos ? customPos.y : (window.innerHeight - 90);

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: startX,
      posY: startY,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - dragRef.current.startX;
      const deltaY = moveEvent.clientY - dragRef.current.startY;
      const newX = Math.max(10, Math.min(window.innerWidth - 340, dragRef.current.posX + deltaX));
      const newY = Math.max(10, Math.min(window.innerHeight - 90, dragRef.current.posY + deltaY));

      setCustomPos({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      try {
        if (customPos) {
          localStorage.setItem(STORAGE_KEYS.WIDGET_POSITION, JSON.stringify(customPos));
        }
      } catch {}
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    controller.toggle();
  };

  const handlePause = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    controller.togglePause();
  };

  const handleCycleMode = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (mode === 'DICTATION') {
      controller.setMode('NAVIGATION');
    } else if (mode === 'NAVIGATION') {
      controller.setMode('COMMAND');
    } else {
      controller.setMode('DICTATION');
    }
  };

  const handleNextField = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    controller.getNavigationEngine().navigateNext();
  };

  const handlePrevField = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    controller.getNavigationEngine().navigatePrevious();
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const textToCopy = allFinal || interim;
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setToast({ msg: 'Transcript copied!', type: 'success' });
      setTimeout(() => setToast(null), 2000);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isListening = state === 'LISTENING';
  const isPaused = state === 'PAUSED';
  const isStarting = state === 'STARTING';
  const isError = state === 'ERROR';

  const currentField = controller.getNavigationEngine().getCurrentField();

  // Mode badge styling
  const modeColor =
    mode === 'DICTATION'
      ? { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' }
      : mode === 'NAVIGATION'
      ? { bg: 'rgba(6, 182, 212, 0.15)', text: '#38bdf8', border: 'rgba(6, 182, 212, 0.3)' }
      : { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' };

  return (
    <div
      style={
        customPos
          ? {
              position: 'fixed',
              left: `${customPos.x}px`,
              top: `${customPos.y}px`,
              zIndex: 2147483647,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              userSelect: 'none',
            }
          : {
              position: 'fixed',
              bottom: '24px',
              right: '24px',
              zIndex: 2147483647,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              userSelect: 'none',
            }
      }
    >
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: '8px',
            padding: '6px 14px',
            borderRadius: '8px',
            backgroundColor: toast.type === 'error' ? '#ef4444' : toast.type === 'warning' ? '#f59e0b' : '#0f172a',
            color: '#ffffff',
            fontSize: '12px',
            fontWeight: 500,
            maxWidth: '360px',
            whiteSpace: 'normal',
            textAlign: 'center',
            lineHeight: '1.35',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            pointerEvents: 'none',
            animation: 'vf-fade-in 0.2s ease-out',
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Main Floating Control Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          borderRadius: '9999px',
          backgroundColor: isListening ? '#090d16' : '#0f172a',
          color: '#f8fafc',
          boxShadow: isListening
            ? '0 8px 32px rgba(16, 185, 129, 0.3), 0 0 0 1px rgba(16, 185, 129, 0.5)'
            : '0 8px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.12)',
          backdropFilter: 'blur(16px)',
          cursor: isDragging ? 'grabbing' : 'grab',
          transition: 'all 0.2s ease',
        }}
        onMouseDown={handleMouseDown}
      >
        {/* Brand / Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '11px',
              color: '#ffffff',
              boxShadow: '0 2px 6px rgba(16,185,129,0.4)',
            }}
          >
            V
          </div>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.3px' }}>
            VoiceFlow
          </span>
        </div>

        {/* Mode Switch Pill */}
        <button
          type="button"
          onMouseDown={handleCycleMode}
          style={{
            background: modeColor.bg,
            border: `1px solid ${modeColor.border}`,
            color: modeColor.text,
            borderRadius: '9999px',
            padding: '2px 8px',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          title={`Current mode: ${mode}. Click to switch (or say "${mode.toLowerCase()} mode")`}
        >
          {mode}
        </button>

        {/* Current Target Field Pill */}
        {currentField && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              maxWidth: '120px',
              padding: '2px 7px',
              borderRadius: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              fontSize: '11px',
              fontWeight: 500,
              color: '#cbd5e1',
            }}
            title={`Active Target: ${currentField.label}`}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentField.label}
            </span>
          </div>
        )}

        {/* Status / Waveform */}
        {isListening ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '0 2px' }}>
            <div className="vf-wave-bar vf-bar-1" />
            <div className="vf-wave-bar vf-bar-2" />
            <div className="vf-wave-bar vf-bar-3" />
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#4ade80',
                marginLeft: '4px',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatTime(elapsed)}
            </span>
          </div>
        ) : isPaused ? (
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#facc15' }}>Paused</span>
        ) : isStarting ? (
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Starting...</span>
        ) : isError ? (
          <span style={{ fontSize: '11px', color: '#f87171' }}>Error</span>
        ) : (
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Ready</span>
        )}

        {/* Navigation Quick Arrows */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button
            type="button"
            onMouseDown={handlePrevField}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '2px 4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Previous field (Say 'Previous field')"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            onMouseDown={handleNextField}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '2px 4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Next field (Say 'Next field')"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {/* Action Button: Mic / Stop */}
        <button
          type="button"
          onMouseDown={handleToggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            backgroundColor: isListening ? '#ef4444' : isPaused ? '#f59e0b' : '#22c55e',
            color: '#ffffff',
            boxShadow: isListening
              ? '0 0 12px rgba(239, 68, 68, 0.5)'
              : '0 0 12px rgba(34, 197, 94, 0.4)',
            transition: 'all 0.15s ease',
          }}
          title={isListening ? 'Stop voice control (Say "Stop voice control")' : 'Start voice control (Cmd+Shift+K)'}
        >
          {isListening ? (
            /* Stop Square */
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
          ) : (
            /* Microphone Icon */
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          )}
        </button>

        {/* Expand / Details Button */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
          }}
          title={isExpanded ? 'Hide assistant tray' : 'Show assistant tray'}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: isExpanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s ease',
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Expanded Assistant Drawer */}
      {isExpanded && (
        <div
          style={{
            marginTop: '8px',
            width: '320px',
            maxHeight: '260px',
            padding: '12px',
            borderRadius: '14px',
            backgroundColor: '#0f172a',
            color: '#f8fafc',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.5)',
            fontSize: '12px',
            lineHeight: '1.4',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            animation: 'vf-fade-in 0.15s ease-out',
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', fontWeight: 700 }}>
              VoiceFlow AI 2.0 Assistant
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onMouseDown={handlePause}
                style={{
                  background: 'none',
                  border: 'none',
                  color: isPaused ? '#4ade80' : '#fbbf24',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  padding: '0',
                }}
              >
                {isPaused ? 'Resume' : 'Pause'}
              </button>
              <button
                type="button"
                onMouseDown={handleCopy}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#38bdf8',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  padding: '0',
                }}
              >
                Copy
              </button>
            </div>
          </div>

          {/* Last Executed Command Banner */}
          {lastCommand && (
            <div
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span style={{ color: lastCommand.status === 'SUCCESS' ? '#4ade80' : lastCommand.status === 'WARNING' ? '#f59e0b' : '#38bdf8' }}>
                {lastCommand.status === 'SUCCESS' ? '✓' : 'ℹ'}
              </span>
              <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{lastCommand.command}:</span>
              <span style={{ color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lastCommand.message}
              </span>
            </div>
          )}

          {/* Transcript Scroll Area */}
          <div
            style={{
              overflowY: 'auto',
              flex: 1,
              maxHeight: '80px',
              wordBreak: 'break-word',
              backgroundColor: 'rgba(0, 0, 0, 0.25)',
              padding: '6px 8px',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.05)',
            }}
          >
            {allFinal && <span>{allFinal} </span>}
            {interim ? (
              <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>{interim}</span>
            ) : !allFinal ? (
              <span style={{ color: '#64748b' }}>Say "Next field", "Go to [label]", or dictate text...</span>
            ) : null}
          </div>

          {/* Discovered Form Fields Quick List */}
          {discoveredFields.length > 0 && (
            <div>
              <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
                Discovered Fields ({discoveredFields.length})
              </div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', maxHeight: '55px', overflowY: 'auto' }}>
                {discoveredFields.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      controller.getNavigationEngine().navigateToLabel(f.label);
                    }}
                    style={{
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: currentField?.id === f.id ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.06)',
                      border: currentField?.id === f.id ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                      color: currentField?.id === f.id ? '#34d399' : '#cbd5e1',
                      fontSize: '10px',
                      cursor: 'pointer',
                    }}
                    title={`Say "Go to ${f.label}"`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div style={{ color: '#f87171', fontSize: '11px', marginTop: '2px' }}>
              ⚠️ {error.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const WIDGET_STYLES = `
  @keyframes vf-fade-in {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes vf-wave {
    0%, 100% { height: 4px; }
    50% { height: 14px; }
  }
  .vf-wave-bar {
    width: 2.5px;
    background-color: #22c55e;
    border-radius: 9999px;
    animation: vf-wave 1s ease-in-out infinite;
  }
  .vf-bar-1 { animation-delay: 0s; }
  .vf-bar-2 { animation-delay: 0.2s; }
  .vf-bar-3 { animation-delay: 0.4s; }
`;

export function mountFloatingWidget(controller: DictationController) {
  if (document.getElementById(WIDGET_CONTAINER_ID)) {
    return;
  }

  const container = document.createElement('div');
  container.id = WIDGET_CONTAINER_ID;
  container.style.position = 'fixed';
  container.style.zIndex = '2147483647';
  container.style.bottom = '0';
  container.style.right = '0';
  container.style.width = '0';
  container.style.height = '0';
  container.style.overflow = 'visible';
  container.style.pointerEvents = 'auto';

  // Use Shadow DOM to isolate styles completely from host page
  const shadowRoot = container.attachShadow({ mode: 'open' });

  const styleEl = document.createElement('style');
  styleEl.textContent = WIDGET_STYLES;
  shadowRoot.appendChild(styleEl);

  const mountPoint = document.createElement('div');
  shadowRoot.appendChild(mountPoint);

  const mountTarget = document.body || document.documentElement;
  if (!mountTarget) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => mountFloatingWidget(controller));
    }
    return;
  }

  mountTarget.appendChild(container);

  const root = ReactDOM.createRoot(mountPoint);
  root.render(<FloatingWidget controller={controller} />);
}
