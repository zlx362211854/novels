import { Novel, Architecture, SystemConfig } from '../models/sequelize';

function extractJson(content: string): any {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch { }
  }
  return null;
}

function buildReviewPrompt(novel: any, architectures: any[]): string {
  return `你是一位专业的网络小说审阅师。请对小说《${novel.title}》的架构进行审阅。

## 小说信息
类型：${novel.genre || '未指定'}

## 架构列表
${architectures.map((a: any) => `### ${a.level}: ${a.title}
${a.plot_outline || ''}
${a.characters || ''}
${a.world_setting || ''}`).join('\n\n')}

## 审阅要求
请检查：
1. 情节逻辑是否连贯
2. 人物设定是否合理
3. 世界观是否一致
4. 节奏安排是否恰当

请以JSON格式返回审阅结果。`;
}

function buildFullArchRewritePrompt(novel: any, fullArch: any, volumes: any[], reviewResult: any, userPrompt: string): string {
  return `你是一位专业的网络小说策划师。请根据审阅意见修改全本架构。

## 小说信息
标题：${novel.title}

## 原架构
${fullArch.plot_outline || ''}

## 审阅意见
${JSON.stringify(reviewResult, null, 2)}

## 用户要求
${userPrompt || '请根据审阅意见优化架构'}

## 要求
请生成优化后的全本架构，确保逻辑清晰、情节连贯。

请以JSON格式返回结果。`;
}

function buildVolumeChaptersRewritePrompt(novel: any, fullArchResult: any, volume: any, chapters: any[], reviewResult: any, userPrompt: string): string {
  return `你是一位专业的网络小说策划师。请根据审阅意见修改卷和章节架构。

## 小说信息
标题：${novel.title}

## 卷信息
标题：${volume.title}
${volume.plot_outline || ''}

## 章节列表
${chapters.map((c: any) => `- ${c.title}: ${c.plot_outline || ''}`).join('\n')}

## 审阅意见
${JSON.stringify(reviewResult, null, 2)}

## 用户要求
${userPrompt || '请根据审阅意见优化架构'}

## 要求
请生成优化后的卷和章节架构。

请以JSON格式返回结果。`;
}

async function getConfig(): Promise<any> {
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

async function reviewArchitectures(novelId: number, signal?: AbortSignal): Promise<any> {
  const novel = await Novel.findByPk(novelId);
  if (!novel) throw new Error('小说不存在');

  const architectures = await Architecture.findAll({
    where: { novel_id: novelId },
    order: [['id', 'ASC']]
  });

  const prompt = buildReviewPrompt(novel, architectures);
  const config = await getConfig();

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
      temperature: 0.7
    })
  });

  const data = await response.json() as any;
  const content = data.choices[0].message.content;
  return extractJson(content) || { raw: content };
}

async function callAIWithRetry(aiClient: any, prompt: string, label: string, signal?: AbortSignal, maxRetries = 3): Promise<any> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await aiClient.generate(prompt);
    } catch (error: any) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 60000));
      }
    }
  }
  throw new Error(`${label}失败: ${lastError?.message}`);
}

async function rewriteArchitectures(novelId: number, reviewResult: any, userPrompt: string, signal?: AbortSignal): Promise<any> {
  const novel = await Novel.findByPk(novelId);
  if (!novel) throw new Error('小说不存在');

  const fullArch = await Architecture.findOne({ where: { novel_id: novelId, level: 'full' } });
  const volumes = await Architecture.findAll({ where: { novel_id: novelId, level: 'volume' } });
  const chapters = await Architecture.findAll({ where: { novel_id: novelId, level: 'chapter' } });

  if (fullArch) {
    const prompt = buildFullArchRewritePrompt(novel, fullArch, volumes, reviewResult, userPrompt);
    const config = await getConfig();
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
        temperature: 0.7
      })
    });
    const data = await response.json() as any;
    return extractJson(data.choices[0].message.content) || { raw: data.choices[0].message.content };
  }

  return { message: 'No full architecture found' };
}

export {
  reviewArchitectures,
  rewriteArchitectures
};