**# LangGraph.js 迁移方案**

**## Context**

**当前后端的 AI 交互使用原始 `fetch()` 调用 DeepSeek/Zhipu 的 OpenAI 兼容 API，5 个 agent/service 各自重复了 `getConfig()`、`getAIClient()`、`startProgressLog()`、`sleep()` 等基础设施代码。工作流编排散落在 `chapterService.ts` 中用 try/catch + 手动状态管理。迁移到 LangGraph 的目标是：**

**- 用 StateGraph 显式建模 AI 工作流，使流程可视化、可调试**

**- 消除重复代码，统一 LLM 调用和配置管理**

**- 保持现有 API 接口不变，前端无需修改**

**---**

**## 依赖安装**

**```bash**

**cd backend && npm install @langchain/langgraph @langchain/openai @langchain/core**

**```**

**---**

**## 新建文件**

**### 1. 共享基础设施 (`src/ai/`)**

**| 文件 | 职责 |**

**|------|------|**

**| `src/ai/llmFactory.ts` | 统一 `getAIConfig()` + `createLLM(options)`, 用 `ChatOpenAI` + `baseURL` 适配 DeepSeek/Zhipu |**

**| `src/ai/jsonUtils.ts` | 合并 3 处重复的 `extractJsonObject`、`repairCommonJsonIssues`、`stripCodeFences` + `parseJsonWithRepair(content, llm, repairPromptBuilder)` |**

**| `src/ai/retryUtils.ts` | `withRetry<T>(fn, {maxAttempts, delayMs, signal, label})` 替代分散的 3 次重试循环 |**

**| `src/ai/progressAdapter.ts` | `createProgressTracker(taskId, steps)` 桥接 aiStatusService 到 Graph 节点 |**

**### 2. LangGraph 状态图 (`src/ai/graphs/`)**

**| 文件 | 对应工作流 | 节点 |**

**|------|-----------|------|**

**| `chapterGenerationGraph.ts` | `chapterService.generate()` | loadContext → generateContent → saveContent → extractMemory → reviewChapter → finalize |**

**| `chapterReviewGraph.ts` | `chapterService.reviewChapter()` | loadContext → extractMemory → buildContext → runReview → saveResult |**

**| `chapterRevisionGraph.ts` | `chapterService.reviseChapter()` | loadContext → buildContext → runRevision → saveResult → finalize |**

**| `memoryExtractionGraph.ts` | `chapterMemoryAgent.extractMemoryCard()` | callLLM → parseResponse →(条件边)→ repairJson / normalize |**

**| `architectureGraph.ts` | `architectureAiService` | loadContext → generate |**

**---**

**## 关键设计**

**### LLM 工厂 (`llmFactory.ts`)**

**```typescript**

**// ChatOpenAI + baseURL 适配 OpenAI 兼容 API**

**new ChatOpenAI({**

**  **model: "deepseek-chat",

**  **temperature: 0.8,

**  **maxTokens: 8000,

**  **configuration: { baseURL: deepseekApiUrl },

**  **apiKey: deepseekApiKey

**})**

**```**

**各场景的温度参数保持不变：**

**- 章节生成: 0.8 / 架构生成: 0.8**

**- 审阅: 0.2 / 记忆提取: 0.2**

**- 修订: 0.7**

**### 状态定义示例 (章节生成)**

**```typescript**

**const ChapterGenerationState = Annotation.Root({**

**  **chapterId: Annotation`<number>`,

**  **signal: Annotation<AbortSignal | undefined>,

**  **taskId: Annotation`<string>`,

**  **chapter: Annotation`<any>`,

**  **novel: Annotation`<any>`,

**  **architecture: Annotation`<any>`,

**  **generatedContent: Annotation`<string>`,

**  **memoryCard: Annotation`<any>`,

**  **reviewResult: Annotation`<any>`,

**  **reviewWarning: Annotation<string | undefined>,

**  **updatedChapter: Annotation`<any>`,

**});**

**```**

