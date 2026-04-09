const express = require('express');
const router = express.Router();
const { Novel, Chapter, Architecture } = require('../models/sequelize');
const novelService = require('../services/novelService');
const chapterService = require('../services/chapterService');
const architectureService = require('../services/architectureService');
const architectureAiService = require('../services/architectureAiService');
const architectureReviewService = require('../services/architectureReviewService');
const aiService = require('../services/aiService');

router.post('/', async (req, res) => {
  try {
    const { title, description, genre } = req.body;
    if (!title) {
      return res.status(400).json({ error: '标题不能为空' });
    }
    const novel = await novelService.create({ title, description, genre });
    res.status(201).json(novel);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const novels = await novelService.findAll();
    res.json(novels);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const novel = await novelService.findById(req.params.id);
    if (!novel) {
      return res.status(404).json({ error: '小说不存在' });
    }
    res.json(novel);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { title, description, genre } = req.body;
    const novel = await novelService.update(req.params.id, { title, description, genre });
    if (!novel) {
      return res.status(404).json({ error: '小说不存在' });
    }
    res.json(novel);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await novelService.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: '小说不存在' });
    }
    res.json({ message: '删除成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/chapters', async (req, res) => {
  try {
    const { architectureId, chapterNumber, title, content, status } = req.body;
    if (!chapterNumber) {
      return res.status(400).json({ error: '章节序号不能为空' });
    }
    const chapter = await chapterService.create({
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

router.get('/:id/chapters', async (req, res) => {
  try {
    const chapters = await chapterService.findByNovelId(req.params.id);
    res.json(chapters);
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
    const novelId = req.params.id;
    if (!chapterArchId) {
      return res.status(400).json({ error: '缺少 chapterArchId 参数' });
    }

    const chapterArch = await architectureService.findById(chapterArchId);
    if (!chapterArch) {
      return res.status(404).json({ error: '架构不存在' });
    }
    if (chapterArch.level !== 'chapter') {
      return res.status(400).json({ error: '该架构不是章节级别' });
    }

    let chapter = await Chapter.findOne({ where: { architecture_id: chapterArchId } });
    if (!chapter) {
      chapter = await chapterService.create({
        novelId: novelId,
        architectureId: chapterArchId,
        title: chapterArch.title,
        order: chapterArch.id,
        chapterNumber: chapterArch.id,
        status: 'pending'
      });
    }

    const result = await chapterService.generate(chapter.id, null, ac.signal);
    res.json(result);
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/batch-create-chapter-architectures', async (req, res) => {
  try {
    const { volumeId, chapters } = req.body;
    const novelId = req.params.id;
    const created = [];
    for (const ch of chapters) {
      const createdCh = await architectureService.create({
        novelId: novelId,
        level: 'chapter',
        parentId: volumeId || null,
        title: ch.title,
        plotOutline: ch.plot_outline || ch.plotOutline || ''
      });
      created.push(createdCh);
    }
    res.json(created);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/architectures', async (req, res) => {
  try {
    const architectures = await architectureService.findByNovelId(req.params.id);
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
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('[abort] 客户端断开 → generate-chapter-architectures 已中止');
      ac.abort();
    }
  });
  try {
    const { volumeId } = req.body;
    const result = await architectureAiService.generateChapterArchitectures({
      novelId: req.params.id,
      volumeId
    }, ac.signal);
    res.json(result);
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: error.message });
  }
});

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
    const result = await architectureReviewService.rewriteArchitectures(req.params.id, reviewResult, userPrompt, ac.signal);
    res.json(result);
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/architectures/:architectureId', async (req, res) => {
  try {
    const architecture = await architectureService.findById(req.params.architectureId);
    if (!architecture) {
      return res.status(404).json({ error: '架构不存在' });
    }
    res.json(architecture);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/architectures/:architectureId/children', async (req, res) => {
  try {
    const architectures = await architectureService.findByParentId(req.params.architectureId);
    res.json(architectures);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/architectures/:architectureId', async (req, res) => {
  try {
    const { title, plotOutline, characters, worldSetting, emotionalTone, metadata } = req.body;
    const architecture = await architectureService.update(req.params.architectureId, {
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

router.delete('/:id/architectures/:architectureId', async (req, res) => {
  try {
    const deleted = await architectureService.delete(req.params.architectureId);
    if (!deleted) {
      return res.status(404).json({ error: '架构不存在' });
    }
    res.json({ message: '删除成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/generate-full-architecture', async (req, res) => {
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('[abort] 客户端断开 → generate-full-architecture 已中止');
      ac.abort();
    }
  });
  try {
    const result = await architectureAiService.generateArchitecture({
      novelId: req.params.id,
      level: 'full'
    }, ac.signal);
    res.json(result);
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/generate-volume/:parentId', async (req, res) => {
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('[abort] 客户端断开 → generate-volume 已中止');
      ac.abort();
    }
  });
  try {
    const { title } = req.body;
    const result = await architectureAiService.generateArchitecture({
      novelId: req.params.id,
      level: 'volume',
      parentId: req.params.parentId,
      title
    }, ac.signal);
    res.json(result);
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/volumes/:volumeId/chapters', async (req, res) => {
  try {
    const chapters = await chapterService.findByNovelId(req.params.id);
    const volumeId = parseInt(req.params.volumeId);
    const chapterArchs = await architectureService.findByParentId(volumeId);
    const chapterArchIds = new Set(chapterArchs.map(a => a.id));
    const filteredChapters = chapters.filter(c => c.architecture_id && chapterArchIds.has(c.architecture_id));
    res.json(filteredChapters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/volumes/:volumeId/chapters', async (req, res) => {
  try {
    const { architectureId, chapterNumber, title, content, status } = req.body;
    if (!chapterNumber) {
      return res.status(400).json({ error: '章节序号不能为空' });
    }
    const chapter = await chapterService.create({
      novelId: req.params.id,
      architectureId: architectureId || req.params.volumeId,
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

router.post('/:id/volumes/:volumeId/generate-chapters', async (req, res) => {
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('[abort] 客户端断开 → generate-chapters 已中止');
      ac.abort();
    }
  });
  try {
    const { startNumber } = req.body;
    const chapterArchs = await architectureService.findByParentId(req.params.volumeId);
    const chapters = [];
    let currentNumber = startNumber || 1;
    for (const arch of chapterArchs) {
      const chapter = await chapterService.create({
        novelId: req.params.id,
        architectureId: arch.id,
        chapterNumber: currentNumber,
        title: arch.title,
        status: 'draft'
      });
      chapters.push(chapter);
      currentNumber++;
    }
    res.json(chapters);
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/apply-review', async (req, res) => {
  try {
    const { reviewResult } = req.body;
    const novelId = req.params.id;
    const existingArchs = await architectureService.findByNovelId(novelId);
    const fullArch = existingArchs.find(a => a.level === 'full');
    const volumes = existingArchs.filter(a => a.level === 'volume').sort((a, b) => a.id - b.id);
    const chapters = existingArchs.filter(a => a.level === 'chapter').sort((a, b) => a.id - b.id);
    if (reviewResult.fullArchitecture && fullArch) {
      await architectureService.update(fullArch.id, {
        title: reviewResult.fullArchitecture.title,
        plotOutline: reviewResult.fullArchitecture.plotOutline,
        characters: reviewResult.fullArchitecture.characters,
        worldSetting: reviewResult.fullArchitecture.worldSetting,
        emotionalTone: reviewResult.fullArchitecture.emotionalTone
      });
    }
    if (reviewResult.volumes) {
      for (const vol of reviewResult.volumes) {
        const existingVol = volumes.find(v => String(v.id) === String(vol.id));
        if (existingVol) {
          await architectureService.update(existingVol.id, {
            title: vol.title,
            plotOutline: vol.plotOutline,
            characters: vol.characters,
            worldSetting: vol.worldSetting,
            emotionalTone: vol.emotionalTone
          });
        }
      }
      for (const vol of reviewResult.volumes) {
        if (vol.chapters) {
          const existingVol = volumes.find(v => String(v.id) === String(vol.id));
          const existingChapters = existingVol
            ? chapters.filter(ch => ch.parent_id === existingVol.id)
            : [];
          for (const existingCh of existingChapters) {
            await architectureService.delete(existingCh.id);
          }
          for (const ch of vol.chapters) {
            const existingCh = existingChapters.find(ec => String(ec.id) === String(ch.id));
            if (existingCh) {
              await architectureService.update(existingCh.id, {
                title: ch.title,
                plotOutline: ch.plotOutline
              });
            } else {
              await architectureService.create({
                novelId: novelId,
                level: 'chapter',
                parentId: existingVol?.id,
                title: ch.title,
                plotOutline: ch.plotOutline
              });
            }
          }
        }
      }
    }
    const updatedArchs = await architectureService.findByNovelId(novelId);
    res.json(updatedArchs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/batch-create-chapter-architectures', async (req, res) => {
  try {
    const { volumeId, chapters } = req.body;
    const novelId = req.params.id;
    const created = [];
    for (const ch of chapters) {
      const createdCh = await architectureService.create({
        novelId: novelId,
        level: 'chapter',
        parentId: volumeId || null,
        title: ch.title,
        plotOutline: ch.plot_outline || ch.plotOutline || ''
      });
      created.push(createdCh);
    }
    res.json(created);
  } catch (error) {
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
    const novelId = req.params.id;
    const chapterArchs = await architectureService.findByNovelId(novelId);
    const chapters = chapterArchs.filter(a => a.level === 'chapter');
    const results = [];
    for (const ch of chapters) {
      if (ac.signal.aborted) break;
      try {
        const result = await chapterService.generate(ch.id, null, ac.signal);
        results.push({ chapterId: ch.id, result });
      } catch (e) {
        if (ac.signal.aborted) break;
        console.error(`生成章节 ${ch.id} 失败:`, e.message);
      }
    }
    res.json(results);
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/apply-rewrite', async (req, res) => {
  try {
    const { rewriteResult } = req.body;
    const novelId = req.params.id;
    const existingArchs = await architectureService.findByNovelId(novelId);
    const fullArch = existingArchs.find(a => a.level === 'full');
    const volumes = existingArchs.filter(a => a.level === 'volume').sort((a, b) => a.id - b.id);
    const chapters = existingArchs.filter(a => a.level === 'chapter').sort((a, b) => a.id - b.id);
    if (rewriteResult.fullArchitecture && fullArch) {
      await architectureService.update(fullArch.id, {
        title: rewriteResult.fullArchitecture.title,
        plotOutline: rewriteResult.fullArchitecture.plotOutline,
        characters: rewriteResult.fullArchitecture.characters,
        worldSetting: rewriteResult.fullArchitecture.worldSetting,
        emotionalTone: rewriteResult.fullArchitecture.emotionalTone
      });
    }
    if (rewriteResult.volumes) {
      for (const vol of rewriteResult.volumes) {
        const existingVol = volumes.find(v => String(v.id) === String(vol.id));
        if (existingVol) {
          await architectureService.update(existingVol.id, {
            title: vol.title,
            plotOutline: vol.plotOutline
          });
        }
      }
    }
    if (rewriteResult.chapters) {
      const currentVolume = chapters[0]?.parentId;
      for (const ch of rewriteResult.chapters) {
        const existingCh = chapters.find(c => String(c.id) === String(ch.id));
        if (existingCh) {
          await architectureService.update(existingCh.id, {
            title: ch.title,
            plotOutline: ch.plotOutline
          });
        }
      }
    }
    const updatedArchs = await architectureService.findByNovelId(novelId);
    res.json(updatedArchs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
