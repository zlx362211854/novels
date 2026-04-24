import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { Chapter, Novel, Architecture } from "../../models/sequelize";
import { createLLM } from "../llmFactory";
import { withRetry } from "../retryUtils";
import { createProgressTracker } from "../progressAdapter";
import { invokeWithStreaming } from "../streaming";
import * as chapterMemoryService from "../../services/chapterMemoryService";
import { chapterReviewGraph } from "./chapterReviewGraph";
import { chapterRevisionGraph } from "./chapterRevisionGraph";
import {
  buildChapterPrompt,
  getPreviousChapterContent,
} from "../../services/aiService";

const MAX_AUTO_REVISION_ROUNDS = 3;

const ChapterGenerationState = Annotation.Root({
  // Inputs
  chapterId: Annotation<number>,
  signal: Annotation<AbortSignal | undefined>,
  userPrompt: Annotation<string | undefined>,
  taskId: Annotation<string>,

  // Loaded context
  chapter: Annotation<any>,
  novel: Annotation<any>,
  architecture: Annotation<any>,

  // Intermediate
  generatedContent: Annotation<string>,
  reviewResult: Annotation<any>,
  reviewWarning: Annotation<string>,
  autoRevisionRounds: Annotation<number>,

  // Output
  updatedChapter: Annotation<any>,
});

function hasHighSeverityIssues(reviewResult: any): boolean {
  return (
    Array.isArray(reviewResult?.issues) &&
    reviewResult.issues.some((issue: any) => issue?.severity === "high")
  );
}

