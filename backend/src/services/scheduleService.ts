import { ScheduledTask, Chapter } from '../models/sequelize';
import * as schedule from 'node-schedule';
import * as chapterService from './chapterService';

const scheduledJobs = new Map();

interface CreateTaskData {
  novelId: number;
  chapterId?: number;
  taskType: string;
  scheduledTime: Date;
}

interface TaskData {
  id: number;
  novel_id: number;
  chapter_id: number | null;
  task_type: string;
  scheduled_time: string;
  status: string;
  retry_count: number;
}

async function create(data: CreateTaskData): Promise<any> {
  const task = await ScheduledTask.create({
    novel_id: data.novelId,
    chapter_id: data.chapterId || null,
    task_type: data.taskType,
    scheduled_time: data.scheduledTime,
    status: 'pending'
  });

  const savedTask = await findById(task.id);
  if (savedTask) scheduleJob(savedTask);

  return savedTask;
}

async function findAll(): Promise<any[]> {
  const tasks = await ScheduledTask.findAll({
    order: [['scheduled_time', 'ASC']]
  });
  return tasks;
}

async function findById(id: number): Promise<any> {
  const task = await ScheduledTask.findByPk(id);
  return task;
}

async function deleteTask(id: number): Promise<boolean> {
  const task = await ScheduledTask.findByPk(id);
  if (!task) return false;

  if (scheduledJobs.has(id)) {
    scheduledJobs.get(id).cancel();
    scheduledJobs.delete(id);
  }

  await task.destroy();
  return true;
}

async function updateStatus(id: number, status: string, retryCount: number): Promise<void> {
  const task = await ScheduledTask.findByPk(id);
  if (!task) return;

  task.status = status;
  task.retry_count = retryCount;
  await task.save();
}

function scheduleJob(task: any): void {
  if (task.status !== 'pending') return;

  const job = schedule.scheduleJob(new Date(task.scheduled_time), async () => {
    try {
      await updateStatus(task.id, 'running', task.retry_count);

      if (task.task_type === 'generate' && task.chapter_id) {
        await chapterService.generate(task.chapter_id);
      }

      await updateStatus(task.id, 'completed', task.retry_count);
    } catch (error) {
      console.error(`定时任务执行失败: ${task.id}`, (error as Error).message);

      if (task.retry_count < 3) {
        await updateStatus(task.id, 'pending', task.retry_count + 1);
        const retryTime = new Date(Date.now() + 60000);
        const retryTask = { ...task, scheduled_time: retryTime, retry_count: task.retry_count + 1 };
        scheduleJob(retryTask);
      } else {
        await updateStatus(task.id, 'failed', task.retry_count);
      }
    }
  });

  scheduledJobs.set(task.id, job);
}

async function getTasks(): Promise<any[]> {
  return findAll();
}

async function createTask(data: CreateTaskData): Promise<any> {
  return create(data);
}

function initScheduledJobs(): void {
  console.log('初始化定时任务...');
  scheduledJobs.clear();
}

export {
  create,
  findAll,
  findById,
  deleteTask,
  updateStatus,
  getTasks,
  createTask,
  initScheduledJobs
};