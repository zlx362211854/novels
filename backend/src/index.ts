import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { initDatabase } from './models/sequelize';
import * as scheduleService from './services/scheduleService';

import novelsRouter from './routes/novels';
import architecturesRouter from './routes/architectures';
import chaptersRouter from './routes/chapters';
import schedulesRouter from './routes/schedules';
import configsRouter from './routes/configs';
import exportRouter from './routes/export';
import aiStatusRouter from './routes/aiStatus';
import publishRouter from './routes/publish';
import multiChapterReviewsRouter from './routes/multiChapterReviews';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.get('/api/health', (req: Request, res: Response) => {
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
app.use('/api/multi-chapter-reviews', multiChapterReviewsRouter);

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: '服务器内部错误', message: err.message });
});

interface BootstrapOptions {
  app: express.Application;
  port: number | string;
  initDatabase: () => Promise<void>;
  initScheduledJobs: () => void;
  logger?: Console;
}

function createBootstrap(options: BootstrapOptions) {
  return async function bootstrap() {
    const { app: serverApp, port, initDatabase: initDb, initScheduledJobs, logger = console } = options;
    try {
      await initDb();
      initScheduledJobs();
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

export { app, createBootstrap, bootstrap };