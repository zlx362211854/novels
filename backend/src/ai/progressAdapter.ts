import * as aiStatus from '../services/aiStatusService';

export interface ProgressTracker {
  taskId: string;
  start: (label: string) => void;
  step: (index: number) => void;
  finish: () => void;
  error: (msg: string) => void;
}

export function createProgressTracker(taskId: string, steps: string[]): ProgressTracker {
  return {
    taskId,
    start(label: string) { aiStatus.start(taskId, label, steps); },
    step(index: number) { aiStatus.step(taskId, index, steps[index]); },
    finish() { aiStatus.finish(taskId); },
    error(msg: string) { aiStatus.error(taskId, msg); },
  };
}
