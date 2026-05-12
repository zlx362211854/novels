import { Op } from 'sequelize';
import { randomUUID } from 'crypto';
import * as schedule from 'node-schedule';
import { ScheduledTask, Architecture, Chapter, Novel } from '../models/sequelize';
import { recurringTaskGraph } from '../ai/graphs/recurringTaskGraph';

export const RECURRING_TASK_TYPE = 'recurring_chapter_generation';
const MAX_CHAPTERS_PER_RUN = 50;

const scheduledJobs = new Map<number, schedule.Job>();

interface UpsertPayload {
  cronExpression: string;
  enabled?: boolean;
  chaptersPerRun?: number;
}

interface RunSummary {
  attempted: number;
  generated: number[];
  failed: { chapterArchId: number; reason: string }[];
}

interface QueuedRun {
  taskId: number;
  signal?: AbortSignal;
  resolve: (summary: RunSummary) => void;
  reject: (error: any) => void;
}

const runQueue: QueuedRun[] = [];
const queuedTaskIds = new Set<number>();
let activeTaskId: number | null = null;
let drainingQueue = false;

function validateCron(cronExpression: string): void {
  if (!cronExpression || typeof cronExpression !== 'string') {
    throw new Error('cronExpression 不能为空');
  }
  // node-schedule accepts both standard (5-field) and extended (6-field) cron.
  // Use scheduleJob to validate without keeping the result.
  const probe = schedule.scheduleJob(cronExpression, () => {});
  if (!probe) {
    throw new Error(`cronExpression 无效：${cronExpression}`);
  }
  probe.cancel();
}

function clampChaptersPerRun(value: any): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > MAX_CHAPTERS_PER_RUN) return MAX_CHAPTERS_PER_RUN;
  return Math.floor(n);
}

function isRunning(task: any): boolean {
  return task?.last_run_status === 'running';
}

function isQueued(taskId: number): boolean {
  return queuedTaskIds.has(taskId) || activeTaskId === taskId;
}

function isBusy(task: any): boolean {
  return isRunning(task) || isQueued(Number(task?.id));
}

function describeJobNextRun(cronExpression: string): Date | null {
  const probe = schedule.scheduleJob(cronExpression, () => {});
  if (!probe) return null;
  const next = probe.nextInvocation();
  probe.cancel();
  return next ? next.toDate() : null;
}

async function findByNovel(novelId: number | string): Promise<any | null> {
  return ScheduledTask.findOne({
    where: { novel_id: Number(novelId), task_type: RECURRING_TASK_TYPE },
  });
}

