const express = require('express');
const router = express.Router();
const novelService = require('../services/novelService');
const chapterService = require('../services/chapterService');
const architectureService = require('../services/architectureService');
const architectureAiService = require('../services/architectureAiService');
const aiService = require('../services/aiService');

router.post('/', (req, res) => {
  try {
    const { title, description, genre } = req.body;
    if (!title) {
      return res.status(400).json({ error: '标题不能为空' });
    }
    const novel = novelService.create({ title, description, genre });
    res.status(201).json(novel);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', (req, res) => {
  try {
    const novels = novelService.findAll();
    res.json(novels);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const novel = novelService.findById(req.params.id);
    if (!novel) {
      return res.status(404).json({ error: '小说不存在' });
    }
    res.json(novel);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { title, description, genre } = req.body;
    const novel = novelService.update(req.params.id, { title, description, genre });
    if (!novel) {
      return res.status(404).json({ error: '小说不存在' });
    }
    res.json(novel);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const deleted = novelService.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: '小说不存在' });
    }
    res.json({ message: '删除成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/chapters', (req, res) => {
  try {
    const { architectureId, chapterNumber, title, content, status } = req.body;
    if (!chapterNumber) {
      return res.status(400).json({ error: '章节序号不能为空' });
    }
    const chapter = chapterService.create({
      novelId: req.params.id,
      architectureId,
      chapterNumber,
      title,
      content,
      status
    });
    res.status(201).json(chapter);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/chapters', (req, res) => {
  try {
    const chapters = chapterService.findByNovelId(req.params.id);
    res.json(chapters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/architectures', (req, res) => {
  try {
    const { level, parentId, title, plotOutline, characters, worldSetting, emotionalTone, metadata } = req.body;
    if (!title || !level) {
      return res.status(400).json({ error: '标题和层级不能为空' });
    }
    const architecture = architectureService.create({
      novelId: req.params.id,
      level,
      parentId,
      title,
      plotOutline,
      characters,
      worldSetting,
      emotionalTone,
      metadata
    });
    res.status(201).json(architecture);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/architectures', (req, res) => {
  try {
    const architectures = architectureService.findByNovelId(req.params.id);
    res.json(architectures);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/generate-architecture', async (req, res) => {
  try {
    const { level, parentId, title } = req.body;
    const result = await architectureAiService.generateArchitecture({
      novelId: req.params.id,
      level,
      parentId,
      title
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/generate-chapter-architectures', async (req, res) => {
  try {
    const { volumeId } = req.body;
    if (!volumeId) {
      return res.status(400).json({ error: '卷架构ID不能为空' });
    }
    const chapters = await architectureAiService.generateChapterArchitectures({
      novelId: req.params.id,
      volumeId
    });
    res.json(chapters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/batch-create-chapter-architectures', (req, res) => {
  try {
    const { volumeId, chapters } = req.body;
    if (!volumeId || !chapters || !Array.isArray(chapters)) {
      return res.status(400).json({ error: '参数错误' });
    }
    const created = chapters.map(ch => {
      return architectureService.create({
        novelId: req.params.id,
        level: 'chapter',
        parentId: volumeId,
        title: ch.title,
        plotOutline: ch.plotOutline,
        characters: '',
        worldSetting: '',
        emotionalTone: ''
      });
    });
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/generate-chapter-content', async (req, res) => {
  try {
    const { chapterArchId } = req.body;
    if (!chapterArchId) {
      return res.status(400).json({ error: '章架构ID不能为空' });
    }
    const content = await aiService.generateChapterFromArchitecture({
      novelId: req.params.id,
      chapterArchId
    });
    res.json({ content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/batch-generate-chapters', async (req, res) => {
  try {
    const { volumeId } = req.body;
    if (!volumeId) {
      return res.status(400).json({ error: '卷架构ID不能为空' });
    }

    const chapterArchs = architectureService.findByParentId(volumeId);
    if (chapterArchs.length === 0) {
      return res.status(400).json({ error: '该卷下没有章架构' });
    }

    const results = [];
    for (const arch of chapterArchs) {
      try {
        const content = await aiService.generateChapterFromArchitecture({
          novelId: req.params.id,
          chapterArchId: arch.id
        });

        const chapter = chapterService.create({
          novelId: parseInt(req.params.id),
          architectureId: arch.id,
          chapterNumber: results.length + 1,
          title: arch.title,
          content: content,
          status: 'generated'
        });
        results.push({ success: true, chapter, archId: arch.id });
      } catch (error) {
        results.push({ success: false, archId: arch.id, error: error.message });
      }
    }
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
