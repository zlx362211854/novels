const { Novel, Architecture, SystemConfig } = require('../models/sequelize');

async function generateArchitecture(params, signal) {
  const { novelId, level, parentId, title } = params;

  const novel = await Novel.findByPk(novelId);
  if (!novel) throw new Error('小说不存在');

  let parentContext = '';
  if (parentId) {
    const parent = await Architecture.findByPk(parentId);
    if (parent) {
      parentContext = `
## 父级架构信息
层级: ${parent.level}
标题: ${parent.title}
${parent.plot_outline ? `情节大纲: ${parent.plot_outline}` : ''}
${parent.characters ? `人物设定: ${parent.characters}` : ''}
${parent.world_setting ? `世界观: ${parent.world_setting}` : ''}
`;
    }
  }

  const prompt = buildPrompt(novel, level, title, parentContext);

  const config = await getConfig();
  const aiClient = getAIClient(config, signal);

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw Object.assign(new Error('请求已取消'), { name: 'AbortError' });
    try {
      const content = await aiClient.generate(prompt);
      return parseResult(content);
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      lastError = error;
      console.error(`AI生成架构失败，第${attempt + 1}次重试:`, error.message);
      if (attempt < 2) {
        await sleep(60000, signal);
      }
    }
  }

  throw new Error(`AI生成失败: ${lastError.message}`);
}

async function generateChapterArchitectures(params, signal) {
  const { novelId, volumeId } = params;

  const novel = await Novel.findByPk(novelId);
  if (!novel) throw new Error('小说不存在');

  const volume = await Architecture.findByPk(volumeId);
  if (!volume) throw new Error('卷架构不存在');

  const fullArch = await Architecture.findOne({
    where: { novel_id: novelId, level: 'full' }
  });

  const prompt = buildChapterBatchPrompt(novel, volume, fullArch);

  const config = await getConfig();
  const aiClient = getAIClient(config, signal);

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw Object.assign(new Error('请求已取消'), { name: 'AbortError' });
    try {
      const content = await aiClient.generate(prompt);
      const chapters = parseChapterResult(content);
      return chapters;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      lastError = error;
      console.error(`AI生成章架构失败，第${attempt + 1}次重试:`, error.message);
      if (attempt < 2) {
        await sleep(60000, signal);
      }
    }
  }

  throw new Error(`AI生成失败: ${lastError.message}`);
}

function buildPrompt(novel, level, title, parentContext) {
  const levelDesc = {
    full: '全本架构（整部小说的整体规划）',
    volume: '卷架构（小说中某一卷的规划）',
    chapter: '章架构（单个章节的详细规划）'
  };

  return `你是一位专业的网络小说策划师。请为以下小说生成${levelDesc[level]}的内容。

## 小说基本信息
标题：${novel.title}
类型：${novel.genre || '未指定'}
简介：${novel.description || '未提供'}
${parentContext}

## 当前架构
层级：${levelDesc[level]}
标题：${title || '待定'}

## 生成要求
请以JSON格式返回以下内容：
{
  "plotOutline": "情节大纲（${level === 'chapter' ? '500-1000字' : '1000-2000字'}的详细情节描述）",
  "characters": {
    "主角": {
      "name": "姓名",
      "personality": "性格特点",
      "background": "背景故事",
      "goals": "目标动机"
    }
  },
  "worldSetting": {
    "era": "时代背景",
    "location": "主要地点",
    "rules": "世界规则/设定",
    "specialElements": "特殊元素"
  },
  "emotionalTone": "情感基调（如：热血、温馨、悬疑、虐心等）"
}

注意：
1. 情节大纲要具体、有冲突、有转折
2. 人物设定要丰满、有深度
3. 世界观要自洽、有特色
4. 只返回JSON，不要其他内容`;
}

function buildChapterBatchPrompt(novel, volume, fullArch) {
  let fullContext = '';
  if (fullArch) {
    fullContext = `
## 全本架构
${fullArch.plot_outline || ''}
`;
  }

  return `你是一位专业的网络小说策划师。请根据以下卷架构，为每一章生成简短的章节架构。

## 小说基本信息
标题：${novel.title}
类型：${novel.genre || '未指定'}
${fullContext}

## 卷架构
标题：${volume.title}
情节大纲：
${volume.plot_outline || '未提供'}

${volume.characters ? `人物设定：${volume.characters}` : ''}
${volume.world_setting ? `世界观：${volume.world_setting}` : ''}

## 生成要求
请为该卷的每一章生成简短的章节架构，每章只需2-3句话概括主要内容。

以JSON数组格式返回：
[
  {
    "chapterNumber": 1,
    "title": "章节标题",
    "plotOutline": "本章主要内容概括（2-3句话，描述故事主线即可）"
  },
  ...
]

注意：
1. 章节标题要吸引人，体现本章核心冲突或转折
2. plotOutline只需简短概括，不要展开细节
3. 确保章节之间有连贯性和递进关系
4. 只返回JSON数组，不要其他内容`;
}

function parseResult(content) {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        plotOutline: result.plotOutline || '',
        characters: result.characters || {},
        worldSetting: result.worldSetting || {},
        emotionalTone: result.emotionalTone || ''
      };
    }
  } catch (error) {
    console.error('解析AI结果失败:', error.message);
  }

  return {
    plotOutline: '',
    characters: {},
    worldSetting: {},
    emotionalTone: ''
  };
}

function parseChapterResult(content) {
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return result.map(ch => ({
        chapterNumber: ch.chapterNumber,
        title: ch.title || `第${ch.chapterNumber}章`,
        plotOutline: ch.plotOutline || ''
      }));
    }
  } catch (error) {
    console.error('解析章架构结果失败:', error.message);
  }

  return [];
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
    deepseekApiUrl: process.env.DEEPSEEK_API_URL
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
        console.log('[AI] 开始调用 deepseek-chat');
        const stop = startProgressLog('deepseek-chat', signal);
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
              temperature: 0.8,
              max_tokens: 8000
            })
          });

          if (!response.ok) {
            throw new Error(`DeepSeek API错误: ${response.status}`);
          }

          const data = await response.json();
          console.log('[AI] deepseek-chat 返回完成');
          return data.choices[0].message.content;
        } finally {
          stop();
        }
      }
    };
  }

  return {
    generate: async (prompt) => {
      console.log('[AI] 开始调用 glm-4');
      const stop = startProgressLog('glm-4', signal);
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
            temperature: 0.8,
            max_tokens: 8000
          })
        });

        if (!response.ok) {
          throw new Error(`智谱AI API错误: ${response.status}`);
        }

        const data = await response.json();
        console.log('[AI] glm-4 返回完成');
        return data.choices[0].message.content;
      } finally {
        stop();
      }
    }
  };
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Object.assign(new Error('请求已取消'), { name: 'AbortError' }));
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(Object.assign(new Error('请求已取消'), { name: 'AbortError' }));
      }, { once: true });
    }
  });
}

module.exports = {
  generateArchitecture,
  generateChapterArchitectures
};
