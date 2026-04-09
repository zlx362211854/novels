const { SystemConfig } = require('../models/sequelize');

async function review(params, signal) {
  const {
    chapter,
    novel,
    architecture,
    currentMemory,
    relevantMemories = [],
    sourceExcerpts = []
  } = params;

  const config = await getConfig();

  const reviewPrompt = buildReviewPrompt(
    chapter,
    novel,
    architecture,
    config,
    { currentMemory, relevantMemories, sourceExcerpts }
  );

  const aiClient = getAIClient(config, signal);

  try {
    const reviewResult = await aiClient.generate(reviewPrompt);
    return await parseReviewResultWithRepair(reviewResult, aiClient);
  } catch (error) {
    console.error('审核失败:', error.message);
    return {
      score: 0,
      issues: [{
        type: 'review_error',
        severity: 'high',
        description: '审核服务异常',
        currentEvidence: '',
        historicalEvidence: '',
        historicalChapterNumber: null,
        suggestion: error.message
      }],
      notes: []
    };
  }
}

async function getConfig() {
  const configs = await SystemConfig.findAll();

  const configMap = {};
  configs.forEach(c => {
    try {
      configMap[c.config_key] = JSON.parse(c.config_value);
    } catch {
      configMap[c.config_key] = c.config_value;
    }
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

function buildReviewPrompt(chapter, novel, architecture, config, reviewContext = {}) {
  const strictnessGuide = config.reviewStrictness === 'strict'
    ? '请严格审核，任何不一致都需要指出'
    : '请宽松审核，只指出明显的不一致问题';
  const relevantMemories = Array.isArray(reviewContext.relevantMemories)
    ? reviewContext.relevantMemories
    : [];
  const sourceExcerpts = Array.isArray(reviewContext.sourceExcerpts)
    ? reviewContext.sourceExcerpts
    : [];

  return `你是一位专业的小说逻辑审校编辑，请审核以下章节内容，只找“有证据的硬逻辑错误”。

## 小说基本信息
标题：${novel.title}
类型：${novel.genre || '未指定'}

## 架构设定
${formatArchitecture(architecture)}

## 当前章节记忆卡
${formatMemoryCard(reviewContext.currentMemory)}

## 历史相关记忆
${formatRelevantMemories(relevantMemories)}

## 历史原文证据
${formatSourceExcerpts(sourceExcerpts)}

## 待审核章节
标题：${chapter.title || '未命名'}
序号：${chapter.chapter_number}

内容：
${chapter.content}

## 审核要求
${strictnessGuide}

硬性规则：
1. 只报告“人物状态冲突 / 信息知晓冲突 / 时间线冲突 / 世界规则冲突 / 关键物品状态冲突”
2. 若架构与历史正文冲突，以历史正文为准；这种情况只可写入 notes，不能当成正文错误
3. 没有历史证据支持时，不要臆测冲突
4. 每个 issue 都要尽量引用当前章证据和历史章证据
5. 如果没有发现硬逻辑错误，issues 返回空数组
6. 请尽量简洁：每个 issue 的 description、currentEvidence、historicalEvidence、suggestion 各控制在 80 字以内，抓核心即可

请以JSON格式返回审核结果：
{
  "score": <0-100的评分>,
  "issues": [
    {
      "type": "<character_state_conflict|knowledge_conflict|timeline_conflict|world_rule_conflict|item_state_conflict>",
      "severity": "<high|medium|low>",
      "description": "<问题描述>",
      "currentEvidence": "<当前章证据>",
      "historicalEvidence": "<历史章证据>",
      "historicalChapterNumber": <历史章节号，若无则为null>,
      "suggestion": "<修改建议>"
    }
  ],
  "notes": ["<架构与正文不一致但不算正文错误的提示，可为空数组>"]
}

额外格式要求：
1. 只能输出 JSON，不要输出 markdown 代码块，不要加解释文字
2. 所有字符串必须使用英文半角双引号 "
3. 禁止使用中文引号 “ ” 或 ‘ ’
4. historicalChapterNumber 若未知必须返回 null，不要写“无”`;
}

function formatArchitecture(architecture) {
  if (!architecture) return '无架构设定';

  let info = `层级: ${architecture.level}\n`;
  info += `标题: ${architecture.title}\n`;
  if (architecture.plot_outline) info += `情节大纲: ${architecture.plot_outline}\n`;
  if (architecture.characters) {
    try {
      const chars = typeof architecture.characters === 'string'
        ? JSON.parse(architecture.characters)
        : architecture.characters;
      info += `人物设定: ${JSON.stringify(chars, null, 2)}\n`;
    } catch {
      info += `人物设定: ${architecture.characters}\n`;
    }
  }
  if (architecture.world_setting) {
    try {
      const world = typeof architecture.world_setting === 'string'
        ? JSON.parse(architecture.world_setting)
        : architecture.world_setting;
      info += `世界观: ${JSON.stringify(world, null, 2)}\n`;
    } catch {
      info += `世界观: ${architecture.world_setting}\n`;
    }
  }
  if (architecture.emotional_tone) info += `情感基调: ${architecture.emotional_tone}\n`;

  return info;
}

function parseReviewResult(result, repairedResult) {
  try {
    const jsonText = extractJsonObject(result);
    if (jsonText) {
      return JSON.parse(repairCommonJsonIssues(jsonText));
    }
  } catch (error) {
    console.error('解析审核结果失败:', error.message);
  }

  if (repairedResult) {
    try {
      const jsonText = extractJsonObject(repairedResult);
      if (jsonText) {
        return JSON.parse(repairCommonJsonIssues(jsonText));
      }
    } catch (error) {
      console.error('解析修复后的审核结果失败:', error.message);
    }
  }

  console.error('原始审核输出片段:', snippetForLog(result));
  if (repairedResult) {
    console.error('修复后审核输出片段:', snippetForLog(repairedResult));
  }

  return {
    score: 50,
    issues: [{
      type: 'parse_error',
      severity: 'high',
      description: '无法解析审核结果',
      currentEvidence: '',
      historicalEvidence: '',
      historicalChapterNumber: null,
      suggestion: '请手动检查内容'
    }],
    notes: []
  };
}

function normalizeJsonLikeString(content) {
  return content
    .replace(/\uff0c/g, ',')
    .replace(/\uff1a/g, ':');
}

function repairCommonJsonIssues(content) {
  const normalized = normalizeJsonLikeString(stripCodeFences(content));
  const lines = normalized.split('\n');
  const repairedLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (repairedLines.length > 0 && startsWithJsonKey(trimmed)) {
      const previous = repairedLines[repairedLines.length - 1];
      if (endsWithJsonValue(previous) && !previous.trim().endsWith(',')) {
        repairedLines[repairedLines.length - 1] = `${previous},`;
      }
    }
    repairedLines.push(line);
  }

  return repairedLines
    .join('\n')
    .replace(/,\s*([}\]])/g, '$1');
}

