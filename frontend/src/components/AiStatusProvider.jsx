import { createContext, useContext, useEffect, useRef, useState } from 'react';

const AiStatusContext = createContext(null);

const STEP_LABELS = {
  '生成章节内容': 'AI 正在创作章节正文...',
  '提取记忆卡': 'AI 正在提取章节记忆...',
  '逻辑审阅': 'AI 正在进行逻辑审阅...',
  '修订章节': 'AI 正在修订章节...',
  '构建上下文': '正在构建审阅上下文...',
  '保存结果': '正在保存修订结果...',
  '发布到七猫': '正在发布到七猫小说...',
  '发布到番茄': '正在发布到番茄小说...'
};

function formatElapsed(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m${s.toString().padStart(2, '0')}s`;
}

export function AiStatusProvider({ children }) {
  const [status, setStatus] = useState(null);
  const esRef = useRef(null);
  const hideTimerRef = useRef(null);

  useEffect(() => {
    function connect() {
      const es = new EventSource('http://localhost:3001/api/ai-status/stream');
      esRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
          }
          if (data.status === 'done' || data.status === 'error') {
            setStatus(data);
            hideTimerRef.current = setTimeout(() => setStatus(null), 3000);
          } else {
            setStatus(data);
          }
        } catch { /* ignore */ }
      };

      es.onerror = () => {
        es.close();
        setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      esRef.current?.close();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  return (
    <AiStatusContext.Provider value={status}>
      {children}
    </AiStatusContext.Provider>
  );
}

export function useAiStatus() {
  return useContext(AiStatusContext);
}

export function AiStatusBar() {
  const status = useAiStatus();

  if (!status) return null;

  const isDone = status.status === 'done';
  const isError = status.status === 'error';
  const isRunning = status.status === 'running';

  const stepLabel = STEP_LABELS[status.currentStepLabel] || status.currentStepLabel;
  const progressPercent = status.steps?.length
    ? Math.round(((status.currentStep + (isRunning ? 0.5 : 1)) / status.steps.length) * 100)
    : 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 animate-in slide-in-from-bottom-2 fade-in duration-300">
      <div className={`rounded-lg border shadow-lg backdrop-blur-sm p-3 ${
        isError
          ? 'bg-destructive/10 border-destructive/30'
          : isDone
            ? 'bg-green-500/10 border-green-500/30'
            : 'bg-background/95 border-border'
      }`}>
        <div className="flex items-center gap-2 mb-1.5">
          {isRunning && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
          )}
          {isDone && <span className="text-green-500 text-sm">&#10003;</span>}
          {isError && <span className="text-destructive text-sm">&#10007;</span>}

          <span className="text-xs font-medium truncate flex-1">
            {status.label}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatElapsed(status.elapsed || 0)}
          </span>
        </div>

        <div className="text-xs text-muted-foreground mb-1.5">
          {isDone ? '已完成' : isError ? (status.errorMessage || '出错了') : stepLabel}
          {isRunning && status.steps && (
            <span className="ml-1 text-muted-foreground/60">
              ({status.currentStep + 1}/{status.steps.length})
            </span>
          )}
        </div>

        {isRunning && (
          <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {isDone && (
          <div className="h-1 w-full rounded-full bg-green-500/20 overflow-hidden">
            <div className="h-full bg-green-500 rounded-full w-full" />
          </div>
        )}
      </div>
    </div>
  );
}
