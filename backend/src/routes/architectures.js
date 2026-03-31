const express = require('express');
const router = express.Router();
const architectureService = require('../services/architectureService');

router.get('/:id', (req, res) => {
  try {
    const architecture = architectureService.findById(req.params.id);
    if (!architecture) {
      return res.status(404).json({ error: '架构不存在' });
    }
    res.json(architecture);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { title, plotOutline, characters, worldSetting, emotionalTone, metadata } = req.body;
    const architecture = architectureService.update(req.params.id, {
      title,
      plotOutline,
      characters,
      worldSetting,
      emotionalTone,
      metadata
    });
    if (!architecture) {
      return res.status(404).json({ error: '架构不存在' });
    }
    res.json(architecture);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const deleted = architectureService.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: '架构不存在' });
    }
    res.json({ message: '删除成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
