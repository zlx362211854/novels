const express = require('express');
const router = express.Router();
const chapterService = require('../services/chapterService');
const aiService = require('../services/aiService');
const db = require('../config/database');

router.get('/:id', (req, res) => {
  try {
    const chapter = chapterService.findById(req.params.id);
    if (!chapter) {
      return res.status(404).json({ error: '章节不存在' });
    }
    res.json(chapter);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { title, content, status, architectureId } = req.body;
    const chapter = chapterService.update(req.params.id, {
      title,
      content,
      status,
      architectureId
    });
    if (!chapter) {
      return res.status(404).json({ error: '章节不存在' });
    }
    res.json(chapter);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const deleted = chapterService.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: '章节不存在' });
    }
    res.json({ message: '删除成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/generate', async (req, res) => {
  try {
    const { templateId } = req.body;
    const result = await chapterService.generate(req.params.id, templateId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/regenerate', async (req, res) => {
  console.log('=== regenerate 路由被调用 ===');
  console.log('章节ID:', req.params.id);
  try {
    const chapter = chapterService.findById(req.params.id);
    if (!chapter) {
      return res.status(404).json({ error: '章节不存在' });
    }

    if (!chapter.architecture_id) {
      return res.status(400).json({ error: '该章节没有关联的架构，无法重新生成' });
    }

    const novelStmt = db.prepare('SELECT * FROM novels WHERE id = ?');
    const novel = novelStmt.get(chapter.novel_id);
    if (!novel) {
      return res.status(404).json({ error: '小说不存在' });
    }

    console.log('准备调用 aiService.generateChapterFromArchitecture');
    const content = await aiService.generateChapterFromArchitecture({
      novelId: chapter.novel_id,
      chapterArchId: chapter.architecture_id
    });
    console.log('AI生成完成，内容长度:', content?.length);

    const updatedChapter = chapterService.update(req.params.id, {
      content,
      status: 'generated'
    });

    res.json(updatedChapter);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/versions', (req, res) => {
  try {
    const versions = chapterService.getVersions(req.params.id);
    res.json(versions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/restore/:version', (req, res) => {
  try {
    const chapter = chapterService.restoreVersion(req.params.id, parseInt(req.params.version));
    if (!chapter) {
      return res.status(404).json({ error: '章节或版本不存在' });
    }
    res.json(chapter);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
