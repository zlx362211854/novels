const { Novel, Architecture, Chapter, SystemConfig, PromptTemplate } = require('../models/sequelize');

async function generateChapter(params, signal) {
  const { novel, chapter, architecture, templateId } = params;

  const config = await getConfig();
  const template = await getTemplate(templateId);

  const prompt = buildPrompt(template, { novel, chapter, architecture });

  const aiClient = getAIClient(config, signal);

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw Object.assign(new Error('请求已取消'), { name: 'AbortError' });
    try {
      const content = await aiClient.generate(prompt);
      return content;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('[abort] AI fetch 已中止 (generateChapter)');
        throw error;
      }
      lastError = error;
      console.error(`AI生成失败，第${attempt + 1}次重试:`, error.message);
      if (attempt < 2) {
        await sleep(60000, signal);
      }
    }
  }

  throw new Error(`AI生成失败: ${lastError.message}`);
}

async function generateChapterFromArchitecture(params, signal) {
  console.log('=== generateChapterFromArchitecture 开始执行 ===');
  const { novelId, chapterArchId } = params;
  console.log('参数:', { novelId, chapterArchId });

  const novel = await Novel.findByPk(novelId);
  if (!novel) throw new Error('小说不存在');
  console.log('小说:', novel.title);

  const chapterArch = await Architecture.findByPk(chapterArchId);
  if (!chapterArch) throw new Error('章架构不存在');
  console.log('章节架构:', chapterArch.title);

  const fullArch = await Architecture.findOne({
    where: { novel_id: novelId, level: 'full' }
  });

  const volumeArch = chapterArch.parent_id ? await Architecture.findByPk(chapterArch.parent_id) : null;

  const prevChapterContent = await getPreviousChapterContent(chapterArchId, chapterArch.parent_id);

  const prompt = buildChapterPrompt(novel, chapterArch, volumeArch, fullArch, prevChapterContent);

  const config = await getConfig();
  console.log('config.aiModel:', config.aiModel);
  const aiClient = getAIClient(config, signal);

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw Object.assign(new Error('请求已取消'), { name: 'AbortError' });
    try {
      const content = await aiClient.generate(prompt);
      return content;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      lastError = error;
      console.error(`AI生成章节失败，第${attempt + 1}次重试:`, error.message);
      if (attempt < 2) {
        await sleep(60000, signal);
      }
    }
  }

  throw new Error(`AI生成失败: ${lastError.message}`);
}

async function getPreviousChapterContent(currentArchId, parentId) {
  if (!parentId) return null;

  const prevArch = await Architecture.findOne({
    where: { parent_id: parentId, level: 'chapter' },
    order: [['id', 'DESC']]
  });

  if (!prevArch || prevArch.id >= currentArchId) {
    const alternatives = await Architecture.findAll({
      where: { parent_id: parentId, level: 'chapter' },
      order: [['id', 'DESC']]
    });
    if (alternatives.length > 0) {
      const targetId = alternatives[0].id;
      if (targetId < currentArchId) {
        return await getChapterByArchitectureId(targetId);
      }
    }
    return null;
  }

  return await getChapterByArchitectureId(prevArch.id);
}

async function getChapterByArchitectureId(archId) {
  const prevChapter = await Chapter.findOne({
    where: { architecture_id: archId }
  });

  if (!prevChapter || !prevChapter.content) return null;

  const content = prevChapter.content;
  const lastPart = content.length > 800 ? content.slice(-800) : content;

  return {
    title: prevChapter.title,
    endingContent: lastPart
  };
}

