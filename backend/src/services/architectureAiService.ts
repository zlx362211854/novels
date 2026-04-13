import { Novel, Architecture, SystemConfig } from '../models/sequelize';

interface GenerateArchitectureParams {
  novelId: number;
  level: string;
  parentId?: number;
  title?: string;
}

interface Config {
  aiModel?: string;
  deepseekApiKey?: string;
  deepseekApiUrl?: string;
}

async function generateArchitecture(params: GenerateArchitectureParams, signal?: AbortSignal): Promise<any> {
  const { novelId, level, parentId, title } = params;

  const novel = await Novel.findByPk(novelId);
  if (!novel) throw new Error('小说不存在');

  let parentContext = '';
  if (parentId) {
    const parent = await Architecture.findByPk(parentId);
    if (parent) {
      parentContext = `
## 父级架构信息
层级: ${parent.level}
标题: ${parent.title}
${parent.plot_outline ? `情节大纲: ${parent.plot_outline}` : ''}
${parent.characters ? `人物设定: ${parent.characters}` : ''}
${parent.world_setting ? `世界观: ${parent.world_setting}` : ''}
`;
    }
  }

  const prompt = buildPrompt(novel, level, title || '', parentContext);

  const config = await getConfig();
  const aiClient = getAIClient(config, signal);

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw Object.assign(new Error('请求已取消'), { name: 'AbortError' });
    try {
      const content = await aiClient.generate(prompt);
      return parseResult(content);
    } catch (error: any) {
      if (error.name === 'AbortError') throw error;
      lastError = error;
      console.error(`AI生成架构失败，第${attempt + 1}次重试:`, error.message);
      if (attempt < 2) {
        await sleep(60000, signal);
      }
    }
  }

  throw new Error(`AI生成失败: ${lastError?.message}`);
}

async function generateChapterArchitectures(params: any, signal?: AbortSignal): Promise<any[]> {
  const { novelId, volumeId } = params;

  const novel = await Novel.findByPk(novelId);
  if (!novel) throw new Error('小说不存在');

  const volume = await Architecture.findByPk(volumeId);
  if (!volume) throw new Error('卷架构不存在');

  const fullArch = await Architecture.findOne({
    where: { novel_id: novelId, level: 'full' }
  });

  const prompt = buildChapterBatchPrompt(novel, volume, fullArch);

  const config = await getConfig();
  const aiClient = getAIClient(config, signal);

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw Object.assign(new Error('请求已取消'), { name: 'AbortError' });
    try {
      const content = await aiClient.generate(prompt);
      const chapters = parseChapterResult(content);
      return chapters;
    } catch (error: any) {
      if (error.name === 'AbortError') throw error;
      lastError = error;
      console.error(`AI生成章架构失败，第${attempt + 1}次重试:`, error.message);
      if (attempt < 2) {
        await sleep(60000, signal);
      }
    }
  }

  throw new Error(`AI生成失败: ${lastError?.message}`);
}

function buildPrompt(novel: any, level: string, title: string, parentContext: string): string {
  const levelDesc: Record<string, string> = {
    full: '全本架构（整部小说的整体规划）',
    volume: '卷架构（小说中某一卷的规划）',
    chapter: '章架构（单个章节的详细规划）'
  };

  return `你是一位专业的网络小说策划师。请为以下小说生成${levelDesc[level]}的内容。

## 小说基本信息
标题：${novel.title}
类型：${novel.genre || '未指定'}
简介：${novel.description || '未提供'}
${parentContext}

## 要求
请生成符合要求的架构内容，确保内容详细、逻辑清晰、符合网络小说的特点。

请以JSON格式返回结果。`;
}

function buildChapterBatchPrompt(novel: any, volume: any, fullArch: any): string {
  return `你是一位专业的网络小说策划师。请为小说《${novel.title}》的卷「${volume.title}」生成章节规划。

## 小说信息
类型：${novel.genre || '未指定'}

## 卷信息
标题：${volume.title}
${volume.plot_outline ? `情节大纲：${volume.plot_outline}` : ''}

${fullArch ? `## 全本设定
${fullArch.plot_outline ? `情节大纲：${fullArch.plot_outline}` : ''}
${fullArch.world_setting ? `世界观：${fullArch.world_setting}` : ''}
${fullArch.characters ? `人物设定：${fullArch.characters}` : ''}` : ''}

## 要求
请生成该卷下的所有章节规划，每个章节需要包含：标题和情节概括。

请以JSON数组格式返回结果。`;
}

function parseResult(content: string): any {
  try {
    return JSON.parse(content);
  } catch {
    return { raw: content };
  }
}

function parseChapterResult(content: string): any[] {
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : parsed.chapters || [];
  } catch {
    return [];
  }
}

async function getConfig(): Promise<Config> {
  const configs = await SystemConfig.findAll();
  const configMap: any = {};
  configs.forEach((c: any) => {
    try {
      configMap[c.config_key] = JSON.parse(c.config_value);
    } catch {
      configMap[c.config_key] = c.config_value;
    }
  });

  return {
    aiModel: configMap.aiModel || 'deepseek',
    deepseekApiKey: configMap.deepseekApiKey || process.env.DEEPSEEK_API_KEY,
    deepseekApiUrl: process.env.DEEPSEEK_API_URL
  };
}

function startProgressLog(label: string, signal?: AbortSignal): () => void {
  const start = Date.now();
  const timer = setInterval(() => {
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`[AI] ${label} 生成中... 已等待 ${elapsed}s`);
  }, 5000);
  signal?.addEventListener('abort', () => clearInterval(timer), { once: true });
  return () => clearInterval(timer);
}

function getAIClient(config: Config, signal?: AbortSignal): any {
  if (config.aiModel === 'deepseek') {
    return {
      generate: async (prompt: string) => {
        const stop = startProgressLog('deepseek-chat', signal);
        try {
          const response = await fetch(config.deepseekApiUrl!, {
            method: 'POST',
            signal,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.deepseekApiKey}`
            },
            body: JSON.stringify({
              model: 'deepseek-chat',
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.8,
              max_tokens: 8000
            })
          });

          if (!response.ok) {
            throw new Error(`DeepSeek API错误: ${response.status}`);
          }

          const data = await response.json() as any;
          return data.choices[0].message.content;
        } finally {
          stop();
        }
      }
    };
  }
  return { generate: async () => '' };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Object.assign(new Error('请求已取消'), { name: 'AbortError' }));
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(Object.assign(new Error('请求已取消'), { name: 'AbortError' }));
      }, { once: true });
    }
  });
}

export {
  generateArchitecture,
  generateChapterArchitectures
};