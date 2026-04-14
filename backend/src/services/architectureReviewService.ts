import { Novel, Architecture } from '../models/sequelize';
import { HumanMessage } from '@langchain/core/messages';
import { createLLM } from '../ai/llmFactory';
import { parseJson } from '../ai/jsonUtils';

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

async function reviewArchitectures(novelId: number, signal?: AbortSignal): Promise<any> {
  const novel = await Novel.findByPk(novelId);
  if (!novel) throw new Error('小说不存在');

  const architectures = await Architecture.findAll({
    where: { novel_id: novelId },
    order: [['id', 'ASC']],
  });

  const prompt = buildReviewPrompt(novel, architectures);
  const llm = await createLLM({ temperature: 0.7 });
  const response = await llm.invoke([new HumanMessage(prompt)], { signal });
  const content = response.content as string;

  try {
    return parseJson(content);
  } catch {
    return { raw: content };
  }
}

async function rewriteArchitectures(novelId: number, reviewResult: any, userPrompt: string, signal?: AbortSignal): Promise<any> {
  const novel = await Novel.findByPk(novelId);
  if (!novel) throw new Error('小说不存在');

  const fullArch = await Architecture.findOne({ where: { novel_id: novelId, level: 'full' } });
  if (!fullArch) return { message: 'No full architecture found' };

  const volumes = await Architecture.findAll({ where: { novel_id: novelId, level: 'volume' } });

  const prompt = buildFullArchRewritePrompt(novel, fullArch, volumes, reviewResult, userPrompt);
  const llm = await createLLM({ temperature: 0.7 });
  const response = await llm.invoke([new HumanMessage(prompt)], { signal });
  const content = response.content as string;

  try {
    return parseJson(content);
  } catch {
    return { raw: content };
  }
}

export {
  reviewArchitectures,
  rewriteArchitectures,
};