function serializeTask(task: any): any {
  if (!task) return null;
  const plain = task.toJSON ? task.toJSON() : task;
  return {
    ...plain,
    last_run_result: plain.last_run_result ? safeJsonParse(plain.last_run_result) : null,
  };
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function upsert(novelId: number | string, payload: UpsertPayload): Promise<any> {
  validateCron(payload.cronExpression);
  const numericNovelId = Number(novelId);

  const novel = await Novel.findByPk(numericNovelId);
  if (!novel) throw new Error('小说不存在');

  const existing = await findByNovel(numericNovelId);
  if (existing && isBusy(existing)) {
    throw new Error('当前周期任务正在运行或排队中，请等待执行结束后再修改。');
  }

  const enabled = payload.enabled !== false;
  const chaptersPerRun = clampChaptersPerRun(payload.chaptersPerRun ?? 1);
  const nextRunAt = enabled ? describeJobNextRun(payload.cronExpression) : null;

  let task;
  if (existing) {
    existing.cron_expression = payload.cronExpression;
    existing.enabled = enabled;
    existing.chapters_per_run = chaptersPerRun;
    existing.next_run_at = nextRunAt;
    // The legacy scheduled_time column is non-null; keep it pointing to next run for legibility.
    if (nextRunAt) existing.scheduled_time = nextRunAt;
    await existing.save();
    task = existing;
  } else {
    task = await ScheduledTask.create({
      novel_id: numericNovelId,
      chapter_id: null,
      task_type: RECURRING_TASK_TYPE,
      scheduled_time: nextRunAt ?? new Date(),
      status: 'pending',
      retry_count: 0,
      cron_expression: payload.cronExpression,
      enabled,
      chapters_per_run: chaptersPerRun,
      last_run_at: null,
      last_run_status: null,
      last_run_error: null,
      last_run_result: null,
      next_run_at: nextRunAt,
    });
  }

  unregister(task.id);
  if (enabled) register(task);

  return serializeTask(task);
}

async function remove(novelId: number | string): Promise<boolean> {
  const task = await findByNovel(novelId);
  if (!task) return false;
  if (isBusy(task)) {
    throw new Error('当前周期任务正在运行或排队中，请等待执行结束后再删除。');
  }
  unregister(task.id);
  await task.destroy();
  return true;
}

function register(task: any): void {
  if (!task.enabled || !task.cron_expression) return;
  const job = schedule.scheduleJob(task.cron_expression, () => {
    void executeRun(task.id).catch((error: any) => {
      console.error(`[recurring-task] 周期任务执行失败 taskId=${task.id}:`, error?.message || error);
    });
  });
  if (job) {
    scheduledJobs.set(task.id, job);
    console.log(
      `[recurring-task] 已注册周期任务 taskId=${task.id} novelId=${task.novel_id} cron="${task.cron_expression}" nextRun=${job.nextInvocation()?.toISOString?.() || ''}`
    );
  } else {
    console.warn(`[recurring-task] 注册失败：cron 无效 taskId=${task.id} cron="${task.cron_expression}"`);
  }
}

function unregister(taskId: number): void {
  const existing = scheduledJobs.get(taskId);
  if (existing) {
    existing.cancel();
    scheduledJobs.delete(taskId);
  }
}

/**
 * Pick chapter architectures that still need content generation, in book order.
 * A chapter architecture is "pending" when:
 *   - no Chapter row references it, OR
 *   - the linked Chapter has empty content (null/'') OR a non-final status
 *     (anything other than 'generated', 'reviewed', 'published').
 */
async function findPendingChapterArchitectures(novelId: number, limit: number): Promise<any[]> {
  if (limit <= 0) return [];

  const volumes = await Architecture.findAll({
    where: { novel_id: novelId, level: 'volume' },
    order: [['id', 'ASC']],
  });
  const volumeOrder = new Map(volumes.map((volume: any, index: number) => [volume.id, index]));

  const chapterArchs = await Architecture.findAll({
    where: { novel_id: novelId, level: 'chapter' },
    order: [['id', 'ASC']],
  });
  if (chapterArchs.length === 0) return [];

  const archIds = chapterArchs.map((arch: any) => arch.id);
  const chapters = await Chapter.findAll({
    where: { architecture_id: { [Op.in]: archIds } },
  });
  const chapterByArchId = new Map<number, any[]>();
  chapters.forEach((chapter: any) => {
    const list = chapterByArchId.get(chapter.architecture_id) || [];
    list.push(chapter);
    chapterByArchId.set(chapter.architecture_id, list);
  });

  const ordered = [...chapterArchs].sort((left: any, right: any) => {
    const leftOrder = volumeOrder.get(left.parent_id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = volumeOrder.get(right.parent_id) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return (left.id || 0) - (right.id || 0);
  });

  const FINAL_STATUSES = new Set(['generated', 'reviewed', 'published']);
  const pending: any[] = [];
  for (const arch of ordered) {
    if (pending.length >= limit) break;
    const linked = chapterByArchId.get(arch.id) || [];
    const hasFinal = linked.some(
      (chapter: any) =>
        FINAL_STATUSES.has(chapter.status) &&
        chapter.content &&
        String(chapter.content).trim().length > 0
    );
    if (hasFinal) continue;
    pending.push({ architecture: arch, existingChapter: linked[0] || null });
  }
  return pending;
}

async function performExecuteRun(taskId: number, signal?: AbortSignal): Promise<RunSummary> {
  // Pre-flight check so we don't enter the graph if the task is missing or already running.
  const task = await ScheduledTask.findByPk(taskId);
  if (!task) throw new Error('周期任务不存在');
  if (isRunning(task)) throw new Error('周期任务已在运行，跳过本次触发');

  const progressTaskId = `recurring-${taskId}-${randomUUID()}`;
  try {
    const finalState: any = await recurringTaskGraph.invoke(
      {
        recurringTaskId: taskId,
        signal,
        taskId: progressTaskId,
        task: null,
        novelId: 0,
        chaptersPerRun: 1,
        pending: [],
        summary: { attempted: 0, generated: [], failed: [] },
        errorMessage: null,
      },
      { signal }
    );

    // The graph's finalize node already wrote last_run_status. Refresh next_run_at,
    // since the graph deliberately doesn't depend on node-schedule.
    if (task.cron_expression && task.enabled) {
      const fresh = await ScheduledTask.findByPk(taskId);
      if (fresh) {
        fresh.next_run_at = describeJobNextRun(task.cron_expression);
        await fresh.save();
      }
    }

    return finalState.summary as RunSummary;
  } catch (err: any) {
    // Graph threw before finalize — make sure the task is unlocked with a sensible status.
    const fresh = await ScheduledTask.findByPk(taskId);
    if (fresh && fresh.last_run_status === 'running') {
      fresh.last_run_status = 'failed';
      fresh.last_run_error = err?.message || String(err);
      await fresh.save();
    }
    throw err;
  }
}

async function drainRunQueue(): Promise<void> {
  if (drainingQueue) return;
  drainingQueue = true;

  try {
    while (runQueue.length > 0) {
      const next = runQueue.shift();
      if (!next) continue;

      queuedTaskIds.delete(next.taskId);
      activeTaskId = next.taskId;

      try {
        console.log(`[recurring-task] 开始串行执行 taskId=${next.taskId} queueRemaining=${runQueue.length}`);
        const summary = await performExecuteRun(next.taskId, next.signal);
        next.resolve(summary);
      } catch (error) {
        next.reject(error);
      } finally {
        activeTaskId = null;
      }
    }
  } finally {
    drainingQueue = false;
  }
}

async function executeRun(taskId: number, signal?: AbortSignal): Promise<RunSummary> {
  const task = await ScheduledTask.findByPk(taskId);
  if (!task) throw new Error('周期任务不存在');
  if (isRunning(task)) throw new Error('周期任务已在运行，跳过本次触发');
  if (isQueued(taskId)) throw new Error('周期任务已在队列中，跳过本次触发');

  return new Promise<RunSummary>((resolve, reject) => {
    runQueue.push({ taskId, signal, resolve, reject });
    queuedTaskIds.add(taskId);
    console.log(`[recurring-task] 已加入全局串行队列 taskId=${taskId} queueLength=${runQueue.length}`);
    void drainRunQueue();
  });
}

async function runNow(novelId: number | string): Promise<RunSummary> {
  const task = await findByNovel(novelId);
  if (!task) throw new Error('当前小说还没有周期任务');
  if (isBusy(task)) throw new Error('周期任务已在运行或排队中，请稍后再试');
  return executeRun(task.id);
}

async function initRecurringJobs(): Promise<void> {
  // Recover any task that was 'running' when the process died.
  await ScheduledTask.update(
    { last_run_status: 'failed', last_run_error: '服务重启时仍处于运行状态，已自动重置' } as any,
    { where: { task_type: RECURRING_TASK_TYPE, last_run_status: 'running' } }
  );

  const tasks = await ScheduledTask.findAll({
    where: { task_type: RECURRING_TASK_TYPE, enabled: true },
  });
  for (const task of tasks) {
    if (!task.cron_expression) continue;
    register(task);
  }
  console.log(`[recurring-task] 已加载 ${tasks.length} 个周期任务`);
}

export {
  findByNovel,
  upsert,
  remove,
  runNow,
  executeRun,
  findPendingChapterArchitectures,
  initRecurringJobs,
  serializeTask,
};
