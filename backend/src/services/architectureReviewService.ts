import { Novel, Architecture } from '../models/sequelize';
import { HumanMessage } from '@langchain/core/messages';
import { createLLM } from '../ai/llmFactory';
import { parseJsonWithRepair, strictJsonOutputRules } from '../ai/jsonUtils';
import { invokeWithStreaming } from '../ai/streaming';
import * as architectureService from './architectureService';
import { createProgressTracker } from '../ai/progressAdapter';
import {
  DraftArchitecture,
  DraftChapterArchitecture,
  NovelBootstrapDraft,
} from './novelBootstrapService';

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

请以JSON格式返回审阅结果。
${strictJsonOutputRules()}`;
}

function formatVolumeSummary(volumes: any[]): string {
  if (!volumes.length) return '无卷架构';

  return volumes
    .map((volume: any, index: number) => `### 卷架构ID=${volume.id} 第${index + 1}卷「${volume.title}」\n${volume.plot_outline || ''}`)
    .join('\n\n');
}

function formatDraftVolumeSummary(volumes: DraftArchitecture[]): string {
  if (!volumes.length) return '无卷架构';

  return volumes
    .map(
      (volume: DraftArchitecture, index: number) =>
        `### 卷架构ID=${volume.draftId} 第${index + 1}卷「${volume.title}」\n${volume.plotOutline || ''}`
    )
    .join('\n\n');
}

function formatChapterArchitectureBlock(chapters: any[], volumeMap: Map<number, any>): string {
  return chapters
    .map((chapter: any, index: number) => {
      const volume = volumeMap.get(chapter.parent_id);
      const charactersText =
        typeof chapter.characters === 'string'
          ? chapter.characters
          : JSON.stringify(chapter.characters || [], null, 2);
      const worldSettingText =
        typeof chapter.worldSetting === 'string'
          ? chapter.worldSetting
          : chapter.world_setting || JSON.stringify(chapter.worldSetting || '', null, 2);

      return [
        `## 章架构ID=${chapter.id} 第${index + 1}章「${chapter.title}」`,
        volume ? `所属卷：${volume.title}（卷架构ID=${volume.id}）` : '所属卷：未指定',
        `情节概括：${chapter.plot_outline || ''}`,
        `人物：${charactersText || ''}`,
        `世界设定：${worldSettingText || ''}`,
        `情感基调：${chapter.emotional_tone || ''}`,
      ].join('\n');
    })
    .join('\n\n');
}

function formatDraftChapterArchitectureBlock(
  chapters: DraftChapterArchitecture[],
  volumeMap: Map<string, DraftArchitecture>,
): string {
  return chapters
    .map((chapter, index) => {
      const volume = volumeMap.get(chapter.parentDraftVolumeId);
      const charactersText =
        typeof chapter.characters === 'string'
          ? chapter.characters
          : JSON.stringify(chapter.characters || [], null, 2);
      const worldSettingText =
        typeof chapter.worldSetting === 'string'
          ? chapter.worldSetting
          : JSON.stringify(chapter.worldSetting || {}, null, 2);

      return [
        `## 章架构ID=${chapter.draftId} 第${index + 1}章「${chapter.title}」`,
        volume ? `所属卷：${volume.title}（卷架构ID=${volume.draftId}）` : '所属卷：未指定',
        `情节概括：${chapter.plotOutline || ''}`,
        `人物：${charactersText || ''}`,
        `世界设定：${worldSettingText || ''}`,
        `情感基调：${chapter.emotionalTone || ''}`,
      ].join('\n');
    })
    .join('\n\n');
}

