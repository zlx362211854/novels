const { ScheduledTask, Chapter } = require('../models/sequelize');
const schedule = require('node-schedule');
const chapterService = require('./chapterService');

const scheduledJobs = new Map();

async function create(data) {
  const task = await ScheduledTask.create({
    novel_id: data.novelId,
    chapter_id: data.chapterId || null,
    task_type: data.taskType,
    scheduled_time: data.scheduledTime.toISOString(),
    status: 'pending'
  });

  const savedTask = await findById(task.id);
  scheduleJob(savedTask);

  return savedTask;
}

async function findAll() {
  const tasks = await ScheduledTask.findAll({
    order: [['scheduled_time', 'ASC']]
  });
  return tasks;
}

async function findById(id) {
  const task = await ScheduledTask.findByPk(id);
  return task;
}

async function deleteTask(id) {
  const task = await ScheduledTask.findByPk(id);
  if (!task) return false;

  if (scheduledJobs.has(id)) {
    scheduledJobs.get(id).cancel();
    scheduledJobs.delete(id);
  }

  await task.destroy();
  return true;
}

async function updateStatus(id, status, retryCount) {
  const task = await ScheduledTask.findByPk(id);
  if (!task) return;

  task.status = status;
  task.retry_count = retryCount;
  await task.save();
}

function scheduleJob(task) {
  if (task.status !== 'pending') return;

  const job = schedule.scheduleJob(new Date(task.scheduled_time), async () => {
    try {
      await updateStatus(task.id, 'running', task.retry_count);

      if (task.task_type === 'generate' && task.chapter_id) {
        await chapterService.generate(task.chapter_id);
      }

      await updateStatus(task.id, 'completed', task.retry_count);
    } catch (error) {
      console.error(`定时任务执行失败: ${task.id}`, error.message);

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

async function initScheduledJobs() {
  const tasks = await ScheduledTask.findAll({
    where: { status: 'pending' }
  });

  tasks.forEach(task => {
    if (new Date(task.scheduled_time) > new Date()) {
      scheduleJob(task);
    }
  });

  console.log(`已恢复 ${tasks.length} 个定时任务`);
}

module.exports = {
  create,
  findAll,
  findById,
  delete: deleteTask,
  initScheduledJobs
};
