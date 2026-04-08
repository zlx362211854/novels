const express = require('express');
const router = express.Router();
const novelService = require('../services/novelService');
const chapterService = require('../services/chapterService');
const architectureService = require('../services/architectureService');
const architectureAiService = require('../services/architectureAiService');
const architectureReviewService = require('../services/architectureReviewService');
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
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('[abort] 客户端断开 → generate-architecture 已中止');
      ac.abort();
    }
  });
  try {
    const { level, parentId, title } = req.body;
    const result = await architectureAiService.generateArchitecture({
      novelId: req.params.id,
      level,
      parentId,
      title
    }, ac.signal);
    res.json(result);
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/generate-chapter-architectures', async (req, res) => {
  console.log(`[route] POST generate-chapter-architectures novelId=${req.params.id} volumeId=${req.body?.volumeId}`);
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('[abort] 客户端断开 → generate-chapter-architectures 已中止');
      ac.abort();
    }
  });
  try {
    const { volumeId } = req.body;
    if (!volumeId) {
      return res.status(400).json({ error: '卷架构ID不能为空' });
    }
    const chapters = await architectureAiService.generateChapterArchitectures({
      novelId: req.params.id,
      volumeId
    }, ac.signal);
    console.log(`[route] generate-chapter-architectures 完成，返回 ${chapters.length} 条`);
    res.json(chapters);
  } catch (error) {
    if (ac.signal.aborted) return;
    console.error('[route] generate-chapter-architectures 异常:', error.message);
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
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('[abort] 客户端断开 → generate-chapter-content 已中止');
      ac.abort();
    }
  });
  try {
    const { chapterArchId } = req.body;
    if (!chapterArchId) {
      return res.status(400).json({ error: '章架构ID不能为空' });
    }
    const content = await aiService.generateChapterFromArchitecture({
      novelId: req.params.id,
      chapterArchId
    }, ac.signal);
    res.json({ content });
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/batch-generate-chapters', async (req, res) => {
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('[abort] 客户端断开 → batch-generate-chapters 已中止');
      ac.abort();
    }
  });
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
      if (ac.signal.aborted) break;
      try {
        const content = await aiService.generateChapterFromArchitecture({
          novelId: req.params.id,
          chapterArchId: arch.id
        }, ac.signal);

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
        if (ac.signal.aborted) break;
        results.push({ success: false, archId: arch.id, error: error.message });
      }
    }
    if (ac.signal.aborted) return;
    res.json(results);
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: error.message });
  }
});

// 架构审阅
router.post('/:id/review-architectures', async (req, res) => {
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('[abort] 客户端断开 → review-architectures 已中止');
      ac.abort();
    }
  });
  try {
    const result = await architectureReviewService.reviewArchitectures(req.params.id, ac.signal);
    res.json(result);
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: error.message });
  }
});

// 架构重写
router.post('/:id/rewrite-architectures', async (req, res) => {
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('[abort] 客户端断开 → rewrite-architectures 已中止');
      ac.abort();
    }
  });
  try {
    const { reviewResult, userPrompt } = req.body;
    if (!reviewResult) {
      return res.status(400).json({ error: '审阅结果不能为空' });
    }
    const result = await architectureReviewService.rewriteArchitectures(
      req.params.id,
      reviewResult,
      userPrompt,
      ac.signal
    );
    res.json(result);
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: error.message });
  }
});

// 批量应用重写结果（处理增删改）
router.post('/:id/apply-rewrite', (req, res) => {
  try {
    const novelId = req.params.id;
    const { fullArchitecture, volumes } = req.body;
    if (!fullArchitecture || !volumes) {
      return res.status(400).json({ error: '缺少重写结果数据' });
    }

    const existingArchs = architectureService.findByNovelId(novelId);
    const existingFull = existingArchs.find(a => a.level === 'full');
    const existingVolumes = existingArchs.filter(a => a.level === 'volume');
    const existingChapters = existingArchs.filter(a => a.level === 'chapter');

    const stats = { updated: 0, created: 0, deleted: 0 };

    // 1. 更新全本架构
    if (existingFull) {
      architectureService.update(existingFull.id, {
        title: fullArchitecture.title,
        plotOutline: fullArchitecture.plotOutline,
        characters: fullArchitecture.characters,
        worldSetting: fullArchitecture.worldSetting,
        emotionalTone: fullArchitecture.emotionalTone,
      });
      stats.updated++;
    }

    // 2. 更新卷架构 + 处理章节增删
    for (const vol of volumes) {
      // 更新卷本身
      const existingVol = existingVolumes.find(v => String(v.id) === String(vol.id));
      if (existingVol) {
        architectureService.update(existingVol.id, {
          title: vol.title,
          plotOutline: vol.plotOutline,
          characters: vol.characters,
          worldSetting: vol.worldSetting,
          emotionalTone: vol.emotionalTone,
        });
        stats.updated++;
      }

      const parentId = existingVol ? existingVol.id : null;
      if (!parentId) continue;

      // 该卷下的现有章节
      const volExistingChapters = existingChapters.filter(ch => ch.parent_id === parentId);
      const newChapters = vol.chapters || [];

      // 收集 AI 返回的有效已存在 ID
      const rewriteChapterIds = new Set();
      for (const ch of newChapters) {
        const existingCh = volExistingChapters.find(e => String(e.id) === String(ch.id));
        if (existingCh) {
          rewriteChapterIds.add(existingCh.id);
        }
      }

      // 删除不在重写结果中的旧章节
      for (const existingCh of volExistingChapters) {
        if (!rewriteChapterIds.has(existingCh.id)) {
          architectureService.delete(existingCh.id);
          stats.deleted++;
        }
      }

      // 更新已有章节 / 创建新章节
      for (const ch of newChapters) {
        const existingCh = volExistingChapters.find(e => String(e.id) === String(ch.id));
        if (existingCh) {
          architectureService.update(existingCh.id, {
            title: ch.title,
            plotOutline: ch.plotOutline,
          });
          stats.updated++;
        } else {
          architectureService.create({
            novelId,
            level: 'chapter',
            parentId,
            title: ch.title,
            plotOutline: ch.plotOutline,
          });
          stats.created++;
        }
      }
    }

    res.json({
      message: '架构更新完成',
      stats,
    });
  } catch (error) {
    console.error('应用重写结果失败:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