// Helper: ensure chapter number matches architecture ordering
async function ensureChapterNumber(chapter: any): Promise<any> {
  if (!chapter.architecture_id) return chapter;

  const arch = await Architecture.findByPk(chapter.architecture_id);
  if (!arch) return chapter;

  const volumes = await Architecture.findAll({
    where: { novel_id: arch.novel_id, level: "volume" },
    order: [["id", "ASC"]],
  });
  const volumeOrder = new Map(
    volumes.map((volume: any, index: number) => [volume.id, index]),
  );

  const chapterArchitectures = await Architecture.findAll({
    where: { novel_id: arch.novel_id, level: "chapter" },
    order: [["id", "ASC"]],
  });

  const orderedArchitectures = chapterArchitectures.sort((left: any, right: any) => {
    const leftOrder = volumeOrder.get(left.parent_id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = volumeOrder.get(right.parent_id) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.id - right.id;
  });

  const index = orderedArchitectures.findIndex((item: any) => item.id === arch.id);
  const correctNumber = index >= 0 ? index + 1 : chapter.chapter_number;

  if (chapter.chapter_number !== correctNumber) {
    console.log(
      `[chapter] 修正章节编号: ${chapter.chapter_number} -> ${correctNumber} (chapterId=${chapter.id})`,
    );
    const record =
      typeof chapter.save === "function"
        ? chapter
        : await Chapter.findByPk(chapter.id);
    record.chapter_number = correctNumber;
    await record.save();
    if (typeof chapter.save !== "function") {
      chapter.chapter_number = correctNumber;
    }
  }

  return chapter;
}

// Node: load chapter, novel, architecture from DB
async function loadContextNode(state: typeof ChapterGenerationState.State) {
  let chapter = await Chapter.findByPk(state.chapterId);
  if (!chapter) throw new Error("章节不存在");
  chapter = await ensureChapterNumber(chapter);

  const novel = await Novel.findByPk(chapter.novel_id);
  const architecture = chapter.architecture_id
    ? await Architecture.findByPk(chapter.architecture_id)
    : null;

  console.log(
    `[chapter-generate] 开始生成: chapterId=${state.chapterId} title="${chapter.title || "未命名"}"`,
  );
  const tracker = createProgressTracker(state.taskId, [
    "生成章节内容",
    "提取记忆卡",
    "逻辑审阅",
  ]);
  tracker.start(`生成「${chapter.title || "章节"}」`);

  return { chapter, novel, architecture };
}

// Node: call LLM to generate chapter content
async function generateContentNode(state: typeof ChapterGenerationState.State) {
  console.log(
    `[chapter-generate] 调用 LLM 生成章节正文... chapterId=${state.chapterId}`,
  );
  const tracker = createProgressTracker(state.taskId, [
    "生成章节内容",
    "提取记忆卡",
    "逻辑审阅",
  ]);
  tracker.step(0);

  const { novel, chapter, architecture } = state;

  const fullArch = await Architecture.findOne({
    where: { novel_id: novel.id, level: "full" },
  });

  let volumeArch = null;
  let volumeChapterArchs: any[] = [];
  if (architecture) {
    if (architecture.level === "chapter" && architecture.parent_id) {
      volumeArch = await Architecture.findByPk(architecture.parent_id);
      volumeChapterArchs = await Architecture.findAll({
        where: { parent_id: architecture.parent_id, level: "chapter" },
        order: [["id", "ASC"]],
      });
    } else if (architecture.level === "volume") {
      volumeArch = architecture;
      volumeChapterArchs = await Architecture.findAll({
        where: { parent_id: architecture.id, level: "chapter" },
        order: [["id", "ASC"]],
      });
    }
  }

  const prevChapterContent = architecture?.id
    ? await getPreviousChapterContent(architecture.id, architecture.parent_id)
    : null;

  const prompt = buildChapterPrompt(
    novel,
    architecture || chapter,
    volumeArch,
    fullArch,
    prevChapterContent,
    volumeChapterArchs,
    state.userPrompt || "",
  );

  const llm = await createLLM({
    temperature: 0.8,
    maxTokens: 9000,
    provider: 'deepseek'
  });
  let generatedContent = await withRetry(
    async () => {
      return await invokeWithStreaming(llm, [new HumanMessage(prompt)], {
        signal: state.signal,
        taskId: state.taskId,
        resetStream: true,
      });
    },
    {
      maxAttempts: 3,
      delayMs: 60000,
      signal: state.signal,
      label: "generateChapter",
    },
  );

  console.log(
    `[chapter-generate] LLM 生成完成，字数: ${generatedContent.length}`,
  );
  return { generatedContent };
}

// Node: save generated content to DB
async function saveContentNode(state: typeof ChapterGenerationState.State) {
  console.log(
    `[chapter-generate] 保存章节内容到数据库... chapterId=${state.chapterId}`,
  );

  const chapterRecord = await Chapter.findByPk(state.chapterId);
  if (chapterRecord) {
    if (chapterRecord.content) {
      // Create version backup
      const { ChapterVersion } = await import("../../models/sequelize");
      const count = await ChapterVersion.count({
        where: { chapter_id: state.chapterId },
      });
      await ChapterVersion.create({
        chapter_id: state.chapterId,
        version_number: count + 1,
        content: chapterRecord.content,
      });
    }
    chapterRecord.content = state.generatedContent;
    chapterRecord.status = "generated";
    chapterRecord.review_result = null;
    await chapterRecord.save();
  }

  const updatedChapter = await Chapter.findByPk(state.chapterId);
  return { updatedChapter };
}

// Node: extract memory card for the generated chapter
async function extractMemoryNode(state: typeof ChapterGenerationState.State) {
  const tracker = createProgressTracker(state.taskId, [
    "生成章节内容",
    "提取记忆卡",
    "逻辑审阅",
  ]);
  tracker.step(1);

  try {
    await chapterMemoryService.upsertForChapter(
      Number(state.chapterId),
      state.signal,
    );
  } catch (error) {
    console.error(
      `[chapter-generate] 记忆卡提取失败，已跳过。chapterId=${state.chapterId}`,
      (error as Error).message,
    );
  }
  return {};
}

// Node: auto-review the generated chapter
async function reviewChapterNode(state: typeof ChapterGenerationState.State) {
  console.log(
    `[chapter-generate] 开始自动逻辑审阅... chapterId=${state.chapterId}`,
  );
  const tracker = createProgressTracker(state.taskId, [
    "生成章节内容",
    "提取记忆卡",
    "逻辑审阅",
  ]);
  tracker.step(2);

  try {
    let currentChapter = state.updatedChapter;
    let latestReviewResult: any = null;
    let autoRevisionRounds = 0;
    let reviewWarning = "";

    for (let round = 0; round <= MAX_AUTO_REVISION_ROUNDS; round += 1) {
      const reviewState = await chapterReviewGraph.invoke(
        {
          chapterId: Number(state.chapterId),
          signal: state.signal,
          chapter: currentChapter,
          novel: state.novel,
          architecture: state.architecture,
          currentMemory: null,
          reviewContext: null,
          reviewResult: null,
          taskId: null, // sub-graph, no standalone progress
        },
        { signal: state.signal },
      );

      latestReviewResult = reviewState.reviewResult;

      if (!hasHighSeverityIssues(latestReviewResult)) {
        if (autoRevisionRounds > 0) {
          reviewWarning = `已自动修订 ${autoRevisionRounds} 轮，当前已无 high 级问题。`;
        }
        break;
      }

      if (round >= MAX_AUTO_REVISION_ROUNDS) {
        reviewWarning = `已自动修订 ${autoRevisionRounds} 轮，但仍存在 high 级问题，请人工复核。`;
        break;
      }

      const revisionState = await chapterRevisionGraph.invoke(
        {
          chapterId: Number(state.chapterId),
          reviewResult: latestReviewResult,
          userPrompt: "",
          signal: state.signal,
          taskId: null,
          chapter: currentChapter,
          novel: state.novel,
          reviewContext: null,
          revisionResult: null,
          updatedChapter: null,
        },
        { signal: state.signal },
      );

      currentChapter = revisionState.updatedChapter;
      autoRevisionRounds += 1;
      console.log(
        `[chapter-generate] 检测到 high 问题，已自动修订第 ${autoRevisionRounds} 轮 chapterId=${state.chapterId}`,
      );
    }

    return {
      reviewResult: latestReviewResult,
      reviewWarning,
      autoRevisionRounds,
      updatedChapter: currentChapter,
    };
  } catch (error) {
    const warning = `自动审阅已跳过：${(error as Error).message}`;
    console.error(
      `[chapter-generate] 自动审阅失败，已跳过。chapterId=${state.chapterId}`,
      error,
    );
    return { reviewWarning: warning, autoRevisionRounds: 0 };
  }
}

// Node: finalize and report completion
async function finalizeNode(state: typeof ChapterGenerationState.State) {
  console.log(`[chapter-generate] 生成流程完成 chapterId=${state.chapterId}`);
  const tracker = createProgressTracker(state.taskId, [
    "生成章节内容",
    "提取记忆卡",
    "逻辑审阅",
  ]);
  tracker.finish();
  return {};
}

const graph = new StateGraph(ChapterGenerationState)
  .addNode("loadContext", loadContextNode)
  .addNode("generateContent", generateContentNode)
  .addNode("saveContent", saveContentNode)
  .addNode("extractMemory", extractMemoryNode)
  .addNode("reviewChapter", reviewChapterNode)
  .addNode("finalize", finalizeNode)
  .addEdge(START, "loadContext")
  .addEdge("loadContext", "generateContent")
  .addEdge("generateContent", "saveContent")
  .addEdge("saveContent", "extractMemory")
  .addEdge("extractMemory", "reviewChapter")
  .addEdge("reviewChapter", "finalize")
  .addEdge("finalize", END)
  .compile();

export {
  graph as chapterGenerationGraph,
  ChapterGenerationState,
  hasHighSeverityIssues,
};
