import { Router, Request, Response } from 'express';
import * as configService from '../services/configService';
import { createLLM, getAIConfig } from '../ai/llmFactory';
import { HumanMessage } from '@langchain/core/messages';

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

router.post('/test-llm', async (req: Request, res: Response) => {
    try {
        const config = await getAIConfig();
        const provider = req.body?.provider || config.aiModel || 'minimax';
        const rawMode = req.body?.raw === true;

        console.log(`[test-llm] 测试 provider=${provider} raw=${rawMode}`);
        console.log(`[test-llm] minimaxApiKey=${config.minimaxApiKey ? config.minimaxApiKey.slice(0, 8) + '...' : '未配置'}`);
        console.log(`[test-llm] minimaxApiUrl=${config.minimaxApiUrl}`);

        // raw 模式：绕过 LangChain，直接调原始 HTTP 接口
        if (rawMode && provider === 'minimax') {
            const url = 'https://api.minimaxi.com/anthropic/v1/messages';
            console.log(`[test-llm] 直接请求 URL: ${url}`, config.minimaxApiKey || '');

            const httpRes = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': config.minimaxApiKey || '',
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: 'MiniMax-M2.5',
                    messages: [{ role: 'user', content: '用一句话介绍你自己' }],
                    max_tokens: 50,
                }),
            });

            const data = await httpRes.json() as any;
            console.log(`[test-llm] HTTP状态: ${httpRes.status}`);
            console.log(`[test-llm] 原始响应:`, JSON.stringify(data).slice(0, 300));

            if (!httpRes.ok) {
                return res.status(500).json({ ok: false, httpStatus: httpRes.status, error: data });
            }
            const reply = data.choices?.[0]?.message?.content || JSON.stringify(data);
            return res.json({ ok: true, provider, mode: 'raw-http', reply });
        }

        // LangChain 模式
        const llm = await createLLM({ provider: provider as any, temperature: 0.5, maxTokens: 50 });
        const response = await llm.invoke([new HumanMessage('用一句话介绍你自己')]);
        const text = typeof response.content === 'string'
            ? response.content
            : JSON.stringify(response.content);

        console.log(`[test-llm] 返回: ${text.slice(0, 100)}`);
        res.json({ ok: true, provider, mode: 'langchain', reply: text });
    } catch (error) {
        console.error('[test-llm] 失败:', (error as Error).message);
        res.status(500).json({ ok: false, error: (error as Error).message });
    }
});

export default router;