import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { Chapter, MultiChapterReview } from '../../models/sequelize';
import { createLLM } from '../llmFactory';
import { extractJsonObject } from '../jsonUtils';
import { createProgressTracker } from '../progressAdapter';
import { invokeWithStreaming } from '../streaming';

const STEPS = ['准备修订任务', '逐章生成修订稿', '保存草稿'];

const MultiChapterFixState = Annotation.Root({
  reviewId: Annotation<string>,
  selectedIssueIds: Annotation<string[]>,
  issueSuggestions: Annotation<Record<string, string>>,
  taskId: Annotation<string>,
  signal: Annotation<AbortSignal | undefined>,
  review: Annotation<any>,
  fixTasks: Annotation<any[]>,
  drafts: Annotation<any[]>,
});

function buildChapterFixPrompt(chapterNumber: number, content: string, issues: any[]): string {
  const issueLines = issues.map((issue: any, idx: number) => {
    const evidenceLines = (issue.evidence || []).map((ev: any) =>
      `    第${ev.chapterNumber}章证据："${ev.excerpt}"`
    ).join('\n');
    return [
      `[问题${idx + 1}] ${issue.type}（${issue.severity}）`,
      `  ${issue.description}`,
      evidenceLines,
      `  建议：${issue.suggestion || ''}`,
      issue.userSuggestion ? `  用户修订意图：${issue.userSuggestion}` : '',
    ].join('\n');
  }).join('\n\n');

  return `你是一位专业的网络小说编辑，请修订第 ${chapterNumber} 章，修复以下跨章逻辑问题。
只修改必要内容，保留原有风格和字数范围（4500-5500字）。

===== 需要修复的问题 =====
${issueLines}

===== 第 ${chapterNumber} 章全文 =====
${content}

===== 修订要求 =====
请输出修订后的完整正文（不要标题），以及修改摘要。

请优先按以下格式返回（不要 markdown 代码块）：
{
  "summary": "修改摘要",
  "appliedIssues": ["问题1的简述"]
}
<<<REVISED_CONTENT>>>
修订后的完整正文...
<<<END_REVISED_CONTENT>>>

补充要求：
1. JSON 中不要包含 revisedContent 字段
2. 完整正文放在 <<<REVISED_CONTENT>>> 和 <<<END_REVISED_CONTENT>>> 之间
3. 如果你没法严格按格式输出，至少保证完整正文单独连续输出，不要截断`;
}

function buildRepairPrompt(raw: string): string {
  return `请把以下文本修复成合法 JSON，并保留正文块。

要求：
1. 只能输出两部分：一个 JSON 对象 + 一个正文块
2. JSON 结构为：
{
  "summary": "修改摘要",
  "appliedIssues": ["问题1的简述"]
}
3. 完整正文必须放在：
<<<REVISED_CONTENT>>>
正文
<<<END_REVISED_CONTENT>>>
4. 不要丢失原文已有信息

待修复文本：
${raw}`;
}

function extractTaggedRevisedContent(content: string): string {
  const match = content.match(/<<<REVISED_CONTENT>>>\s*([\s\S]*?)(?:<<<END_REVISED_CONTENT>>>|$)/);
  return sanitizeRevisionText(match?.[1] || '');
}

function sanitizeRevisionText(content: string): string {
  return (content || '')
    .replace(/<<<REVISED_CONTENT>>>/g, '')
    .replace(/<<<END_REVISED_CONTENT>>>/g, '')
    .trim();
}

function parseRevisionResult(content: string): any {
  const taggedContent = extractTaggedRevisedContent(content);
  const jsonText = extractJsonObject(content);

  let parsed: any = {
    summary: '',
    appliedIssues: [],
    revisedContent: taggedContent,
  };

  if (jsonText) {
    try {
      const json = JSON.parse(jsonText);
      parsed = {
        summary: json.summary || '',
        appliedIssues: Array.isArray(json.appliedIssues) ? json.appliedIssues : [],
        revisedContent: sanitizeRevisionText(json.revisedContent || taggedContent),
      };
    } catch {
      parsed = {
        summary: '',
        appliedIssues: [],
        revisedContent: taggedContent,
      };
    }
  }

  if (!parsed.revisedContent) {
    const fallbackBody = sanitizeRevisionText(content.replace(jsonText || '', ''));
    parsed.revisedContent = fallbackBody;
  }

  return parsed;
}

function validateRevisionResult(parsed: any, originalContent: string): void {
  if (!parsed.revisedContent || !parsed.revisedContent.trim()) {
    throw new Error('模型未返回修订正文');
  }

  const revisedLength = parsed.revisedContent.trim().length;
  const originalLength = (originalContent || '').trim().length;

  if (originalLength >= 800 && revisedLength < Math.max(200, Math.floor(originalLength * 0.2))) {
    throw new Error('修订结果疑似被截断');
  }
}

// Node: load review from DB and filter selected issues
async function loadReviewNode(state: typeof MultiChapterFixState.State) {
  const tracker = createProgressTracker(state.taskId, STEPS);
  tracker.start('多章修订');
  tracker.step(0);

  const record = await MultiChapterReview.findByPk(state.reviewId);
  if (!record) throw new Error('审阅记录不存在');

  const allIssues: any[] = record.review_data ? JSON.parse(record.review_data) : [];
  const selectedSet = new Set(state.selectedIssueIds);
  const filteredIssues = allIssues
    .filter((issue: any) => selectedSet.has(issue.id))
    .map((issue: any) => ({
      ...issue,
      userSuggestion: state.issueSuggestions?.[issue.id] || '',
    }));

  const review = {
    id: record.id,
    novel_id: record.novel_id,
    chapter_ids: JSON.parse(record.chapter_ids),
    issues: filteredIssues,
    status: record.status,
  };

  return { review };
}

