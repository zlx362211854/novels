import { EventEmitter } from 'events';

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

interface TaskInfo {
  taskId: string;
  label: string;
  steps: string[];
  currentStep: number;
  currentStepLabel: string;
  status: 'running' | 'done' | 'error';
  startedAt: number;
  elapsed: number;
  streamText: string;
  stepLogs: Array<{ stepLabel: string; text: string }>;
  errorMessage?: string;
}

let currentTask: TaskInfo | null = null;
let tickTimer: NodeJS.Timeout | null = null;
let streamEmitTimer: NodeJS.Timeout | null = null;

function emitCurrentTask(): void {
  if (!currentTask) return;
  emitter.emit('update', { ...currentTask });
}

function scheduleStreamEmit(): void {
  if (streamEmitTimer) return;
  streamEmitTimer = setTimeout(() => {
    streamEmitTimer = null;
    emitCurrentTask();
  }, 80);
}

function startTickTimer(): void {
  stopTickTimer();
  tickTimer = setInterval(() => {
    if (!currentTask) { stopTickTimer(); return; }
    currentTask.elapsed = Math.round((Date.now() - currentTask.startedAt) / 1000);
    emitCurrentTask();
  }, 15000);
}

function stopTickTimer(): void {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
}

function stopStreamEmitTimer(): void {
  if (streamEmitTimer) {
    clearTimeout(streamEmitTimer);
    streamEmitTimer = null;
  }
}

function start(taskId: string, label: string, steps: string[]): void {
  currentTask = {
    taskId,
    label,
    steps,
    currentStep: 0,
    currentStepLabel: steps[0] || label,
    status: 'running',
    startedAt: Date.now(),
    elapsed: 0,
    streamText: '',
    stepLogs: []
  };
  emitCurrentTask();
  startTickTimer();
}

function persistCurrentStream(): void {
  if (!currentTask?.streamText?.trim()) return;
  const currentLabel = currentTask.currentStepLabel || currentTask.label;
  const existingIndex = currentTask.stepLogs.findIndex((item) => item.stepLabel === currentLabel);
  if (existingIndex >= 0) {
    currentTask.stepLogs[existingIndex] = {
      stepLabel: currentLabel,
      text: currentTask.streamText,
    };
    return;
  }
  currentTask.stepLogs.push({
    stepLabel: currentLabel,
    text: currentTask.streamText,
  });
}

function step(taskId: string, stepIndex: number, stepLabel: string): void {
  if (!currentTask || currentTask.taskId !== taskId) return;
  persistCurrentStream();
  currentTask.currentStep = stepIndex;
  currentTask.currentStepLabel = stepLabel;
  currentTask.elapsed = Math.round((Date.now() - currentTask.startedAt) / 1000);
  currentTask.streamText = '';
  stopStreamEmitTimer();
  emitCurrentTask();
}

function appendStream(taskId: string | null, text: string): void {
  if (!text) return;
  if (!currentTask) return;
  if (taskId && currentTask.taskId !== taskId) return;
  currentTask.streamText += text;
  scheduleStreamEmit();
}

function appendLog(taskId: string | null, text: string): void {
  if (!text) return;
  if (!currentTask) return;
  if (taskId && currentTask.taskId !== taskId) return;
  const line = text.endsWith('\n') ? text : `${text}\n`;
  currentTask.streamText += currentTask.streamText ? `\n${line}` : line;
  scheduleStreamEmit();
}

function setStream(taskId: string | null, text: string): void {
  if (!currentTask) return;
  if (taskId && currentTask.taskId !== taskId) return;
  currentTask.streamText = text || '';
  stopStreamEmitTimer();
  emitCurrentTask();
}

function finish(taskId: string): void {
  if (!currentTask || currentTask.taskId !== taskId) return;
  stopTickTimer();
  stopStreamEmitTimer();
  persistCurrentStream();
  currentTask.status = 'done';
  currentTask.elapsed = Math.round((Date.now() - currentTask.startedAt) / 1000);
  emitCurrentTask();
  currentTask = null;
}

function error(taskId: string, message: string): void {
  if (!currentTask || currentTask.taskId !== taskId) return;
  stopTickTimer();
  stopStreamEmitTimer();
  persistCurrentStream();
  currentTask.status = 'error';
  currentTask.errorMessage = message;
  currentTask.elapsed = Math.round((Date.now() - currentTask.startedAt) / 1000);
  emitCurrentTask();
  currentTask = null;
}

function getCurrent(): TaskInfo | null {
  return currentTask ? { ...currentTask } : null;
}

export {
  emitter,
  start,
  step,
  appendStream,
  appendLog,
  setStream,
  finish,
  error,
  getCurrent
};
