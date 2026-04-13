import { SystemConfig } from '../models/sequelize';

async function review(params: any, signal?: AbortSignal): Promise<any> {
  const { chapter, novel, architecture, currentMemory, relevantMemories = [], sourceExcerpts = [] } = params;
  const config = await getConfig();
  const reviewPrompt = buildReviewPrompt(chapter, novel, architecture, config, { currentMemory, relevantMemories, sourceExcerpts });
  const aiClient = getAIClient(config, signal);

  try {
    const reviewResult = await aiClient.generate(reviewPrompt);
    return await parseReviewResultWithRepair(reviewResult, aiClient);
  } catch (error: any) {
    console.error('审核失败:', error.message);
    return {
      score: 0,
      issues: [{ type: 'review_error', severity: 'high', description: '审核服务异常', currentEvidence: '', historicalEvidence: '', historicalChapterNumber: null, suggestion: error.message }],
      notes: []
    };
  }
}

async function getConfig(): Promise<any> {
  const configs = await SystemConfig.findAll();
  const configMap: any = {};
  configs.forEach((c: any) => {
    try { configMap[c.config_key] = JSON.parse(c.config_value); }
    catch { configMap[c.config_key] = c.config_value; }
  });
  return {
    aiModel: configMap.aiModel || process.env.DEFAULT_AI_MODEL || 'zhipu',
    zhipuApiKey: configMap.zhipuApiKey || process.env.ZHIPU_API_KEY,
    zhipuApiUrl: process.env.ZHIPU_API_URL,
    deepseekApiKey: configMap.deepseekApiKey || process.env.DEEPSEEK_API_KEY,
    deepseekApiUrl: process.env.DEEPSEEK_API_URL,
    reviewStrictness: configMap.reviewStrictness || process.env.REVIEW_STRICTNESS || 'strict'
  };
}

function buildReviewPrompt(chapter: any, novel: any, architecture: any, config: any, reviewContext: any = {}): string {
  const strictnessGuide = config.reviewStrictness === 'strict' ? '请严格审核，任何不一致都需要指出' : '请宽松审核，只指出明显的不一致问题';
  const relevantMemories = Array.isArray(reviewContext.relevantMemories) ? reviewContext.relevantMemories : [];
  const sourceExcerpts = Array.isArray(reviewContext.sourceExcerpts) ? reviewContext.sourceExcerpts : [];
  return `你是一位专业的小说逻辑审校编辑，请审核以下章节内容，只找"有证据的硬逻辑错误"。${strictnessGuide}
## 章节信息
标题：${chapter.title || ''}
序号：第${chapter.chapter_number}章
正文：${(chapter.content || '').slice(0, 3000)}...
## 小说信息
标题：${novel.title}
类型：${novel.genre || ''}
## 架构信息
${formatArchitecture(architecture)}
## 当前章节记忆卡
${formatMemoryCard(reviewContext.currentMemory)}
${relevantMemories.map((m: any, i: number) => `### 相关记忆 ${i+1} (第${m.chapter_number}章)\n${formatMemoryCard(m)}\n### 参考段落 ${i+1}\n${sourceExcerpts[i]?.excerpt || ''}`).join('\n')}
## 审核要求
请检查：1.时间线错误 2.人物状态矛盾 3.情节因果错乱 4.数字不一致 5.场景逻辑错误。
只报告有证据的错误，不要推测。
请返回JSON格式：{ "score": number, "issues": [{ "type": string, "severity": string, "description": string, "currentEvidence": string, "historicalEvidence": string, "historicalChapterNumber": number|null, "suggestion": string }], "notes": [] }`;
}

function formatArchitecture(architecture: any): string {
  if (!architecture) return '无';
  return `层级: ${architecture.level}\n标题: ${architecture.title}\n情节: ${architecture.plot_outline || ''}\n`;
}

function formatMemoryCard(memory: any): string {
  if (!memory) return '无';
  return `概要: ${memory.summary || ''}\n人物: ${(memory.entities?.characters || []).join(', ')}\n地点: ${(memory.entities?.locations || []).join(', ')}\n事实: ${(memory.facts || []).slice(0, 3).map((f: any) => `${f.subject}${f.predicate}${f.object}`).join('; ')}`;
}

async function parseReviewResultWithRepair(result: string, aiClient: any): Promise<any> {
  try { return parseReviewResult(result, ''); }
  catch {
    const repaired = await aiClient.generate(buildRepairPrompt(result));
    return parseReviewResult(repaired, result);
  }
}

function parseReviewResult(result: string, repairedResult: string): any {
  try {
    const jsonText = extractJsonObject(result);
    return JSON.parse(repairCommonJsonIssues(jsonText));
  } catch { return { score: 0, issues: [], notes: [], raw: result }; }
}

function extractJsonObject(content: string): string {
  const text = stripCodeFences(content);
  const start = text.indexOf('{');
  if (start === -1) return '';
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') inString = false; continue; }
    if (char === '"') { inString = true; continue; }
    if (char === '{') depth++;
    if (char === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return text.slice(start);
}

function repairCommonJsonIssues(content: string): string {
  const normalized = content.replace(/\uff0c/g, ',').replace(/\uff1a/g, ':').replace(/```(?:json)?/g, '').trim();
  return normalized.replace(/,\s*([}\]])/g, '$1');
}

function stripCodeFences(content: string): string { return content.replace(/```(?:json)?/g, '').trim(); }

function buildRepairPrompt(rawResult: string): string { return `请把以下文本修复成合法JSON：${rawResult}`; }

function startProgressLog(label: string, signal?: AbortSignal): () => void {
  const start = Date.now(), timer = setInterval(() => console.log(`[AI] ${label} 生成中... 已等待 ${Math.round((Date.now() - start) / 1000)}s`), 5000);
  signal?.addEventListener('abort', () => clearInterval(timer), { once: true });
  return () => clearInterval(timer);
}

function getAIClient(config: any, signal?: AbortSignal): any {
  const client = config.aiModel === 'deepseek' ? 'deepseek-chat' : 'glm-4';
  const url = config.aiModel === 'deepseek' ? config.deepseekApiUrl : config.zhipuApiUrl;
  const key = config.aiModel === 'deepseek' ? config.deepseekApiKey : config.zhipuApiKey;
  return {
    generate: async (prompt: string) => {
      const stop = startProgressLog(client, signal);
      const res = await fetch(url!, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: client, messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 8000 }) });
      if (!res.ok) throw new Error(`API错误: ${res.status}`);
      const data = await res.json() as any;
      return data.choices[0].message.content;
    }
  };
}

export default { review };