function buildChapterArchitectureReviewPrompt(novel: any, fullArch: any, volumes: any[], chapters: any[]): string {
  const volumeMap = new Map(volumes.map((volume: any) => [volume.id, volume]));
  const sampleChapterId = chapters[0]?.id ?? '<上文「章架构ID=」处的数字>';
  const sampleChapterId2 = chapters[1]?.id ?? sampleChapterId;

  return `你是一位长篇小说总策划。请按连续阅读全书的视角，审阅《${novel.title}》的章架构。

## 小说信息
类型：${novel.genre || '未指定'}

## 全本架构
标题：${fullArch?.title || '未提供'}
内容：${fullArch?.plot_outline || ''}

## 卷架构
${formatVolumeSummary(volumes)}

## 按章顺序排列的章架构
${formatChapterArchitectureBlock(chapters, volumeMap)}

## 审阅要求
请重点检查：
1. 情节完整性
2. 情节流畅性
3. 逻辑 bug
4. 是否需要新增情节或过渡章

问题 category 只能使用：
- plot_hole
- missing_transition
- character_motivation
- pacing
- foreshadow_gap
- world_rule_conflict

## 关于 ID 的硬性约束（出错就会导致整次修补失败，请务必遵守）
- affectedChapterIds 中的每个数字必须严格等于上文「章架构ID=」后的数字（例如 ${sampleChapterId}）。
- 禁止使用「第N章」中的序号 N（例如不能写 1、2、55、56），那只是阅读顺序的展示，不是 ID。
- 禁止编造未在上文出现过的 ID。
- 如果不确定，请只引用确实在上文出现过的 ID。

只输出 JSON，格式为：
{
  "summary": {
    "overallAssessment": "string",
    "integrityScore": 0,
    "flowScore": 0,
    "bugScore": 0
  },
  "issues": [
    {
      "id": "issue_1",
      "severity": "high | medium | low",
      "category": "missing_transition",
      "title": "string",
      "description": "string",
      "affectedChapterIds": [${sampleChapterId}, ${sampleChapterId2}],
      "suggestion": "string",
      "needsNewChapter": true
    }
  ]
}
${strictJsonOutputRules()}`;
}

