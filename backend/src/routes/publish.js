const express = require('express');
const router = express.Router();
const publishService = require('../services/publishService');

// 发布章节到平台
router.post('/:chapterId', async (req, res) => {
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('[abort] 客户端断开 → publish 已中止');
      ac.abort();
    }
  });
  try {
    const { platforms, mode = 'publish' } = req.body;
    if (!Array.isArray(platforms) || !platforms.length) {
      return res.status(400).json({ error: '请选择至少一个发布平台' });
    }
    const result = await publishService.publishChapter(
      req.params.chapterId,
      platforms,
      ac.signal,
      mode
    );
    res.json(result);
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: error.message });
  }
});

// 打开浏览器登录平台
router.post('/login/:platform', async (req, res) => {
  try {
    const result = await publishService.openLoginBrowser(req.params.platform);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 检查平台登录状态
router.get('/status/:platform', async (req, res) => {
  try {
    const status = publishService.checkLoginStatus(req.params.platform);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取可用平台列表及配置
router.get('/platforms', async (req, res) => {
  try {
    const platforms = publishService.getAvailablePlatforms();
    const config = await publishService.getPlatformConfig();
    const result = platforms.map(p => ({
      ...p,
      enabled: config[p.key]?.enabled || false,
      workId: config[p.key]?.workId || '',
      loggedIn: publishService.checkLoginStatus(p.key).loggedIn
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