// Node: group issues by chapter and build fix tasks
async function buildFixTasksNode(state: typeof MultiChapterFixState.State) {
  const issues: any[] = state.review.issues || [];

  // Group issues by affected chapter IDs
  const chapterIssuesMap = new Map<number, any[]>();
  for (const issue of issues) {
    const affectedIds: number[] = issue.affectedChapterIds || [];
    for (const chapterId of affectedIds) {
      if (!chapterIssuesMap.has(chapterId)) {
        chapterIssuesMap.set(chapterId, []);
      }
      chapterIssuesMap.get(chapterId)!.push(issue);
    }
  }

  const chapterIds = Array.from(chapterIssuesMap.keys());

  // Load chapter info (no content yet)
  const chapterRecords = await Chapter.findAll({
    attributes: ['id', 'chapter_number', 'title'],
    where: { id: chapterIds },
  });

  const chapterMap = new Map<number, any>();
  for (const ch of chapterRecords) {
    chapterMap.set((ch as any).id, ch);
  }

  // Build fix tasks sorted by chapter_number ascending
  const fixTasks = chapterIds
    .map((chapterId) => {
      const ch = chapterMap.get(chapterId);
      if (!ch) return null;
      return {
        chapterId,
        chapterNumber: (ch as any).chapter_number,
        title: (ch as any).title,
        issues: chapterIssuesMap.get(chapterId)!,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.chapterNumber - b.chapterNumber);

  return { fixTasks };
}

// Node: generate revision drafts serially per chapter
async function generateFixesNode(state: typeof MultiChapterFixState.State) {
  const tracker = createProgressTracker(state.taskId, STEPS);
  tracker.step(1);

  const llm = await createLLM({
    temperature: 0.7,
    maxTokens: 12000,
  });
  const drafts: any[] = [];

  for (let i = 0; i < state.fixTasks.length; i++) {
    const task = state.fixTasks[i];
    console.log(`[multi-fix] 修订第 ${task.chapterNumber} 章（${i + 1}/${state.fixTasks.length}）`);

    // Load full chapter content
    const chapter = await Chapter.findByPk(task.chapterId);
    if (!chapter) {
      console.warn(`[multi-fix] 章节 ${task.chapterId} 不存在，跳过`);
      continue;
    }

    const originalContent: string = (chapter as any).content || '';
    const prompt = buildChapterFixPrompt(task.chapterNumber, originalContent, task.issues);

    const content = await invokeWithStreaming(
      llm,
      [new HumanMessage(prompt)],
      { signal: state.signal, taskId: state.taskId, resetStream: true }
    );
    let parsed: any;
    try {
      parsed = parseRevisionResult(content);
      validateRevisionResult(parsed, originalContent);
    } catch (error) {
      console.warn(
        `[multi-fix] 首次解析失败，尝试修复输出。chapterId=${task.chapterId} error=${(error as Error).message}`
      );
      const repaired = await invokeWithStreaming(
        llm,
        [new HumanMessage(buildRepairPrompt(content))],
        { signal: state.signal, taskId: state.taskId, resetStream: true }
      );
      parsed = parseRevisionResult(repaired);
      validateRevisionResult(parsed, originalContent);
    }

    const draft = {
      chapterId: task.chapterId,
      chapterNumber: task.chapterNumber,
      title: task.title,
      originalContent,
      revisedContent: parsed.revisedContent || '',
      appliedIssueIds: task.issues.map((iss: any) => iss.id),
      summary: parsed.summary || '',
      status: 'pending',
    };

    drafts.push(draft);
    console.log(`[multi-fix] 第 ${task.chapterNumber} 章修订完成，字数: ${draft.revisedContent.length}`);
  }

  return { drafts };
}

// Node: save drafts to MultiChapterReview record
async function saveDraftsNode(state: typeof MultiChapterFixState.State) {
  const tracker = createProgressTracker(state.taskId, STEPS);
  tracker.step(2);

  await MultiChapterReview.update(
    {
      fix_data: JSON.stringify(state.drafts),
      status: 'fixed',
    },
    { where: { id: state.reviewId } }
  );

  return { drafts: state.drafts };
}

// Node: finalize
async function finalizeNode(state: typeof MultiChapterFixState.State) {
  const tracker = createProgressTracker(state.taskId, STEPS);
  tracker.finish();
  console.log(`[multi-fix] 多章修订完成，reviewId=${state.reviewId}，共 ${state.drafts.length} 章修订稿`);
  return {};
}

const graph = new StateGraph(MultiChapterFixState)
  .addNode('loadReview', loadReviewNode)
  .addNode('buildFixTasks', buildFixTasksNode)
  .addNode('generateFixes', generateFixesNode)
  .addNode('saveDrafts', saveDraftsNode)
  .addNode('finalize', finalizeNode)
  .addEdge(START, 'loadReview')
  .addEdge('loadReview', 'buildFixTasks')
  .addEdge('buildFixTasks', 'generateFixes')
  .addEdge('generateFixes', 'saveDrafts')
  .addEdge('saveDrafts', 'finalize')
  .addEdge('finalize', END)
  .compile();

export { graph as multiChapterFixGraph, MultiChapterFixState, buildChapterFixPrompt };
