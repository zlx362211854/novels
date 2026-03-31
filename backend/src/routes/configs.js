const express = require('express');
const router = express.Router();
const configService = require('../services/configService');

router.get('/', (req, res) => {
  try {
    const configs = configService.findAll();
    res.json(configs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:key', (req, res) => {
  try {
    const { value, description } = req.body;
    const config = configService.upsert(req.params.key, value, description);
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
