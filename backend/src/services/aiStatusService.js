const EventEmitter = require('node:events');

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

let currentTask = null;
let tickTimer = null;

function startTickTimer() {
  stopTickTimer();
  tickTimer = setInterval(() => {
    if (!currentTask) { stopTickTimer(); return; }
    currentTask.elapsed = Math.round((Date.now() - currentTask.startedAt) / 1000);
    emitter.emit('update', { ...currentTask });
  }, 5000);
}

function stopTickTimer() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
}

function start(taskId, label, steps) {
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

function step(taskId, stepIndex, stepLabel) {
  if (!currentTask || currentTask.taskId !== taskId) return;
  currentTask.currentStep = stepIndex;
  currentTask.currentStepLabel = stepLabel;
  currentTask.elapsed = Math.round((Date.now() - currentTask.startedAt) / 1000);
  emitter.emit('update', { ...currentTask });
}

function finish(taskId) {
  if (!currentTask || currentTask.taskId !== taskId) return;
  stopTickTimer();
  currentTask.status = 'done';
  currentTask.elapsed = Math.round((Date.now() - currentTask.startedAt) / 1000);
  emitter.emit('update', { ...currentTask });
  currentTask = null;
}

function error(taskId, message) {
  if (!currentTask || currentTask.taskId !== taskId) return;
  stopTickTimer();
  currentTask.status = 'error';
  currentTask.errorMessage = message;
  currentTask.elapsed = Math.round((Date.now() - currentTask.startedAt) / 1000);
  emitter.emit('update', { ...currentTask });
  currentTask = null;
}

function getCurrent() {
  return currentTask ? { ...currentTask } : null;
}

module.exports = {
  emitter,
  start,
  step,
  finish,
  error,
  getCurrent
};
