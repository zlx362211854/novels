const { SystemConfig } = require('../models/sequelize');

async function getConfig() {
  const configs = await SystemConfig.findAll();
  const configMap = {};

  configs.forEach((config) => {
    try {
      configMap[config.config_key] = JSON.parse(config.config_value);
    } catch {
      configMap[config.config_key] = config.config_value;
    }
  });

  return {
    aiModel: configMap.aiModel || process.env.DEFAULT_AI_MODEL || 'zhipu',
    zhipuApiKey: configMap.zhipuApiKey || process.env.ZHIPU_API_KEY,
    zhipuApiUrl: process.env.ZHIPU_API_URL,
    deepseekApiKey: configMap.deepseekApiKey || process.env.DEEPSEEK_API_KEY,
    deepseekApiUrl: process.env.DEEPSEEK_API_URL
  };
}

function buildRevisionPrompt(chapter, novel, architecture, reviewResult, reviewContext = {}) {
  return `你是一位资深小说修订编辑。请根据审阅结果，生成一版“修订建议稿”。

## 小说信息
标题：${novel.title}
类型：${novel.genre || '未指定'}

## 当前章节
标题：${chapter.title || '未命名'}
序号：${chapter.chapter_number}

正文：
${chapter.content || ''}

## 当前章节记忆卡
${formatJson(reviewContext.currentMemory || {})}

## 历史相关记忆
${formatJson(reviewContext.relevantMemories || [])}

## 历史原文证据
${formatJson(reviewContext.sourceExcerpts || [])}

## 架构信息（仅辅助参考；若与历史正文冲突，以历史正文为准）
${formatArchitecture(architecture)}

## 审阅结果
${formatJson(reviewResult)}

修订规则：
1. 只修复 issues 里列出的问题
2. 尽量保留没有问题的段落、节奏和措辞
3. 不要新增新人物、新设定、新事件
4. 不要提前剧透后续章节
5. 如果证据不足，采用最保守的改法
6. 输出完整章节正文，不要输出解释性废话

请按下面格式返回：
{
  "summary": "本次修订主要处理了什么",
  "appliedIssues": [
    {
      "type": "问题类型",
      "description": "问题描述"
    }
  ]
}
<<<REVISED_CONTENT>>>
修订后的完整章节正文
<<<END_REVISED_CONTENT>>>

要求：
1. JSON 部分不要包含 revisedContent 字段
2. 正文只放在 <<<REVISED_CONTENT>>> 和 <<<END_REVISED_CONTENT>>> 之间
3. 不要输出额外说明`;
}

function formatArchitecture(architecture) {
  if (!architecture) return '无架构设定';

  let info = `层级: ${architecture.level}\n标题: ${architecture.title}\n`;
  if (architecture.plot_outline) info += `情节大纲: ${architecture.plot_outline}\n`;
  if (architecture.characters) info += `人物设定: ${architecture.characters}\n`;
  if (architecture.world_setting) info += `世界观: ${architecture.world_setting}\n`;
  if (architecture.emotional_tone) info += `情感基调: ${architecture.emotional_tone}\n`;
  return info;
}

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function parseRevisionResult(result) {
  const taggedContent = extractTaggedContent(result);
  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const trailingContent = extractTrailingContent(result, jsonMatch[0]);
      return {
        summary: parsed.summary || '无法解析修订建议稿',
        appliedIssues: Array.isArray(parsed.appliedIssues) ? parsed.appliedIssues : [],
        revisedContent: sanitizeRevisionContent(parsed.revisedContent || taggedContent || trailingContent || '')
      };
    }
  } catch (error) {
    console.error('解析修订建议稿失败:', error.message);
  }

  return {
    summary: '无法解析修订建议稿',
    appliedIssues: [],
    revisedContent: sanitizeRevisionContent(taggedContent || extractTrailingContent(result, '') || '')
  };
}

function extractTaggedContent(result) {
  const match = result.match(/<<<REVISED_CONTENT>>>\s*([\s\S]*?)\s*<<<END_REVISED_CONTENT>>>/);
  return match ? match[1].trim() : '';
}

function extractTrailingContent(result, jsonBlock) {
  const trailing = result.replace(jsonBlock, '').trim();
  if (!trailing) return '';

  const fencedMatch = trailing.match(/```(?:markdown|md|text)?\s*([\s\S]*?)```/);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  return trailing;
}

function sanitizeRevisionContent(content) {
  return (content || '')
    .replace(/<<<REVISED_CONTENT>>>/g, '')
    .replace(/<<<END_REVISED_CONTENT>>>/g, '')
    .trim();
}

function validateRevisionResult(parsed, originalContent) {
  const content = sanitizeRevisionContent(parsed.revisedContent || '');
  if (!content) {
    throw new Error('模型未返回修订正文，请重试');
  }

  const originalLength = (originalContent || '').trim().length;
  if (originalLength > 100 && content.length < Math.floor(originalLength * 0.6)) {
    throw new Error('修订结果疑似被截断，请重试');
  }

  return {
    ...parsed,
    revisedContent: content
  };
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
      const stop = startProgressLog('glm-5 (chapter-revision)', signal);
      try {
        const response = await fetch(config.zhipuApiUrl, {
          method: 'POST',
          signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.zhipuApiKey}`
          },
          body: JSON.stringify({
            model: 'glm-5',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,
            max_tokens: 12000
          })
        });

        if (!response.ok) {
          throw new Error(`智谱AI API错误: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
      } finally {
        stop();
      }
    }
  };
}

async function revise(params, signal) {
  const {
    chapter,
    novel,
    architecture,
    reviewResult,
    currentMemory,
    relevantMemories,
    sourceExcerpts
  } = params;
  const config = await getConfig();
  const aiClient = getAIClient(config, signal);
  const prompt = buildRevisionPrompt(
    chapter,
    novel,
    architecture,
    reviewResult,
    { currentMemory, relevantMemories, sourceExcerpts }
  );
  const response = await aiClient.generate(prompt);
  const parsed = parseRevisionResult(response);
  return validateRevisionResult(parsed, chapter.content || '');
}

module.exports = {
  revise,
  buildRevisionPrompt,
  parseRevisionResult,
  validateRevisionResult
};