function buildDraftChapterArchitectureReviewPrompt(
  draft: NovelBootstrapDraft,
  round: number,
): string {
  const volumeMap = new Map(
    draft.volumeArchitectures.map((volume: DraftArchitecture) => [volume.draftId, volume])
  );
  const sampleChapterId = draft.chapterArchitectures[0]?.draftId ?? 'ch_1';
  const sampleChapterId2 = draft.chapterArchitectures[1]?.draftId ?? sampleChapterId;

  return `你是一位长篇小说总策划。请按连续阅读全书的视角，审阅《${draft.novel.title}》的章架构。

## 当前轮次
第 ${round} 轮章架构审阅

## 小说信息
类型：${draft.novel.genre || '未指定'}
简介：${draft.novel.description || '未提供'}

## 全本架构
标题：${draft.fullArchitecture?.title || '未提供'}
内容：${draft.fullArchitecture?.plotOutline || ''}

## 卷架构
${formatDraftVolumeSummary(draft.volumeArchitectures)}

## 按章顺序排列的章架构
${formatDraftChapterArchitectureBlock(draft.chapterArchitectures, volumeMap)}

## 审阅要求
请重点检查：
1. 情节完整性
2. 情节流畅性
3. 逻辑 bug
4. 是否需要新增情节或过渡章

问题 category 只能使用：
- plot_hole
- missing_transition
- character_motivation
- pacing
- foreshadow_gap
- world_rule_conflict

## 关于 ID 的硬性约束（出错就会导致整次修补失败，请务必遵守）
- affectedChapterIds 中的每个值必须严格等于上文「章架构ID=」后的字符串（例如 ${sampleChapterId}）。
- 禁止使用「第N章」中的序号 N，那只是阅读顺序展示，不是 ID。
- 禁止编造未在上文出现过的 ID。

只输出 JSON，格式为：
{
  "summary": {
    "overallAssessment": "string",
    "integrityScore": 0,
    "flowScore": 0,
    "bugScore": 0
  },
  "issues": [
    {
      "id": "issue_1",
      "severity": "high | medium | low",
      "category": "missing_transition",
      "title": "string",
      "description": "string",
      "affectedChapterIds": ["${sampleChapterId}", "${sampleChapterId2}"],
      "suggestion": "string",
      "needsNewChapter": true
    }
  ]
}
${strictJsonOutputRules()}`;
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

请以JSON格式返回结果。
${strictJsonOutputRules()}`;
}

function buildChapterArchitectureRepairPrompt(
  novel: any,
  fullArch: any,
  volumes: any[],
  chapters: any[],
  reviewResult: any,
  userPrompt: string,
): string {
  const volumeMap = new Map(volumes.map((volume: any) => [volume.id, volume]));
  const sampleChapterId = chapters[0]?.id ?? '<上文「章架构ID=」处的数字>';
  const validIdRange = chapters.length
    ? `（本书的章架构ID 范围在 ${Math.min(...chapters.map((c: any) => c.id))} ~ ${Math.max(...chapters.map((c: any) => c.id))} 之间）`
    : '';

  return `你是一位长篇小说架构修补师。请根据审阅结果，只修补受影响章架构。

## 小说信息
标题：${novel.title}
类型：${novel.genre || '未指定'}

## 全本架构
${fullArch?.plot_outline || ''}

## 卷架构
${formatVolumeSummary(volumes)}

## 当前章架构
${formatChapterArchitectureBlock(chapters, volumeMap)}

## 审阅结果
${JSON.stringify(reviewResult, null, 2)}

## 用户补充要求
${userPrompt || '请只修补受影响章架构，必要时新增章架构，不要删除章节。'}

## 关于 ID 的硬性约束（违反就会导致整次修补失败）
- chapterId 与 insertAfterChapterId 必须严格等于上文「章架构ID=」后的数字${validIdRange}。
- 禁止使用「第N章」中的序号 N（例如 1、2、55、56），那只是阅读顺序，不是 ID。
- 禁止使用 reviewResult 里出现过但上文没有的数字。
- 如果不确定 ID，请直接复制上文「章架构ID=」后面的数字，不要做任何换算。
- 待修补的章必须是受 reviewResult 影响的章；未受影响的章不要写到 updatedChapters 里。

## 输出要求
只输出 JSON，格式为：
{
  "updatedChapters": [
    {
      "chapterId": ${sampleChapterId},
      "title": "string",
      "plotOutline": "string",
      "characters": ["角色A", "角色B"],
      "worldSetting": "string",
      "emotionalTone": "string"
    }
  ],
  "newChapters": [
    {
      "insertAfterChapterId": ${sampleChapterId},
      "title": "string",
      "plotOutline": "string",
      "characters": ["角色A"],
      "worldSetting": "string",
      "emotionalTone": "string"
    }
  ]
}
${strictJsonOutputRules()}`;
}

function buildDraftChapterArchitectureRepairPrompt(
  draft: NovelBootstrapDraft,
  reviewResult: any,
  userPrompt: string,
  round: number,
): string {
  const volumeMap = new Map(
    draft.volumeArchitectures.map((volume: DraftArchitecture) => [volume.draftId, volume])
  );
  const sampleChapterId = draft.chapterArchitectures[0]?.draftId ?? 'ch_1';
  const validIds = draft.chapterArchitectures.map((chapter) => chapter.draftId);
  const validIdRange = validIds.length ? `（本书有效章架构ID：${validIds.join(', ')}）` : '';

  return `你是一位长篇小说架构修补师。请根据审阅结果，只修补受影响章架构。

## 当前轮次
第 ${round} 轮章架构修补

## 小说信息
标题：${draft.novel.title}
类型：${draft.novel.genre || '未指定'}

## 全本架构
${draft.fullArchitecture?.plotOutline || ''}

## 卷架构
${formatDraftVolumeSummary(draft.volumeArchitectures)}

## 当前章架构
${formatDraftChapterArchitectureBlock(draft.chapterArchitectures, volumeMap)}

## 审阅结果
${JSON.stringify(reviewResult, null, 2)}

## 用户补充要求
${userPrompt || '请只修补受影响章架构，必要时新增章架构，不要删除章节。'}

## 关于 ID 的硬性约束
- chapterId 与 insertAfterChapterId 必须严格等于上文「章架构ID=」后的字符串 ${validIdRange}。
- 禁止使用「第N章」中的序号 N，那只是阅读顺序，不是 ID。
- 未受影响的章不要写进 updatedChapters。

## 输出要求
只输出 JSON，格式为：
{
  "updatedChapters": [
    {
      "chapterId": "${sampleChapterId}",
      "title": "string",
      "plotOutline": "string",
      "characters": ["角色A", "角色B"],
      "worldSetting": "string",
      "emotionalTone": "string"
    }
  ],
  "newChapters": [
    {
      "insertAfterChapterId": "${sampleChapterId}",
      "title": "string",
      "plotOutline": "string",
      "characters": ["角色A"],
      "worldSetting": "string",
      "emotionalTone": "string"
    }
  ]
}
${strictJsonOutputRules()}`;
}
function buildRepairPrompt(raw: string): string {
  return `请把以下文本修复成合法 JSON。
要求：
${strictJsonOutputRules()}
保持原有语义，不要添加新结论。

待修复文本：
${raw}`;
}

async function loadArchitectureContext(novelId: number): Promise<any> {
  const novel = await Novel.findByPk(novelId);
  if (!novel) throw new Error('小说不存在');

  const architectures = await Architecture.findAll({
    where: { novel_id: novelId },
    order: [['id', 'ASC']],
  });

  const fullArch = architectures.find((arch: any) => arch.level === 'full');
  const volumes = architectures.filter((arch: any) => arch.level === 'volume');
  const chapters = architectures.filter((arch: any) => arch.level === 'chapter');

  if (!fullArch) throw new Error('缺少全本架构，无法发起全书级章架构审阅');
  if (chapters.length === 0) throw new Error('缺少章架构，无法发起全书级章架构审阅');

  return { novel, fullArch, volumes, chapters };
}

async function reviewArchitectures(novelId: number, signal?: AbortSignal): Promise<any> {
  const novel = await Novel.findByPk(novelId);
  if (!novel) throw new Error('小说不存在');

  const architectures = await Architecture.findAll({
    where: { novel_id: novelId },
    order: [['id', 'ASC']],
  });

  const prompt = buildReviewPrompt(novel, architectures);
  const llm = await createLLM({ temperature: 0.7, graph: 'architectureReview', novelId });
  const content = await invokeWithStreaming(llm, [new HumanMessage(prompt)], { signal, resetStream: true });

  return parseJsonWithRepair(content, llm, buildRepairPrompt);
}

async function rewriteArchitectures(novelId: number, reviewResult: any, userPrompt: string, signal?: AbortSignal): Promise<any> {
  const novel = await Novel.findByPk(novelId);
  if (!novel) throw new Error('小说不存在');

  const fullArch = await Architecture.findOne({ where: { novel_id: novelId, level: 'full' } });
  if (!fullArch) return { message: 'No full architecture found' };

  const volumes = await Architecture.findAll({ where: { novel_id: novelId, level: 'volume' } });

  const prompt = buildFullArchRewritePrompt(novel, fullArch, volumes, reviewResult, userPrompt);
  const llm = await createLLM({ temperature: 0.7, graph: 'architectureRewrite', novelId });
  const content = await invokeWithStreaming(llm, [new HumanMessage(prompt)], { signal, resetStream: true });

  return parseJsonWithRepair(content, llm, buildRepairPrompt);
}

async function reviewChapterArchitectures(novelId: number, signal?: AbortSignal, taskId?: string | null): Promise<any> {
  const tracker = taskId
    ? createProgressTracker(taskId, ['读取架构上下文', '审阅章架构', '整理审阅结果'])
    : null;
  try {
    tracker?.start(`审阅《${novelId}》全书章架构`);
    tracker?.step(0);
    const { novel, fullArch, volumes, chapters } = await loadArchitectureContext(novelId);
    console.log(
      `[arch-review] 开始全书级章架构审阅 novelId=${novelId} title="${novel.title}" fullArchId=${fullArch.id} volumeCount=${volumes.length} chapterCount=${chapters.length}`
    );

    const prompt = buildChapterArchitectureReviewPrompt(novel, fullArch, volumes, chapters);
    const llm = await createLLM({ temperature: 0.4, graph: 'architectureReview', novelId });
    tracker?.step(1);
    const content = await invokeWithStreaming(llm, [new HumanMessage(prompt)], {
      signal,
      taskId: taskId ?? null,
      resetStream: true,
    });
    tracker?.step(2);
    const result = await parseJsonWithRepair(content, llm, buildRepairPrompt);

    console.log(
      `[arch-review] 审阅完成 novelId=${novelId} integrity=${result?.summary?.integrityScore ?? 'n/a'} flow=${result?.summary?.flowScore ?? 'n/a'} bug=${result?.summary?.bugScore ?? 'n/a'} issueCount=${Array.isArray(result?.issues) ? result.issues.length : 0}`
    );

    tracker?.finish();
    return result;
  } catch (error: any) {
    console.error(`[arch-review] 审阅失败 novelId=${novelId}:`, error.message);
    tracker?.error(error.message);
    throw error;
  }
}

async function repairChapterArchitectures(
  novelId: number,
  reviewResult: any,
  userPrompt: string,
  signal?: AbortSignal,
  taskId?: string | null,
): Promise<any> {
  const tracker = taskId
    ? createProgressTracker(taskId, ['读取架构上下文', '生成修补方案', '整理修补结果'])
    : null;
  try {
    tracker?.start(`修补《${novelId}》章架构`);
    tracker?.step(0);
    const { novel, fullArch, volumes, chapters } = await loadArchitectureContext(novelId);
    console.log(
      `[arch-repair] 开始生成章架构修补方案 novelId=${novelId} title="${novel.title}" reviewIssueCount=${Array.isArray(reviewResult?.issues) ? reviewResult.issues.length : 0} chapterCount=${chapters.length}`
    );

    const prompt = buildChapterArchitectureRepairPrompt(
      novel,
      fullArch,
      volumes,
      chapters,
      reviewResult,
      userPrompt,
    );
    const llm = await createLLM({ temperature: 0.4, graph: 'architectureRepair', novelId });
    tracker?.step(1);
    const content = await invokeWithStreaming(llm, [new HumanMessage(prompt)], {
      signal,
      taskId: taskId ?? null,
      resetStream: true,
    });
    tracker?.step(2);
    const result = await parseJsonWithRepair(content, llm, buildRepairPrompt);

    console.log(
      `[arch-repair] 修补方案完成 novelId=${novelId} updatedCount=${Array.isArray(result?.updatedChapters) ? result.updatedChapters.length : 0} newCount=${Array.isArray(result?.newChapters) ? result.newChapters.length : 0}`
    );

    tracker?.finish();
    return result;
  } catch (error: any) {
    console.error(`[arch-repair] 生成修补方案失败 novelId=${novelId}:`, error.message);
    tracker?.error(error.message);
    throw error;
  }
}

function describeValidIdRange(validIds: number[]): string {
  if (!validIds.length) return '';
  if (validIds.length <= 8) return `（本书有效章架构ID：${validIds.join(', ')}）`;
  const sorted = [...validIds].sort((a, b) => a - b);
  return `（本书有效章架构ID 范围 ${sorted[0]} ~ ${sorted[sorted.length - 1]}，共 ${sorted.length} 条）`;
}

async function applyChapterArchitectureRepair(novelId: number, repairResult: any, taskId?: string | null): Promise<any> {
  const tracker = taskId
    ? createProgressTracker(taskId, ['校验修补结果', '更新章架构', '新增章架构', '完成应用'])
    : null;
  try {
    const updatedChapters = Array.isArray(repairResult?.updatedChapters) ? repairResult.updatedChapters : [];
    const newChapters = Array.isArray(repairResult?.newChapters) ? repairResult.newChapters : [];

    tracker?.start(`应用《${novelId}》章架构修补`);
    tracker?.step(0);
    console.log(
      `[arch-apply] 开始应用章架构修补 novelId=${novelId} requestedUpdated=${updatedChapters.length} requestedNew=${newChapters.length}`
    );

    // 预先加载本书的章架构，用来：1) 校验 AI 给的 ID 是否真实；2) 在错误时给出可用 ID 范围。
    const validChapterRows = await Architecture.findAll({
      where: { novel_id: novelId, level: 'chapter' },
      order: [['id', 'ASC']],
    });
    const validIds = validChapterRows.map((row: any) => row.id);
    const validIdSet = new Set<number>(validIds);
    const idHint = describeValidIdRange(validIds);

    let updated = 0;
    let created = 0;

    tracker?.step(1);
    for (const chapter of updatedChapters) {
      const cid = Number(chapter.chapterId);
      if (!validIdSet.has(cid)) {
        throw new Error(
          `updatedChapters[].chapterId=${chapter.chapterId} 不是本小说的章架构ID。${idHint}` +
          ` 提示：AI 可能误用了"第N章"的序号（例如 ${chapter.chapterId} 可能是阅读顺序），请在前端"重新生成修补方案"。`
        );
      }

      const saved = await architectureService.update(cid, {
        title: chapter.title,
        plotOutline: chapter.plotOutline,
        characters: chapter.characters || [],
        worldSetting: chapter.worldSetting || '',
        emotionalTone: chapter.emotionalTone || '',
      });
      if (!saved) {
        throw new Error(`更新章架构失败: ${chapter.chapterId}`);
      }
      updated += 1;
    }

    tracker?.step(2);
    for (const chapter of newChapters) {
      const afterId = Number(chapter.insertAfterChapterId);
      if (!validIdSet.has(afterId)) {
        throw new Error(
          `newChapters[].insertAfterChapterId=${chapter.insertAfterChapterId} 不是本小说的章架构ID。${idHint}` +
          ` 提示：请确认 AI 没有用"第N章"的序号代替 ID。`
        );
      }
      const afterRow = validChapterRows.find((row: any) => row.id === afterId);
      if (!afterRow) {
        throw new Error(`新增章插入位置不存在: ${chapter.insertAfterChapterId}`);
      }

      await architectureService.create({
        novelId,
        level: 'chapter',
        parentId: afterRow.parent_id,
        title: chapter.title,
        plotOutline: chapter.plotOutline,
        characters: chapter.characters || [],
        worldSetting: chapter.worldSetting || '',
        emotionalTone: chapter.emotionalTone || '',
      });
      created += 1;
    }

    tracker?.step(3);
    console.log(`[arch-apply] 应用完成 novelId=${novelId} updated=${updated} created=${created}`);
    tracker?.finish();
    return { updated, created };
  } catch (error: any) {
    console.error(`[arch-apply] 应用失败 novelId=${novelId}:`, error.message);
    tracker?.error(error.message);
    throw error;
  }
}

async function reviewDraftChapterArchitectures(
  draft: NovelBootstrapDraft,
  signal?: AbortSignal,
  taskId?: string | null,
  round = 1,
): Promise<any> {
  const prompt = buildDraftChapterArchitectureReviewPrompt(draft, round);
  const llm = await createLLM({ temperature: 0.4, graph: 'architectureReview' });
  const content = await invokeWithStreaming(llm, [new HumanMessage(prompt)], {
    signal,
    taskId: taskId ?? null,
    resetStream: true,
  });
  return parseJsonWithRepair(content, llm, buildRepairPrompt);
}

async function repairDraftChapterArchitectures(
  draft: NovelBootstrapDraft,
  reviewResult: any,
  userPrompt: string,
  signal?: AbortSignal,
  taskId?: string | null,
  round = 1,
): Promise<any> {
  const prompt = buildDraftChapterArchitectureRepairPrompt(draft, reviewResult, userPrompt, round);
  const llm = await createLLM({ temperature: 0.4, graph: 'architectureRepair' });
  const content = await invokeWithStreaming(llm, [new HumanMessage(prompt)], {
    signal,
    taskId: taskId ?? null,
    resetStream: true,
  });
  return parseJsonWithRepair(content, llm, buildRepairPrompt);
}

function applyDraftChapterArchitectureRepair(
  chapters: DraftChapterArchitecture[],
  repairResult: any,
): DraftChapterArchitecture[] {
  const updatedChapters = Array.isArray(repairResult?.updatedChapters) ? repairResult.updatedChapters : [];
  const newChapters = Array.isArray(repairResult?.newChapters) ? repairResult.newChapters : [];

  let nextNewIndex = 1;
  let currentChapters = chapters.map((chapter) => ({ ...chapter }));

  for (const updatedChapter of updatedChapters) {
    const chapterId = String(updatedChapter.chapterId);
    currentChapters = currentChapters.map((chapter) =>
      chapter.draftId === chapterId
        ? {
            ...chapter,
            title: updatedChapter.title,
            plotOutline: updatedChapter.plotOutline,
            characters: updatedChapter.characters || [],
            worldSetting: updatedChapter.worldSetting || {},
            emotionalTone: updatedChapter.emotionalTone || '',
          }
        : chapter
    );
  }

  for (const newChapter of newChapters) {
    const afterId = String(newChapter.insertAfterChapterId);
    const insertIndex = currentChapters.findIndex((chapter) => chapter.draftId === afterId);
    if (insertIndex === -1) {
      throw new Error(`新增章插入位置不存在: ${afterId}`);
    }
    const parentDraftVolumeId = currentChapters[insertIndex].parentDraftVolumeId;
    const draftId = `ch_added_${nextNewIndex++}`;
    currentChapters.splice(insertIndex + 1, 0, {
      draftId,
      parentDraftVolumeId,
      title: newChapter.title,
      plotOutline: newChapter.plotOutline,
      characters: newChapter.characters || [],
      worldSetting: newChapter.worldSetting || {},
      emotionalTone: newChapter.emotionalTone || '',
      metadata: {},
    });
  }

  return currentChapters;
}

export {
  buildChapterArchitectureReviewPrompt,
  buildChapterArchitectureRepairPrompt,
  reviewArchitectures,
  rewriteArchitectures,
  reviewChapterArchitectures,
  repairChapterArchitectures,
  applyChapterArchitectureRepair,
  reviewDraftChapterArchitectures,
  repairDraftChapterArchitectures,
  applyDraftChapterArchitectureRepair,
};
