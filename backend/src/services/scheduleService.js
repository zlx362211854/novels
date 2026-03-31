const db = require('../config/database');
const schedule = require('node-schedule');
const chapterService = require('./chapterService');

const scheduledJobs = new Map();

function create(data) {
  const stmt = db.prepare(`
    INSERT INTO scheduled_tasks (novel_id, chapter_id, task_type, scheduled_time, status)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    data.novelId,
    data.chapterId || null,
    data.taskType,
    data.scheduledTime.toISOString(),
    'pending'
  );

  const task = findById(result.lastInsertRowid);
  scheduleJob(task);

  return task;
}

function findAll() {
  const stmt = db.prepare('SELECT * FROM scheduled_tasks ORDER BY scheduled_time');
  return stmt.all();
}

function findById(id) {
  const stmt = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?');
  return stmt.get(id);
}

function deleteTask(id) {
  const task = findById(id);
  if (!task) return false;

  if (scheduledJobs.has(id)) {
    scheduledJobs.get(id).cancel();
    scheduledJobs.delete(id);
  }

  const stmt = db.prepare('DELETE FROM scheduled_tasks WHERE id = ?');
  stmt.run(id);
  return true;
}

function updateStatus(id, status, retryCount) {
  const stmt = db.prepare(`
    UPDATE scheduled_tasks 
    SET status = ?, retry_count = ?
    WHERE id = ?
  `);
  stmt.run(status, retryCount, id);
}

function scheduleJob(task) {
  if (task.status !== 'pending') return;

  const job = schedule.scheduleJob(new Date(task.scheduled_time), async () => {
    try {
      updateStatus(task.id, 'running', task.retry_count);

      if (task.task_type === 'generate' && task.chapter_id) {
        await chapterService.generate(task.chapter_id);
      }

      updateStatus(task.id, 'completed', task.retry_count);
    } catch (error) {
      console.error(`定时任务执行失败: ${task.id}`, error.message);

      if (task.retry_count < 3) {
        updateStatus(task.id, 'pending', task.retry_count + 1);
        const retryTime = new Date(Date.now() + 60000);
        const retryTask = { ...task, scheduled_time: retryTime, retry_count: task.retry_count + 1 };
        scheduleJob(retryTask);
      } else {
        updateStatus(task.id, 'failed', task.retry_count);
      }
    }
  });

  scheduledJobs.set(task.id, job);
}

function initScheduledJobs() {
  const tasks = db.prepare("SELECT * FROM scheduled_tasks WHERE status = 'pending'").all();
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
