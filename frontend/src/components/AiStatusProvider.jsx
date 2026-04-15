import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Bot, ChevronDown, ChevronRight, Loader2, X } from 'lucide-react';

const AiStatusContext = createContext(null);

const STEP_LABELS = {
  '生成章节内容': 'AI 正在创作章节正文...',
  '提取记忆卡': 'AI 正在提取章节记忆...',
  '逻辑审阅': 'AI 正在进行逻辑审阅...',
  '修订章节': 'AI 正在修订章节...',
  '构建上下文': '正在构建审阅上下文...',
  '保存结果': '正在保存修订结果...',
  '准备修订任务': '正在整理修订任务...',
  '逐章生成修订稿': '正在逐章生成修订稿...',
  '保存草稿': '正在保存修订草稿...',
  '发布到七猫': '正在发布到七猫小说...',
  '发布到番茄': '正在发布到番茄小说...'
};

function formatElapsed(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m${s.toString().padStart(2, '0')}s`;
}

function humanStepLabel(label) {
  return STEP_LABELS[label] || label;
}

export function AiStatusProvider({ children }) {
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);
  const esRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  useEffect(() => {
    function connect() {
      const es = new EventSource('http://localhost:3001/api/ai-status/events');
      esRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          setStatus(data);

          if (data.status === 'running' || data.streamText) {
            setOpen(true);
          }
        } catch (err) {
          console.error('[AiStatus] 解析事件失败:', err, event.data);
        }
      };

      es.onerror = (err) => {
        console.error('[AiStatus] SSE 连接出错，5秒后重试', err);
        es.close();
        reconnectTimerRef.current = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      esRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  const value = useMemo(() => ({
    status,
    open,
    setOpen,
  }), [status, open]);

  return (
    <AiStatusContext.Provider value={value}>
      {children}
    </AiStatusContext.Provider>
  );
}

export function useAiStatus() {
  return useContext(AiStatusContext);
}

export function AiStatusBar() {
  const context = useAiStatus();
  const status = context?.status;
  const open = context?.open;
  const setOpen = context?.setOpen;
  const [currentExpanded, setCurrentExpanded] = useState(true);
  const historyLogs = Array.isArray(status?.stepLogs) ? status.stepLogs : [];

  if (!status) return null;

  const isDone = status.status === 'done';
  const isError = status.status === 'error';
  const isRunning = status.status === 'running';
  const stepLabel = humanStepLabel(status.currentStepLabel);
  const progressPercent = status.steps?.length
    ? Math.round(((status.currentStep + (isRunning ? 0.5 : 1)) / status.steps.length) * 100)
    : 0;

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen?.(true)}
          className="fixed top-1/2 right-0 z-50 flex -translate-y-1/2 items-center gap-2 rounded-l-2xl border border-r-0 bg-background/95 px-3 py-3 text-sm shadow-lg backdrop-blur"
        >
          {isRunning ? <Loader2 className="size-4 animate-spin" /> : <Bot className="size-4" />}
          <span className="max-w-32 truncate">{status.label}</span>
          <ChevronRight className="size-4" />
        </button>
      ) : null}

      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-xl transform border-l bg-background/98 shadow-2xl backdrop-blur transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {isRunning ? <Loader2 className="size-4 animate-spin text-primary" /> : <Bot className="size-4 text-primary" />}
                  <h3 className="truncate text-sm font-semibold">{status.label}</h3>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isDone ? '已完成' : isError ? (status.errorMessage || '出错了') : stepLabel}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={isError ? 'destructive' : isDone ? 'default' : 'secondary'}>
                  {formatElapsed(status.elapsed || 0)}
                </Badge>
                <Button variant="ghost" size="icon-sm" onClick={() => setOpen?.(false)}>
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            {status.steps?.length ? (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>步骤进度</span>
                  <span>{Math.min(status.currentStep + 1, status.steps.length)}/{status.steps.length}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${isError ? 'bg-destructive' : isDone ? 'bg-green-500' : 'bg-primary'}`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex-1 overflow-hidden px-5 py-4">
            <ScrollArea className="h-[calc(100vh-220px)] pr-1">
              <div className="space-y-4">
                <section className="rounded-xl border bg-slate-50/80">
                  <div className="flex items-center justify-between border-b px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">当前步骤输出</p>
                      <p className="mt-1 text-xs text-muted-foreground">{stepLabel}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setCurrentExpanded((value) => !value)}
                    >
                      {currentExpanded ? (
                        <>
                          收起
                          <ChevronDown className="ml-1 size-3.5" />
                        </>
                      ) : (
                        <>
                          展开
                          <ChevronRight className="ml-1 size-3.5" />
                        </>
                      )}
                    </Button>
                  </div>
                  {currentExpanded ? (
                    <div className="max-h-80 overflow-y-auto">
                      <pre className="min-h-32 whitespace-pre-wrap break-words px-4 py-4 text-xs leading-5 text-slate-700">
                        {status.streamText || (isRunning ? 'AI 正在组织输出...' : '当前步骤没有可展示的文本内容。')}
                      </pre>
                    </div>
                  ) : null}
                </section>

                {historyLogs.length ? (
                  <section className="rounded-xl border bg-white">
                    <div className="border-b px-4 py-3">
                      <p className="text-sm font-medium">已完成步骤输出</p>
                      <p className="mt-1 text-xs text-muted-foreground">步骤切换后会保留之前阶段的内容，方便回看</p>
                    </div>
                    <div className="max-h-[32rem] space-y-3 overflow-y-auto px-4 py-4">
                      {historyLogs.map((item, index) => (
                        <div key={`${item.stepLabel}-${index}`} className="rounded-lg border bg-slate-50/70">
                          <div className="border-b px-3 py-2 text-xs font-medium text-slate-600">
                            {humanStepLabel(item.stepLabel)}
                          </div>
                          <pre className="whitespace-pre-wrap break-words px-3 py-3 text-sm leading-6 text-slate-800">
                            {item.text}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </>
  );
}