function buildChapterPrompt(novel, chapterArch, volumeArch, fullArch, prevChapterContent) {
  let context = `## 小说信息
标题：${novel.title}
类型：${novel.genre || '未指定'}
`;

  if (fullArch && fullArch.plot_outline) {
    context += `\n## 全本架构\n${fullArch.plot_outline}\n`;
  }

  if (volumeArch) {
    context += `\n## 卷架构：${volumeArch.title}\n`;
    if (volumeArch.plot_outline) context += `${volumeArch.plot_outline}\n`;
    if (volumeArch.characters) {
      try {
        const chars = JSON.parse(volumeArch.characters);
        context += `人物设定：${JSON.stringify(chars, null, 2)}\n`;
      } catch {
        context += `人物设定：${volumeArch.characters}\n`;
      }
    }
  }

  let prevChapterInfo = '';
  if (prevChapterContent) {
    prevChapterInfo = `
## 上一章结尾（参考）
章节：${prevChapterContent.title}
---
${prevChapterContent.endingContent}
---
**衔接说明：**
- 如果上一章结尾是动作/对话/场景的中断点（如：走进房间、战斗中、对话进行中），本章开头需要严格衔接，保持空间、时间、人物状态的连续性
- 如果上一章结尾是情节的自然收束（如：事件结束、场景转换提示），本章可以根据架构内容概括灵活安排时间跳跃或场景切换
- 请根据上一章结尾的具体内容和本章架构的内容概括，自行判断是否需要严格衔接
`;
  }

  let chapterInfo = `## 本章架构
标题：${chapterArch.title}`;
  if (chapterArch.plot_outline) {
    chapterInfo += `\n内容概括：${chapterArch.plot_outline}`;
  }

  return `你是一位专业的网络小说作家。请根据以下架构信息，撰写章节正文。

${context}

${prevChapterInfo}

${chapterInfo}

## 写作要求
1. 字数要求：4500-5500字，内容要充实丰富
2. 严格根据本章架构的内容概括展开描写，不得超出架构范围
3. 注意情节的连贯性和节奏感
4. 人物对话要符合性格特点
5. 场景描写要生动具体
6. ${prevChapterContent ? '根据上一章结尾情况，灵活处理章节衔接（参考衔接说明）' : '注意故事的开篇吸引力'}
7. 只输出正文内容，不要标题、章节号等

## 内容丰富度要求
1. **内心活动**：深入描写人物的心理变化、情感波动、思想斗争，让读者理解人物的动机
2. **对话互动**：增加人物之间的对话，通过对话展现性格、推进情节、制造冲突
3. **情绪冲突**：设置人物之间的矛盾、误解、争执，或人物内心的挣扎与抉择
4. **支线故事**：在不偏离主线的前提下，适当展开配角的故事、背景交代、环境描写
5. **细节描写**：对动作、表情、环境、物品等进行细致刻画，增强画面感
6. **节奏变化**：张弛有度，有紧张的高潮，也有舒缓的过渡，避免流水账式叙述
7. **感官体验**：调动视觉、听觉、嗅觉、触觉等感官，让读者身临其境

## 严格禁止（防止内容越界）
1. **禁止写入本章架构未提及的人物**：如果某人物在本章架构中没有出现，绝对不能在本章提及或描写
2. **禁止写入本章架构未提及的事件**：只能写本章内容概括中明确提到的情节，不得"预告"或"暗示"后续章节的内容
3. **禁止人物"预知"未来**：主角不能想起、梦到、预感本章架构中未发生的事情
4. **禁止引用未发生的对话**：不能让人物回忆或提及本章架构中未出现的对话内容
5. **禁止"伏笔"式越界**：不要在本章埋下架构中未提及的伏笔或暗示

## 逻辑一致性要求（重要！）
1. **时间线必须自洽**：如果写"头七刚过"，那死亡时间必须是7天前；如果写"三日前染病"，就不能同时说"头七已过"。所有时间表述必须能互相印证，不能矛盾
2. **因果关系要清晰**：事件的发生必须有合理的前因后果，不能无缘无故出现
3. **数字要一致**：同一个人、同一件事，前后描述的数字（年龄、天数、人数等）必须一致
4. **人物状态要连贯**：如果上一段说人物"躺在床上动弹不得"，下一段就不能写他"跳起来冲出门"
5. **场景要连贯**：人物在A地点，不能突然出现在B地点，必须有移动的过程
6. **检查每一句话**：写完后自我检查：这句话和前文矛盾吗？时间对得上吗？逻辑通顺吗？

## 禁止事项（避免AI痕迹）
1. 禁止使用带标号的列举（如"1. xxx 2. xxx"或"第一、第二"等），用自然叙述代替
2. 禁止使用"首先、其次、然后、最后"等程式化连接词
3. 禁止使用"总的来说、综上所述、总而言之"等总结性开头
4. 禁止使用"值得注意的是、需要强调的是"等说教式表达
5. 禁止使用"让我们、我们一起"等与读者对话的口吻
6. 禁止过度使用"仿佛、似乎、好像"等模糊词汇
7. 禁止使用"这一刻、就在这时、突然之间"等刻意制造悬念的表达
8. 禁止每段都用"他知道、他明白、他意识到"开头
9. 禁止使用"心中暗想、心中默念、心中感叹"等重复的心理描写句式

## 写作风格建议
- 用动作和细节展现人物情绪，而非直接描述
- 对话要口语化、有个性，避免书面腔
- 场景转换要自然，用环境或动作过渡
- 适当留白，不要把所有细节都写满
- 节奏要有张有弛，不要全程紧绷或松散

请开始撰写本章正文：`;
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
    aiModel: configMap.aiModel || process.env.DEFAULT_AI_MODEL || 'deepseek',
    zhipuApiKey: configMap.zhipuApiKey || process.env.ZHIPU_API_KEY,
    zhipuApiUrl: process.env.ZHIPU_API_URL,
    deepseekApiKey: configMap.deepseekApiKey || process.env.DEEPSEEK_API_KEY,
    deepseekApiUrl: process.env.DEEPSEEK_API_URL
  };
}

async function getTemplate(templateId) {
  if (templateId) {
    return await PromptTemplate.findByPk(templateId);
  }

  return await PromptTemplate.findOne({ where: { is_default: 1 } });
}

