import { HumanMessage } from '@langchain/core/messages';
import { Chapter, Novel, Architecture } from '../models/sequelize';
import { createLLM } from '../ai/llmFactory';
import { parseJsonWithRepair, strictJsonOutputRules } from '../ai/jsonUtils';

type RewriteMode = 'smooth' | 'describe' | 'compress' | 'preserve' | 'custom';

interface RewriteSelectionInput {
  chapterId: number;
  selectedText: string;
  beforeText?: string;
  afterText?: string;
  mode: RewriteMode;
  customInstruction?: string;
}

interface RewriteSelectionResult {
  rewrittenText: string;
  summary: string;
}

const MODE_INSTRUCTIONS: Record<RewriteMode, string> = {
  smooth: '改得更流畅：优化语序、节奏、衔接和表达自然度，不改变原意。',
  describe: '增强描写：适度增强动作、神态、环境、心理或感官描写，但不要扩写成新剧情。',
  compress: '压缩冗余：删掉重复、拖沓和解释过度的表达，让文字更紧凑。',
  preserve: '保持原意改写：在不改变事实、情绪和叙事功能的前提下换一种更好的表达。',
  custom: '按用户自定义要求改写。',
};

function formatArchitecture(architecture: any): string {
  if (!architecture) return '无';
  return [
    `标题：${architecture.title || ''}`,
    `情节概要：${architecture.plot_outline || ''}`,
    `人物：${architecture.characters || ''}`,
    `世界设定：${architecture.world_setting || ''}`,
    `情绪基调：${architecture.emotional_tone || ''}`,
  ].join('\n');
}

function buildPrompt(input: RewriteSelectionInput, chapter: any, novel: any, architecture: any): string {
  const modeInstruction = input.mode === 'custom'
    ? (input.customInstruction || '').trim()
    : MODE_INSTRUCTIONS[input.mode] || MODE_INSTRUCTIONS.preserve;

  return `你是一位专业网络小说编辑。请只改写用户选中的片段，返回可直接替换选区的正文。

## 小说信息
标题：${novel.title || ''}
类型：${novel.genre || ''}

## 章节信息
标题：${chapter.title || ''}
序号：第${chapter.chapter_number || ''}章

## 本章架构
${formatArchitecture(architecture)}

## 选区前文
${input.beforeText || ''}

## 需要改写的选区
${input.selectedText}

## 选区后文
${input.afterText || ''}

## 改写要求
${modeInstruction || '保持原意改写。'}

## 约束
- 只输出改写后的选区文本，不要输出整章
- 不要新增关键剧情、人物关系、物品状态或世界规则
- 不要改变叙事视角、人称、时态和上下文事实
- 保持与前后文自然衔接
- 如果是压缩冗余，可以明显缩短；其他模式尽量保持相近长度
- 不要解释你的思考过程

请返回 JSON：
{
  "rewrittenText": "可直接替换选区的文本",
  "summary": "一句话说明改动"
}
${strictJsonOutputRules()}`;
}

function buildRepairPrompt(raw: string): string {
  return `请把以下文本修复成合法 JSON，不要添加新语义，必须包含 rewrittenText 和 summary。
${strictJsonOutputRules()}

待修复文本：
${raw}`;
}

async function rewriteSelection(input: RewriteSelectionInput): Promise<RewriteSelectionResult> {
  if (!input.selectedText || !input.selectedText.trim()) {
    throw new Error('选区不能为空');
  }
  if (input.mode === 'custom' && !input.customInstruction?.trim()) {
    throw new Error('自定义改写要求不能为空');
  }

  const chapter = await Chapter.findByPk(input.chapterId);
  if (!chapter) throw new Error('章节不存在');

  const novel = await Novel.findByPk((chapter as any).novel_id);
  if (!novel) throw new Error('小说不存在');

  const architecture = (chapter as any).architecture_id
    ? await Architecture.findByPk((chapter as any).architecture_id)
    : null;

  const llm = await createLLM({
    temperature: 0.55,
    maxTokens: Math.max(1200, Math.min(6000, input.selectedText.length * 3)),
    graph: 'chapterTune',
    novel,
  });

  const prompt = buildPrompt(input, chapter, novel, architecture);
  const response = await llm.invoke([new HumanMessage(prompt)]);
  const content = typeof response.content === 'string'
    ? response.content
    : JSON.stringify(response.content);
  const parsed = await parseJsonWithRepair(content, llm, buildRepairPrompt);
  const rewrittenText = String(parsed?.rewrittenText || '').trim();

  if (!rewrittenText) {
    throw new Error('模型未返回改写文本');
  }

  return {
    rewrittenText,
    summary: String(parsed?.summary || '').trim(),
  };
}

export {
  RewriteMode,
  RewriteSelectionInput,
  RewriteSelectionResult,
  rewriteSelection,
};
