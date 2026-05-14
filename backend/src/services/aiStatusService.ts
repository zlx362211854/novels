import { EventEmitter } from 'events';

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

const TASK_RETENTION_MS = 30 * 60 * 1000;

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

const tasks = new Map<string, TaskInfo>();
const tickTimers = new Map<string, NodeJS.Timeout>();
const streamEmitTimers = new Map<string, NodeJS.Timeout>();
const cleanupTimers = new Map<string, NodeJS.Timeout>();
let currentTaskId: string | null = null;

function getTaskInfo(taskId: string): TaskInfo | null {
  return tasks.get(taskId) || null;
}

function emitTask(taskId: string): void {
  const task = tasks.get(taskId);
  if (!task) return;
  emitter.emit('update', { ...task });
}

function stopTickTimer(taskId: string): void {
  const timer = tickTimers.get(taskId);
  if (timer) {
    clearInterval(timer);
    tickTimers.delete(taskId);
  }
}

function stopStreamEmitTimer(taskId: string): void {
  const timer = streamEmitTimers.get(taskId);
  if (timer) {
    clearTimeout(timer);
    streamEmitTimers.delete(taskId);
  }
}

function stopCleanupTimer(taskId: string): void {
  const timer = cleanupTimers.get(taskId);
  if (timer) {
    clearTimeout(timer);
    cleanupTimers.delete(taskId);
  }
}

function scheduleCleanup(taskId: string): void {
  stopCleanupTimer(taskId);
  const timer = setTimeout(() => {
    cleanupTimers.delete(taskId);
    tasks.delete(taskId);
  }, TASK_RETENTION_MS);
  cleanupTimers.set(taskId, timer);
}

function scheduleStreamEmit(taskId: string): void {
  if (streamEmitTimers.has(taskId)) return;
  const timer = setTimeout(() => {
    streamEmitTimers.delete(taskId);
    emitTask(taskId);
  }, 80);
  streamEmitTimers.set(taskId, timer);
}

function persistCurrentStream(taskId: string): void {
  const task = tasks.get(taskId);
  if (!task?.streamText?.trim()) return;
  const currentLabel = task.currentStepLabel || task.label;
  const existingIndex = task.stepLogs.findIndex((item) => item.stepLabel === currentLabel);
  if (existingIndex >= 0) {
    task.stepLogs[existingIndex] = {
      stepLabel: currentLabel,
      text: task.streamText,
    };
    return;
  }
  task.stepLogs.push({
    stepLabel: currentLabel,
    text: task.streamText,
  });
}

function setCurrentTaskId(taskId: string | null): void {
  currentTaskId = taskId;
}

function resolveNextCurrentTaskId(): string | null {
  for (const [taskId, task] of Array.from(tasks.entries()).reverse()) {
    if (task.status === 'running') {
      return taskId;
    }
  }
  return null;
}

function startTickTimer(taskId: string): void {
  stopTickTimer(taskId);
  const timer = setInterval(() => {
    const task = tasks.get(taskId);
    if (!task || task.status !== 'running') {
      stopTickTimer(taskId);
      return;
    }
    task.elapsed = Math.round((Date.now() - task.startedAt) / 1000);
    emitTask(taskId);
  }, 15000);
  tickTimers.set(taskId, timer);
}

function start(taskId: string, label: string, steps: string[]): void {
  stopCleanupTimer(taskId);
  const task: TaskInfo = {
    taskId,
    label,
    steps,
    currentStep: 0,
    currentStepLabel: steps[0] || label,
    status: 'running',
    startedAt: Date.now(),
    elapsed: 0,
    streamText: '',
    stepLogs: [],
  };
  tasks.set(taskId, task);
  setCurrentTaskId(taskId);
  emitTask(taskId);
  startTickTimer(taskId);
}

function step(taskId: string, stepIndex: number, stepLabel: string): void {
  const task = tasks.get(taskId);
  if (!task) return;
  persistCurrentStream(taskId);
  task.currentStep = stepIndex;
  task.currentStepLabel = stepLabel;
  task.elapsed = Math.round((Date.now() - task.startedAt) / 1000);
  task.streamText = '';
  stopStreamEmitTimer(taskId);
  emitTask(taskId);
}

function appendStream(taskId: string | null, text: string): void {
  if (!text || !taskId) return;
  const task = tasks.get(taskId);
  if (!task) return;
  task.streamText += text;
  scheduleStreamEmit(taskId);
}

function appendLog(taskId: string | null, text: string): void {
  if (!text || !taskId) return;
  const task = tasks.get(taskId);
  if (!task) return;
  const line = text.endsWith('\n') ? text : `${text}\n`;
  task.streamText += task.streamText ? `\n${line}` : line;
  scheduleStreamEmit(taskId);
}

function setStream(taskId: string | null, text: string): void {
  if (!taskId) return;
  const task = tasks.get(taskId);
  if (!task) return;
  task.streamText = text || '';
  stopStreamEmitTimer(taskId);
  emitTask(taskId);
}

function finish(taskId: string): void {
  const task = tasks.get(taskId);
  if (!task) return;
  stopTickTimer(taskId);
  stopStreamEmitTimer(taskId);
  persistCurrentStream(taskId);
  task.status = 'done';
  task.elapsed = Math.round((Date.now() - task.startedAt) / 1000);
  emitTask(taskId);
  if (currentTaskId === taskId) {
    setCurrentTaskId(resolveNextCurrentTaskId());
  }
  scheduleCleanup(taskId);
}

function error(taskId: string, message: string): void {
  const task = tasks.get(taskId);
  if (!task) return;
  stopTickTimer(taskId);
  stopStreamEmitTimer(taskId);
  persistCurrentStream(taskId);
  task.status = 'error';
  task.errorMessage = message;
  task.elapsed = Math.round((Date.now() - task.startedAt) / 1000);
  emitTask(taskId);
  if (currentTaskId === taskId) {
    setCurrentTaskId(resolveNextCurrentTaskId());
  }
  scheduleCleanup(taskId);
}

function getCurrent(): TaskInfo | null {
  if (!currentTaskId) return null;
  const task = tasks.get(currentTaskId);
  if (!task || task.status !== 'running') return null;
  return { ...task };
}

function getTask(taskId: string): TaskInfo | null {
  const task = tasks.get(taskId);
  return task ? { ...task } : null;
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
  getCurrent,
  getTask,
};
