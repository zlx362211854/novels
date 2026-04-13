import { SystemConfig } from '../models/sequelize';

async function getConfig(): Promise<any> {
  const configs = await SystemConfig.findAll();
  const configMap: any = {};
  configs.forEach((c: any) => { try { configMap[c.config_key] = JSON.parse(c.config_value); } catch { configMap[c.config_key] = c.config_value; } });
  return {
    aiModel: configMap.aiModel || process.env.DEFAULT_AI_MODEL || 'zhipu',
    zhipuApiKey: configMap.zhipuApiKey || process.env.ZHIPU_API_KEY,
    deepseekApiKey: configMap.deepseekApiKey || process.env.DEEPSEEK_API_KEY,
    deepseekApiUrl: process.env.DEEPSEEK_API_URL
  };
}

function buildRevisionPrompt(chapter: any, novel: any, architecture: any, reviewResult: any, reviewContext: any = {}): string {
  return `你是一位专业的网络小说编辑，请根据审阅意见修订章节。

## 章节信息
标题：${chapter.title || ''}
序号：第${chapter.chapter_number}章
正文：${(chapter.content || '').slice(0, 2000)}...

## 小说信息
标题：${novel.title}
类型：${novel.genre || ''}

## 架构信息
${formatArchitecture(architecture)}

## 审阅意见
${JSON.stringify(reviewResult.issues || [], null, 2)}

## 要求
请生成修订后的章节内容，保留原有风格，只修复问题。

请返回JSON格式：{ "revisedContent": "string", "summary": "string", "appliedIssues": ["string"] }`;
}

function formatArchitecture(architecture: any): string {
  if (!architecture) return '无';
  return `层级: ${architecture.level}\n标题: ${architecture.title}\n情节: ${architecture.plot_outline || ''}\n`;
}

function startProgressLog(label: string, signal?: AbortSignal): () => void {
  const start = Date.now(), timer = setInterval(() => console.log(`[AI] ${label} 生成中... 已等待 ${Math.round((Date.now() - start) / 1000)}s`), 5000);
  signal?.addEventListener('abort', () => clearInterval(timer), { once: true });
  return () => clearInterval(timer);
}

function getAIClient(config: any, signal?: AbortSignal): any {
  const client = config.aiModel === 'deepseek' ? 'deepseek-chat' : 'glm-4';
  const url = config.aiModel === 'deepseek' ? config.deepseekApiUrl : process.env.ZHIPU_API_URL;
  const key = config.aiModel === 'deepseek' ? config.deepseekApiKey : config.zhipuApiKey;
  return {
    generate: async (prompt: string) => {
      const stop = startProgressLog(client, signal);
      const res = await fetch(url!, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: client, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 12000 }) });
      if (!res.ok) throw new Error(`API错误: ${res.status}`);
      const data = await res.json() as any;
      return data.choices[0].message.content;
    }
  };
}

async function revise(params: any, signal?: AbortSignal): Promise<any> {
  const { chapter, novel, architecture, reviewResult, currentMemory, relevantMemories = [], sourceExcerpts = [] } = params;
  const config = await getConfig();
  const prompt = buildRevisionPrompt(chapter, novel, architecture, reviewResult, { currentMemory, relevantMemories, sourceExcerpts });
  const aiClient = getAIClient(config, signal);
  const result = await aiClient.generate(prompt);
  return parseRevisionResult(result, chapter.content);
}

function parseRevisionResult(result: string, originalContent: string): any {
  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch {}
  return { revisedContent: result, summary: '解析失败', appliedIssues: [] };
}

export { revise };