require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDatabase } = require('./models/sequelize');
const scheduleService = require('./services/scheduleService');

const novelsRouter = require('./routes/novels');
const architecturesRouter = require('./routes/architectures');
const chaptersRouter = require('./routes/chapters');
const schedulesRouter = require('./routes/schedules');
const configsRouter = require('./routes/configs');
const exportRouter = require('./routes/export');
const aiStatusRouter = require('./routes/aiStatus');
const publishRouter = require('./routes/publish');

const app = express();
const PORT = process.env.PORT || 3001;

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
app.use('/api/export', exportRouter);
app.use('/api/ai-status', aiStatusRouter);
app.use('/api/publish', publishRouter);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: '服务器内部错误', message: err.message });
});

function createBootstrap({
  app: serverApp,
  port,
  initDatabase: initDb,
  initScheduledJobs,
  logger = console
}) {
  return async function bootstrap() {
    try {
      await initDb();
      await initScheduledJobs();
      serverApp.listen(port, () => {
        logger.log(`服务器运行在端口 ${port}`);
        logger.log(`环境: ${process.env.NODE_ENV || 'development'}`);
      });
    } catch (error) {
      logger.error('服务启动失败:', error);
      process.exit(1);
    }
  };
}

const bootstrap = createBootstrap({
  app,
  port: PORT,
  initDatabase,
  initScheduledJobs: scheduleService.initScheduledJobs
});

if (require.main === module) {
  bootstrap();
}

module.exports = {
  app,
  createBootstrap,
  bootstrap
};
