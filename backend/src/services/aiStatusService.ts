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
  errorMessage?: string;
}

let currentTask: TaskInfo | null = null;
let tickTimer: NodeJS.Timeout | null = null;

function startTickTimer(): void {
  stopTickTimer();
  tickTimer = setInterval(() => {
    if (!currentTask) { stopTickTimer(); return; }
    currentTask.elapsed = Math.round((Date.now() - currentTask.startedAt) / 1000);
    emitter.emit('update', { ...currentTask });
  }, 5000);
}

function stopTickTimer(): void {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
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
    elapsed: 0
  };
  emitter.emit('update', { ...currentTask });
  startTickTimer();
}

function step(taskId: string, stepIndex: number, stepLabel: string): void {
  if (!currentTask || currentTask.taskId !== taskId) return;
  currentTask.currentStep = stepIndex;
  currentTask.currentStepLabel = stepLabel;
  currentTask.elapsed = Math.round((Date.now() - currentTask.startedAt) / 1000);
  emitter.emit('update', { ...currentTask });
}

function finish(taskId: string): void {
  if (!currentTask || currentTask.taskId !== taskId) return;
  stopTickTimer();
  currentTask.status = 'done';
  currentTask.elapsed = Math.round((Date.now() - currentTask.startedAt) / 1000);
  emitter.emit('update', { ...currentTask });
  currentTask = null;
}

function error(taskId: string, message: string): void {
  if (!currentTask || currentTask.taskId !== taskId) return;
  stopTickTimer();
  currentTask.status = 'error';
  currentTask.errorMessage = message;
  currentTask.elapsed = Math.round((Date.now() - currentTask.startedAt) / 1000);
  emitter.emit('update', { ...currentTask });
  currentTask = null;
}

function getCurrent(): TaskInfo | null {
  return currentTask ? { ...currentTask } : null;
}

export {
  emitter,
  start,
  step,
  finish,
  error,
  getCurrent
};