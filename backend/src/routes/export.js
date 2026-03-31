const express = require('express');
const router = express.Router();
const exportService = require('../services/exportService');

router.get('/novels/:id/export', (req, res) => {
  try {
    const { scope, volumeId } = req.query;
    const markdown = exportService.exportToMarkdown({
      novelId: req.params.id,
      scope: scope || 'full',
      volumeId
    });

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="novel_${req.params.id}.md"`);
    res.send(markdown);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
