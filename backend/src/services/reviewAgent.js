const { SystemConfig } = require('../models/sequelize');
const aiService = require('./aiService');

async function review(params, signal) {
  const { chapter, novel, architecture } = params;

  const config = await getConfig();

  const reviewPrompt = buildReviewPrompt(chapter, novel, architecture, config);

  const aiClient = getAIClient(config, signal);

  try {
    const reviewResult = await aiClient.generate(reviewPrompt);
    return parseReviewResult(reviewResult);
  } catch (error) {
    console.error('审核失败:', error.message);
    return {
      score: 0,
      issues: [{
        type: 'review_error',
        description: '审核服务异常',
        location: '系统',
        suggestion: error.message
      }]
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

function buildReviewPrompt(chapter, novel, architecture, config) {
  const strictnessGuide = config.reviewStrictness === 'strict'
    ? '请严格审核，任何不一致都需要指出'
    : '请宽松审核，只指出明显的不一致问题';

  return `你是一位专业的小说编辑，请审核以下章节内容与设定的 consistency。

## 小说基本信息
标题：${novel.title}
类型：${novel.genre || '未指定'}

## 架构设定
${formatArchitecture(architecture)}

## 待审核章节
标题：${chapter.title || '未命名'}
序号：${chapter.chapter_number}

内容：
${chapter.content}

## 审核要求
${strictnessGuide}

请从以下维度进行审核：
1. 人物一致性：人物性格、行为、对话是否符合设定
2. 情节一致性：情节发展是否符合大纲规划
3. 世界观一致性：场景、设定是否符合世界观
4. 情感基调：情感表达是否符合预期基调

请以JSON格式返回审核结果：
{
  "score": <0-100的评分>,
  "issues": [
    {
      "type": "<问题类型>",
      "description": "<问题描述>",
      "location": "<问题位置>",
      "suggestion": "<修改建议>"
    }
  ]
}`;
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

function parseReviewResult(result) {
  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('解析审核结果失败:', error.message);
  }

  return {
    score: 50,
    issues: [{
      type: 'parse_error',
      description: '无法解析审核结果',
      location: '系统',
      suggestion: '请手动检查内容'
    }]
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
  if (config.aiModel === 'deepseek') {
    return {
      generate: async (prompt) => {
        console.log('[AI] 开始调用 deepseek-chat (review)');
        const stop = startProgressLog('deepseek-chat (review)', signal);
        try {
          const response = await fetch(config.deepseekApiUrl, {
            method: 'POST',
            signal,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.deepseekApiKey}`
            },
            body: JSON.stringify({
              model: 'deepseek-chat',
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.3,
              max_tokens: 2000
            })
          });

          if (!response.ok) {
            throw new Error(`DeepSeek API错误: ${response.status}`);
          }

          const data = await response.json();
          console.log('[AI] deepseek-chat (review) 返回完成');
          return data.choices[0].message.content;
        } finally {
          stop();
        }
      }
    };
  }

  return {
    generate: async (prompt) => {
      console.log('[AI] 开始调用 glm-4 (review)');
      const stop = startProgressLog('glm-4 (review)', signal);
      try {
        const response = await fetch(config.zhipuApiUrl, {
          method: 'POST',
          signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.zhipuApiKey}`
          },
          body: JSON.stringify({
            model: 'glm-4',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 2000
          })
        });

        if (!response.ok) {
          throw new Error(`智谱AI API错误: ${response.status}`);
        }

        const data = await response.json();
        console.log('[AI] glm-4 (review) 返回完成');
        return data.choices[0].message.content;
      } finally {
        stop();
      }
    }
  };
}

module.exports = {
  review
};