function stripCodeFences(content) {
  return content.replace(/```(?:json)?/g, '').trim();
}

function startsWithJsonKey(line) {
  return /^"[^"]+"\s*:/.test(line);
}

function endsWithJsonValue(line) {
  const trimmed = line.trim();
  return /("|\]|\}|null|true|false|\d)\s*$/.test(trimmed);
}

function extractJsonObject(content) {
  const text = stripCodeFences(content);
  const start = text.indexOf('{');
  if (start === -1) return '';

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return text.slice(start);
}

function snippetForLog(content) {
  return (content || '').slice(0, 800);
}

async function parseReviewResultWithRepair(result, aiClient) {
  const firstPass = parseReviewResult(result);
  if (!(firstPass.issues?.[0]?.type === 'parse_error')) {
    return firstPass;
  }

  if (!result || !result.trim()) {
    console.warn('[review] AI 返回空内容，跳过修复重试');
    return firstPass;
  }

  const repaired = await aiClient.generate(buildRepairPrompt(result));
  return parseReviewResult(result, repaired);
}

function buildRepairPrompt(rawResult) {
  return `请把下面这段“本来想输出为JSON，但格式损坏了”的文本，修复成合法 JSON。

要求：
1. 只能输出 JSON
2. 保持原有语义，不要添加新结论
3. 所有字符串必须使用英文半角双引号 "
4. 输出结构必须是：
{
  "score": 0,
  "issues": [
    {
      "type": "",
      "severity": "",
      "description": "",
      "currentEvidence": "",
      "historicalEvidence": "",
      "historicalChapterNumber": null,
      "suggestion": ""
    }
  ],
  "notes": []
}

待修复文本：
${rawResult}`;
}

function formatMemoryCard(memory) {
  if (!memory) return '无';

  return JSON.stringify({
    summary: memory.summary || '',
    entities: memory.entities || {},
    facts: memory.facts || [],
    state_changes: memory.state_changes || [],
    open_threads: memory.open_threads || []
  }, null, 2);
}

function formatRelevantMemories(memories) {
  if (!memories.length) return '无';

  return memories.map((memory) => JSON.stringify({
    chapter_number: memory.chapter_number,
    summary: memory.summary || '',
    entities: memory.entities || {},
    facts: memory.facts || [],
    state_changes: memory.state_changes || [],
    open_threads: memory.open_threads || []
  }, null, 2)).join('\n\n');
}

function formatSourceExcerpts(excerpts) {
  if (!excerpts.length) return '无';

  return excerpts.map((item) => `第${item.chapterNumber}章：${item.excerpt}`).join('\n');
}

function startProgressLog(label, signal) {
  const start = Date.now();
  const timer = setInterval(() => {
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`[AI] ${label} 生成中... 已等待 ${elapsed}s`);
  }, 5000);
  signal?.addEventListener('abort', () => clearInterval(timer), { once: true });
  return () => clearInterval(timer);
}

function getAIClient(config, signal) {
  return {
    generate: async (prompt) => {
      console.log('[AI] 开始调用 glm-5 (review)');
      const stop = startProgressLog('glm-5 (review)', signal);
      try {
        const response = await fetch(config.zhipuApiUrl, {
          method: 'POST',
          signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.zhipuApiKey}`
          },
          body: JSON.stringify({
            model: 'glm-5',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 12000
          })
        });

        if (!response.ok) {
          throw new Error(`智谱AI API错误: ${response.status}`);
        }

        const data = await response.json();
        console.log('[AI] glm-5 (review) 返回完成', data.choices[0].message.content);
        return data.choices[0].message.content;
      } finally {
        stop();
      }
    }
  };
}

module.exports = {
  review,
  buildReviewPrompt,
  parseReviewResult
};
