const express = require('express');
const router = express.Router({ mergeParams: true });

router.post('/:id/revise', async (req, res) => {
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('[abort] 客户端断开 → chapter/revise 已中止');
      ac.abort();
    }
  });
  try {
    req.setTimeout(0);
    const { reviewResult } = req.body;
    const result = await chapterService.reviseChapter(req.params.id, reviewResult, ac.signal);
    res.json(result);
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const chapter = await chapterService.findById(req.params.id);
    if (!chapter) {
      return res.status(404).json({ error: '章节不存在' });
    }
    res.json(chapter);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { title, content, status, architectureId, regenerateMemory = true } = req.body;
    const chapter = await chapterService.update(
      req.params.id,
      { title, content, status, architectureId },
      { regenerateMemory }
    );
    if (!chapter) {
      return res.status(404).json({ error: '章节不存在' });
    }
    res.json(chapter);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await chapterService.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: '章节不存在' });
    }
    res.json({ message: '删除成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/generate', async (req, res) => {
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('[abort] 客户端断开 → chapter/generate 已中止');
      ac.abort();
    }
  });
  try {
    req.setTimeout(0);
    const result = await chapterService.generate(req.params.id, ac.signal);
    res.json(result);
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/regenerate', async (req, res) => {
  console.log('=== regenerate 路由被调用 ===');
  console.log('章节ID:', req.params.id);
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('[abort] 客户端断开 → chapter/regenerate 已中止');
      ac.abort();
    }
  });
  try {
    req.setTimeout(0);
    const chapter = await chapterService.findById(req.params.id);
    if (!chapter) {
      return res.status(404).json({ error: '章节不存在' });
    }

    if (!chapter.architecture_id) {
      return res.status(400).json({ error: '该章节没有关联的架构，无法重新生成' });
    }

    const novel = await Novel.findByPk(chapter.novel_id);
    if (!novel) {
      return res.status(404).json({ error: '小说不存在' });
    }

    console.log('准备调用 aiService.generateChapterFromArchitecture');
    const content = await aiService.generateChapterFromArchitecture({
      novelId: chapter.novel_id,
      chapterArchId: chapter.architecture_id
    }, ac.signal);
    console.log('AI生成完成，内容长度:', content?.length);

    const updatedChapter = await chapterService.update(req.params.id, {
      content,
      status: 'generated'
    });

    res.json(updatedChapter);
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/review', async (req, res) => {
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('[abort] 客户端断开 → chapter/review 已中止');
      ac.abort();
    }
  });
  try {
    req.setTimeout(0);
    const result = await chapterService.reviewChapter(req.params.id, ac.signal);
    res.json(result);
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/revise', async (req, res) => {
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('[abort] 客户端断开 → chapter/revise 已中止');
      ac.abort();
    }
  });
  try {
    req.setTimeout(0);
    const { reviewResult } = req.body;
    const result = await chapterService.reviseChapter(req.params.id, reviewResult, ac.signal);
    res.json(result);
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/versions', async (req, res) => {
  try {
    const versions = await chapterService.getVersions(req.params.id);
    res.json(versions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/restore/:versionNumber', async (req, res) => {
  try {
    const chapter = await chapterService.restoreVersion(req.params.id, parseInt(req.params.versionNumber));
    if (!chapter) {
      return res.status(404).json({ error: '版本不存在' });
    }
    res.json(chapter);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
