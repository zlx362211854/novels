const express = require('express');
const router = express.Router();
const aiStatusService = require('../services/aiStatusService');

router.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });

  const current = aiStatusService.getCurrent();
  if (current) {
    res.write(`data: ${JSON.stringify(current)}\n\n`);
  }

  const onUpdate = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  aiStatusService.emitter.on('update', onUpdate);

  req.on('close', () => {
    aiStatusService.emitter.off('update', onUpdate);
  });
});

module.exports = router;