function buildPrompt(template, params) {
  const { novel, chapter, architecture } = params;

  let prompt = template.template;

  prompt = prompt.replace(/\{\{novel_title\}\}/g, novel.title || '');
  prompt = prompt.replace(/\{\{genre\}\}/g, novel.genre || '');
  prompt = prompt.replace(/\{\{chapter_title\}\}/g, chapter.title || '');
  prompt = prompt.replace(/\{\{chapter_number\}\}/g, chapter.chapter_number || '');
  prompt = prompt.replace(/\{\{emotional_tone\}\}/g, architecture?.emotional_tone || '');

  let archInfo = '';
  if (architecture) {
    archInfo = `层级: ${architecture.level}\n`;
    archInfo += `标题: ${architecture.title}\n`;
    if (architecture.plot_outline) archInfo += `情节大纲: ${architecture.plot_outline}\n`;
    if (architecture.characters) {
      try {
        const chars = JSON.parse(architecture.characters);
        archInfo += `人物设定: ${JSON.stringify(chars, null, 2)}\n`;
      } catch {
        archInfo += `人物设定: ${architecture.characters}\n`;
      }
    }
    if (architecture.world_setting) {
      try {
        const world = JSON.parse(architecture.world_setting);
        archInfo += `世界观: ${JSON.stringify(world, null, 2)}\n`;
      } catch {
        archInfo += `世界观: ${architecture.world_setting}\n`;
      }
    }
  }
  prompt = prompt.replace(/\{\{architecture_info\}\}/g, archInfo);

  return prompt;
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

function getAIClient(config, signal, options = {}) {
  const maxTokens = options.maxTokens || 8000;
  if (config.aiModel === 'deepseek') {
    return {
      generate: async (prompt) => {
        console.log(`[AI] 开始调用 deepseek-chat (max_tokens: ${maxTokens})`);
        const stop = startProgressLog('deepseek-chat', signal);
        try {
          const body = {
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.8,
            max_tokens: maxTokens
          };
          if (options.jsonMode) {
            body.response_format = { type: 'json_object' };
          }
          const response = await fetch(config.deepseekApiUrl, {
            method: 'POST',
            signal,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.deepseekApiKey}`
            },
            body: JSON.stringify(body)
          });

          if (!response.ok) {
            throw new Error(`DeepSeek API错误: ${response.status}`);
          }

          const data = await response.json();
          const finishReason = data.choices[0].finish_reason;
          console.log(`[AI] deepseek-chat 返回完成 (finish_reason: ${finishReason})`);
          if (finishReason === 'length') {
            throw new Error('AI 输出被截断（max_tokens 不足），请减少内容量或增大 max_tokens');
          }
          return data.choices[0].message.content;
        } finally {
          stop();
        }
      }
    };
  }

  if (config.aiModel === 'deepseek-reasoner') {
    return {
      generate: async (prompt) => {
        console.log(`[AI] 开始调用 deepseek-reasoner (max_tokens: ${maxTokens})`);
        const stop = startProgressLog('deepseek-reasoner', signal);
        try {
          const body = {
            model: 'deepseek-reasoner',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens
          };
          const response = await fetch(config.deepseekApiUrl, {
            method: 'POST',
            signal,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.deepseekApiKey}`
            },
            body: JSON.stringify(body)
          });

          if (!response.ok) {
            const errBody = await response.text().catch(() => '');
            console.error(`DeepSeek Reasoner API错误响应:`, errBody);
            throw new Error(`DeepSeek Reasoner API错误: ${response.status} ${errBody}`);
          }

          const data = await response.json();
          const finishReason = data.choices[0].finish_reason;
          console.log(`[AI] deepseek-reasoner 返回完成 (finish_reason: ${finishReason})`);
          if (finishReason === 'length') {
            throw new Error('AI 输出被截断（max_tokens 不足），请减少内容量或增大 max_tokens');
          }
          return data.choices[0].message.content;
        } finally {
          stop();
        }
      }
    };
  }

  const zhipuModel = options.model || 'glm-4-long';
  return {
    generate: async (prompt) => {
      console.log(`[AI] 开始调用 ${zhipuModel} (max_tokens: ${maxTokens})`);
      const stop = startProgressLog(zhipuModel, signal);
      try {
        const response = await fetch(config.zhipuApiUrl, {
          method: 'POST',
          signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.zhipuApiKey}`
          },
          body: JSON.stringify({
            model: zhipuModel,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.8,
            max_tokens: maxTokens
          })
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          console.error(`智谱AI API错误响应:`, errBody);
          throw new Error(`智谱AI API错误: ${response.status} ${errBody}`);
        }

        const data = await response.json();
        const finishReason = data.choices[0].finish_reason;
        console.log(`[AI] ${zhipuModel} 返回完成 (finish_reason: ${finishReason})`);
        if (finishReason === 'length') {
          throw new Error('AI 输出被截断（max_tokens 不足），请减少内容量或增大 max_tokens');
        }
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
  generateChapter,
  generateChapterFromArchitecture,
  getConfig,
  getAIClient,
  sleep
};
