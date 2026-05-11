import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { ScheduledTask, Chapter } from '../../models/sequelize';
import { createProgressTracker, ProgressTracker } from '../progressAdapter';
import * as recurringTaskService from '../../services/recurringTaskService';
import { chapterGenerationGraph } from './chapterGenerationGraph';

const MAX_CHAPTERS_PER_RUN = 50;

interface RunSummary {
  attempted: number;
  generated: number[];
  failed: { chapterArchId: number; reason: string }[];
}

const RecurringTaskState = Annotation.Root({
  // Inputs
  recurringTaskId: Annotation<number>,
  signal: Annotation<AbortSignal | undefined>,
  taskId: Annotation<string>,

  // Loaded
  task: Annotation<any>,
  novelId: Annotation<number>,
  chaptersPerRun: Annotation<number>,
  pending: Annotation<any[]>,

  // Output
  summary: Annotation<RunSummary>,
  errorMessage: Annotation<string | null>,
});

function clampChaptersPerRun(value: any): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > MAX_CHAPTERS_PER_RUN) return MAX_CHAPTERS_PER_RUN;
  return Math.floor(n);
}

function getTracker(taskId: string): ProgressTracker {
  return createProgressTracker(taskId, [
    '加锁并加载任务',
    '查找未生成章节',
    '生成章节内容',
    '汇总结果',
  ]);
}

async function loadTaskNode(state: typeof RecurringTaskState.State) {
  const tracker = getTracker(state.taskId);
  tracker.start('运行周期任务');
  tracker.step(0);

  const task = await ScheduledTask.findByPk(state.recurringTaskId);
  if (!task) throw new Error(`周期任务不存在: ${state.recurringTaskId}`);
  if (task.last_run_status === 'running') {
    throw new Error('周期任务已在运行，跳过本次触发');
  }

  task.last_run_status = 'running';
  task.last_run_error = null;
  task.last_run_result = null;
  task.last_run_at = new Date();
  await task.save();

  console.log(
    `[recurring-graph] 任务加锁 taskId=${state.recurringTaskId} novelId=${task.novel_id} chaptersPerRun=${task.chapters_per_run}`
  );

  return {
    task,
    novelId: task.novel_id,
    chaptersPerRun: clampChaptersPerRun(task.chapters_per_run),
    summary: { attempted: 0, generated: [], failed: [] },
    errorMessage: null,
  };
}

async function findPendingNode(state: typeof RecurringTaskState.State) {
  const tracker = getTracker(state.taskId);
  tracker.step(1);

  const pending = await recurringTaskService.findPendingChapterArchitectures(
    state.novelId,
    state.chaptersPerRun
  );

  console.log(
    `[recurring-graph] 找到 ${pending.length} 章待生成 novelId=${state.novelId}`
  );
  return { pending };
}

async function ensureChapterRow(novelId: number, archId: number, title: string): Promise<any> {
  const existing = await Chapter.findOne({ where: { architecture_id: archId } });
  if (existing) return existing;
  const others = await Chapter.findAll({
    where: { novel_id: novelId },
    attributes: ['chapter_number'],
  });
  const maxNumber = others.reduce(
    (m: number, c: any) => Math.max(m, c.chapter_number || 0),
    0
  );
  return Chapter.create({
    novel_id: novelId,
    architecture_id: archId,
    chapter_number: maxNumber + 1,
    title,
    content: '',
    review_result: null,
    publish_result: null,
    status: 'generating',
  });
}

async function generateChaptersNode(state: typeof RecurringTaskState.State) {
  const tracker = getTracker(state.taskId);
  tracker.step(2);

  const summary: RunSummary = {
    attempted: state.pending.length,
    generated: [],
    failed: [],
  };

  for (let i = 0; i < state.pending.length; i += 1) {
    if (state.signal?.aborted) {
      summary.failed.push({
        chapterArchId: state.pending[i].architecture.id,
        reason: '已取消',
      });
      continue;
    }
    const arch = state.pending[i].architecture;
    try {
      const chapter = await ensureChapterRow(
        state.novelId,
        arch.id,
        arch.title || '未命名章节'
      );
      // Reuse the canonical generate → review → revise loop.
      const subTaskId = `recurring-${state.recurringTaskId}-${chapter.id}-${Date.now()}`;
      await chapterGenerationGraph.invoke(
        {
          chapterId: chapter.id,
          signal: state.signal,
          userPrompt: '',
          taskId: subTaskId,
          chapter: null,
          novel: null,
          architecture: null,
          generatedContent: '',
          reviewResult: null,
          reviewWarning: '',
          autoRevisionRounds: 0,
          updatedChapter: null,
        },
        { signal: state.signal }
      );
      summary.generated.push(chapter.id);
    } catch (err: any) {
      const reason = err?.message || String(err);
      console.error(
        `[recurring-graph] 章节生成失败 archId=${arch.id}: ${reason}`
      );
      summary.failed.push({ chapterArchId: arch.id, reason });
    }
  }

  return { summary };
}

async function finalizeNode(state: typeof RecurringTaskState.State) {
  const tracker = getTracker(state.taskId);
  tracker.step(3);

  const summary = state.summary || { attempted: 0, generated: [], failed: [] };
  const failed = summary.failed.length;
  const generated = summary.generated.length;
  let status: string;
  if (state.errorMessage) {
    status = 'failed';
  } else if (summary.attempted === 0) {
    status = 'idle';
  } else if (failed === 0 && generated > 0) {
    status = 'success';
  } else if (failed > 0 && generated > 0) {
    status = 'partial';
  } else {
    status = 'failed';
  }

  const task = await ScheduledTask.findByPk(state.recurringTaskId);
  if (task) {
    task.last_run_status = status;
    task.last_run_error = state.errorMessage || null;
    task.last_run_result = JSON.stringify(summary);
    if (task.cron_expression && task.enabled) {
      // Avoid importing node-schedule here just for next-run computation;
      // the service layer recomputes next_run_at on save / register, this
      // path keeps the previous value if the service didn't already update it.
    }
    await task.save();
  }

  tracker.finish();
  console.log(
    `[recurring-graph] 运行结束 taskId=${state.recurringTaskId} status=${status} attempted=${summary.attempted} generated=${generated} failed=${failed}`
  );

  return { summary };
}

const graph = new StateGraph(RecurringTaskState)
  .addNode('loadTask', loadTaskNode)
  .addNode('findPending', findPendingNode)
  .addNode('generateChapters', generateChaptersNode)
  .addNode('finalize', finalizeNode)
  .addEdge(START, 'loadTask')
  .addEdge('loadTask', 'findPending')
  .addEdge('findPending', 'generateChapters')
  .addEdge('generateChapters', 'finalize')
  .addEdge('finalize', END)
  .compile();

export { graph as recurringTaskGraph, RecurringTaskState };
