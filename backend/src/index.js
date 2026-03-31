require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDatabase } = require('./models/init');
const scheduleService = require('./services/scheduleService');

const novelsRouter = require('./routes/novels');
const architecturesRouter = require('./routes/architectures');
const chaptersRouter = require('./routes/chapters');
const schedulesRouter = require('./routes/schedules');
const configsRouter = require('./routes/configs');
const templatesRouter = require('./routes/templates');
const exportRouter = require('./routes/export');

const app = express();
const PORT = process.env.PORT || 3001;

initDatabase();
scheduleService.initScheduledJobs();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/novels', novelsRouter);
app.use('/api/architectures', architecturesRouter);
app.use('/api/chapters', chaptersRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/configs', configsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/export', exportRouter);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: '服务器内部错误', message: err.message });
});

app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
});
