import { Router, Request, Response } from 'express';
import * as configService from '../services/configService';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
    try {
        const configs = await configService.getAll();
        res.json(configs);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

router.get('/:key', async (req: Request, res: Response) => {
    try {
        const config = await configService.get(String(req.params.key));
        if (!config) {
            return res.status(404).json({ error: '配置不存在' });
        }
        res.json(config);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

router.put('/:key', async (req: Request, res: Response) => {
    try {
        const { value, description } = req.body;
        const config = await configService.set(String(req.params.key), value, description);
        res.json(config);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

router.delete('/:key', async (req: Request, res: Response) => {
    try {
        await configService.remove(String(req.params.key));
        res.json({ message: '删除成功' });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

export default router;