**### 进度追踪**

**每个节点函数通过 state.taskId 调用 `aiStatusService.step()`：**

**```typescript**

**async function generateContentNode(state) {**

**  **aiStatus.step(state.taskId, 0, '生成章节内容');

**  **const llm = await createLLM({ temperature: 0.8 });

**  **const content = await withRetry(() => llm.invoke(prompt, { signal: state.signal }), ...);

**  **return { generatedContent: content.content };

**}**

**```**

**### JSON 修复 - 条件边 (记忆提取图)**

**```**

**callLLM → parseResponse → [parseSucceeded?]**

**                             **├─ true**  **→ normalize → END

**                             **└─ false → repairJson → normalize → END

**```**

**### AbortSignal 传播**

**`route → graph.invoke({...}, {signal}) → node → llm.invoke(prompt, {signal})`**

**---**

**## 修改现有文件**

**| 文件 | 变更 |**

**|------|------|**

**| `src/services/chapterService.ts` | `generate()`、`reviewChapter()`、`reviseChapter()` 改为调用对应 Graph，CRUD 方法不变 |**

**| `src/services/aiService.ts` | 删除 `getConfig/getAIClient/sleep` 等重复代码，保留 `buildChapterPrompt()`、`getPreviousChapterContent()` |**

**| `src/agents/reviewAgent.ts` | 精简为调用 chapterReviewGraph 的薄包装 |**

**| `src/agents/chapterRevisionAgent.ts` | 精简为调用 chapterRevisionGraph 的薄包装 |**

**| `src/agents/chapterMemoryAgent.ts` | 精简为调用 memoryExtractionGraph 的薄包装 |**

**| `src/services/architectureAiService.ts` | 删除重复代码，调用 architectureGraph |**

**| `src/services/chapterMemoryService.ts` | 无需改动（继续调用 agent 接口，agent 内部切到 Graph） |**

**### 不变的文件**

**`aiStatusService.ts`、`reviewContextService.ts`、所有 routes、models、publishAgent、novelService、exportService、scheduleService**

**---**

**## 迁移顺序**

**| 阶段 | 内容 | 验证方式 |**

**|------|------|---------|**

**| 1. 基础设施 | 安装依赖 + 创建 `llmFactory`、`jsonUtils`、`retryUtils`、`progressAdapter` | 写测试脚本调用 `createLLM()` 发送测试请求 |**

**| 2. 记忆提取图 | 创建 `memoryExtractionGraph` + 修改 `chapterMemoryAgent` | 对已有章节触发记忆提取，对比结果 |**

**| 3. 审阅图 | 创建 `chapterReviewGraph` + 修改 `reviewAgent` + `chapterService.reviewChapter()` | 触发独立审阅，验证 JSON 输出和进度 |**

**| 4. 修订图 | 创建 `chapterRevisionGraph` + 修改 `chapterRevisionAgent` + `chapterService.reviseChapter()` | 用已有审阅结果触发修订 |**

**| 5. 生成图 | 创建 `chapterGenerationGraph` + 修改 `chapterService.generate()` + 精简 `aiService` | 完整生成流程（含自动审阅） |**

**| 6. 架构图 | 创建 `architectureGraph` + 修改 `architectureAiService` | 生成全本/卷/章架构 |**

**| 7. 清理 | 删除各处残留的 `getConfig`、`getAIClient`、`sleep` 等重复代码 | 全接口回归测试 |**

**---**

**## 验证方案**

**每阶段完成后：**

**1. 启动 `npm run dev`，确认无编译错误**

**2. 通过前端 UI 触发对应功能，确认：**

**   **- AI 调用正常返回内容

**   **- SSE 进度推送正常（`/api/ai-status/events`）

**   **- AbortSignal 取消功能正常

**   **- JSON 解析/修复机制正常

**3. 对比迁移前后同一操作的输出，确保行为一致**
