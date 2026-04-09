const express = require('express');
const router = express.Router();
const scheduleService = require('../services/scheduleService');

router.post('/', async (req, res) => {
  try {
    const { novelId, chapterId, taskType, scheduledTime } = req.body;
    if (!novelId || !taskType || !scheduledTime) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    const task = await scheduleService.create({
      novelId,
      chapterId,
      taskType,
      scheduledTime: new Date(scheduledTime)
    });
    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const tasks = await scheduleService.findAll();
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await scheduleService.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: '任务不存在' });
    }
    res.json({ message: '删除成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
