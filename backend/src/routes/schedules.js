const express = require('express');
const router = express.Router();
const scheduleService = require('../services/scheduleService');

router.post('/', (req, res) => {
  try {
    const { novelId, chapterId, taskType, scheduledTime } = req.body;
    if (!novelId || !taskType || !scheduledTime) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    const task = scheduleService.create({
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

router.get('/', (req, res) => {
  try {
    const tasks = scheduleService.findAll();
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const deleted = scheduleService.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: '任务不存在' });
    }
    res.json({ message: '删除成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
