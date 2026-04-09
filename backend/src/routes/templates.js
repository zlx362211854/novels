const express = require('express');
const router = express.Router();
const templateService = require('../services/templateService');

router.get('/', async (req, res) => {
  try {
    const templates = await templateService.findAll();
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, template, description } = req.body;
    if (!name || !template) {
      return res.status(400).json({ error: '名称和模板内容不能为空' });
    }
    const result = await templateService.create({ name, template, description });
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, template, description } = req.body;
    const result = await templateService.update(req.params.id, { name, template, description });
    if (!result) {
      return res.status(404).json({ error: '模板不存在' });
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await templateService.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: '模板不存在' });
    }
    res.json({ message: '删除成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/set-default', async (req, res) => {
  try {
    const result = await templateService.setDefault(req.params.id);
    if (!result) {
      return res.status(404).json({ error: '模板不存在' });
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
