const { Novel, Architecture, SystemConfig } = require('../models/sequelize');
const { getAIClient, sleep } = require('./aiService');

function extractJson(content) {
    if (!content || typeof content !== 'string') {
        throw new Error('内容为空或格式不正确');
    }

    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
        try {
            return JSON.parse(codeBlockMatch[1].trim());
        } catch (e) {
            console.log('代码块解析失败，尝试其他方法');
        }
    }

    let startIdx = -1;
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < content.length; i++) {
        const char = content[i];

        if (escapeNext) {
            escapeNext = false;
            continue;
        }

        if (char === '\\') {
            escapeNext = true;
            continue;
        }

        if (char === '"' && !inString) {
            inString = true;
            if (startIdx === -1) startIdx = i;
        } else if (char === '"' && inString) {
            inString = false;
        }

        if (!inString) {
            if (char === '{') {
                if (braceCount === 0) startIdx = i;
                braceCount++;
            } else if (char === '}') {
                braceCount--;
                if (braceCount === 0 && startIdx !== -1) {
                    try {
                        const jsonStr = content.substring(startIdx, i + 1);
                        return JSON.parse(jsonStr);
                    } catch (e) {
                        startIdx = -1;
                    }
                }
            }
        }
    }

    try {
        return JSON.parse(content.trim());
    } catch (e) {
        console.error('JSON 解析失败，原始内容最后100字符:', content.substring(content.length - 100));
        throw new Error('无法从 AI 响应中提取有效的 JSON');
    }
}

function buildReviewPrompt(novel, architectures) {
    const fullArch = architectures.find(a => a.level === 'full');
    const volumes = architectures.filter(a => a.level === 'volume').sort((a, b) => a.id - b.id);
    const chapters = architectures.filter(a => a.level === 'chapter').sort((a, b) => a.id - b.id);

    let prompt = `你是一位资深小说编辑和文学评论家。请审阅以下小说的完整架构，指出不合理之处并提供改进建议。

## 小说基本信息
标题：${novel.title}
类型：${novel.genre || '未指定'}
简介：${novel.description || '无'}

`;

    if (fullArch) {
        prompt += `## 全本架构（总纲）
标题：${fullArch.title}
情节大纲：${fullArch.plot_outline || '无'}
人物设定：${fullArch.characters || '无'}
世界观：${fullArch.world_setting || '无'}
情感基调：${fullArch.emotional_tone || '无'}

`;
    }

    if (volumes.length > 0) {
        prompt += `## 卷架构（共${volumes.length}卷）\n\n`;
        volumes.forEach((vol, idx) => {
            prompt += `### 第${idx + 1}卷：${vol.title}
情节大纲：${vol.plot_outline || '无'}
人物设定：${vol.characters || '无'}
世界观：${vol.world_setting || '无'}
情感基调：${vol.emotional_tone || '无'}

`;
        });
    }

    if (chapters.length > 0) {
        prompt += `## 章架构（共${chapters.length}章）\n\n`;

        const chaptersByVolume = {};
        chapters.forEach(ch => {
            const volId = ch.parent_id || 'none';
            if (!chaptersByVolume[volId]) chaptersByVolume[volId] = [];
            chaptersByVolume[volId].push(ch);
        });

        Object.entries(chaptersByVolume).forEach(([volId, volChapters]) => {
            const volume = volumes.find(v => v.id === parseInt(volId));
            if (volume) {
                prompt += `### ${volume.title} 下的章节\n`;
            }
            volChapters.forEach((ch, idx) => {
                prompt += `${idx + 1}. ${ch.title}\n   情节概要：${ch.plot_outline || '无'}\n`;
            });
            prompt += '\n';
        });
    }

    prompt += `
## 审阅要求
请从以下几个维度进行审阅：
1. **整体结构**：全本架构是否完整，情节主线是否清晰
2. **卷间平衡**：各卷的篇幅、节奏是否均衡，高潮分布是否合理
3. **章节连贯性**：章节之间的衔接是否流畅，是否存在逻辑断层
4. **人物发展**：人物弧光是否完整，成长轨迹是否合理
5. **世界观一致性**：设定是否自洽，是否存在矛盾
6. **情感节奏**：情感起伏是否符合叙事需要

## 输出格式
请以JSON格式返回审阅结果：
{
  "overallAssessment": "整体评价（200字以内）",
  "issues": [
    {
      "type": "structure|plot|character|world|pacing|other",
      "severity": "high|medium|low",
      "location": "具体位置（如：第3卷第15章）",
      "description": "问题描述",
      "suggestion": "改进建议"
    }
  ],
  "improvementSuggestions": "整体改进建议（300字以内）"
}

请确保JSON格式正确，不要包含任何其他内容。`;

    console.log(prompt);
    return prompt;
}

function buildFullArchRewritePrompt(novel, fullArch, volumes, reviewResult, userPrompt) {
    let prompt = `你是一位资深小说编辑。请根据审阅意见${userPrompt ? '和用户的额外要求' : ''}，优化重写小说的全本架构和各卷架构。

## 小说基本信息
标题：${novel.title}
类型：${novel.genre || '未指定'}
简介：${novel.description || '无'}

## 审阅意见
整体评价：${reviewResult.overallAssessment}

发现的问题：
`;

    reviewResult.issues.forEach((issue, idx) => {
        prompt += `${idx + 1}. [${issue.severity}] ${issue.location || '整体'} - ${issue.description}\n   建议：${issue.suggestion}\n`;
    });

    prompt += `\n整体改进建议：${reviewResult.improvementSuggestions}\n`;

    if (userPrompt) {
        prompt += `\n## 用户的额外要求\n${userPrompt}\n`;
    }

    prompt += `\n## 当前全本架构\n`;
    if (fullArch) {
        prompt += `标题：${fullArch.title}\n大纲：${fullArch.plot_outline || '无'}\n人物设定：${fullArch.characters || '无'}\n世界观：${fullArch.world_setting || '无'}\n情感基调：${fullArch.emotional_tone || '无'}\n`;
    }

    if (volumes.length > 0) {
        prompt += `\n## 当前卷架构（共${volumes.length}卷）\n`;
        volumes.forEach((vol, idx) => {
            prompt += `${idx + 1}. [ID:${vol.id}] ${vol.title}\n   大纲：${vol.plot_outline || '无'}\n`;
        });
    }

    prompt += `
## 输出要求
请输出优化后的全本架构和各卷架构，格式如下：

{
  "fullArchitecture": {
    "title": "全本标题",
    "plotOutline": "情节大纲",
    "characters": "人物设定",
    "worldSetting": "世界观",
    "emotionalTone": "情感基调"
  },
  "volumes": [
    {
      "id": "原卷ID",
      "title": "卷标题",
      "plotOutline": "卷情节大纲",
      "characters": "卷人物设定",
      "worldSetting": "卷世界观",
      "emotionalTone": "情感基调"
    }
  ]
}

重要提示：
1. 保留原有的卷ID
2. 保持原有的卷的数量
3. 只返回JSON，不要包含其他说明文字`;

    return prompt;
}

function buildVolumeChaptersRewritePrompt(novel, fullArchResult, volume, chapters, reviewResult, userPrompt) {
    let prompt = `你是一位资深小说编辑。请根据审阅意见${userPrompt ? '和用户的额外要求' : ''}，优化重写本卷下的所有章节。

## 小说基本信息
标题：${novel.title}
类型：${novel.genre || '未指定'}

## 全本架构（已优化）
大纲：${fullArchResult.plotOutline}
人物设定：${fullArchResult.characters}

## 当前卷信息
卷标题：${volume.title}
卷大纲：${volume.plotOutline || volume.plot_outline || '无'}

## 审阅意见中与本卷相关的问题
`;

    const volumeIssues = reviewResult.issues.filter(issue => {
        const loc = (issue.location || '').toLowerCase();
        return loc.includes(volume.title) || loc === '整体';
    });

    if (volumeIssues.length > 0) {
        volumeIssues.forEach((issue, idx) => {
            prompt += `${idx + 1}. [${issue.severity}] ${issue.description}\n   建议：${issue.suggestion}\n`;
        });
    } else {
        prompt += `无特别针对本卷的问题。\n`;
    }

    prompt += `\n整体改进建议：${reviewResult.improvementSuggestions}\n`;

    if (userPrompt) {
        prompt += `\n## 用户的额外要求\n${userPrompt}\n`;
    }

    prompt += `\n## 本卷当前章节（共${chapters.length}章）\n`;
    chapters.forEach((ch, idx) => {
        prompt += `${idx + 1}. [ID:${ch.id}] ${ch.title}\n   情节概要：${ch.plot_outline || '无'}\n`;
    });

    prompt += `
## 输出要求
请输出优化后的本卷所有章节，格式如下：

{
  "chapters": [
    {
      "id": "原章ID",
      "title": "章标题",
      "plotOutline": "章情节概要"
    }
  ]
}

重要提示：
1. 如果原章节有ID，请保留原ID
2. 章的数量可以调整（增删合并均可）
3. 确保章节之间情节连贯
4. 只返回JSON，不要包含其他说明文字`;

    return prompt;
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

async function reviewArchitectures(novelId, signal) {
    const novel = await Novel.findByPk(novelId);
    if (!novel) throw new Error('小说不存在');

    const architectures = await Architecture.findAll({
        where: { novel_id: novelId }
    });

    if (architectures.length === 0) {
        throw new Error('该小说还没有任何架构');
    }

    const prompt = buildReviewPrompt(novel, architectures);
    const config = await getConfig();
    const aiClient = getAIClient(config, signal, { jsonMode: true });

    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        if (signal?.aborted) throw Object.assign(new Error('请求已取消'), { name: 'AbortError' });
        try {
            const content = await aiClient.generate(prompt);
            const reviewResult = extractJson(content);
            return reviewResult;
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            lastError = error;
            console.error(`架构审阅失败，第${attempt + 1}次重试:`, error.message);
            if (attempt < 2) {
                await sleep(60000, signal);
            }
        }
    }

    throw new Error(`架构审阅失败: ${lastError.message}`);
}

async function callAIWithRetry(aiClient, prompt, label, signal, maxRetries = 3) {
    let lastError = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        if (signal?.aborted) throw Object.assign(new Error('请求已取消'), { name: 'AbortError' });
        try {
            const content = await aiClient.generate(prompt);
            return extractJson(content);
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            lastError = error;
            console.error(`${label}失败，第${attempt + 1}次重试:`, error.message);
            if (attempt < maxRetries - 1) {
                await sleep(60000, signal);
            }
        }
    }
    throw new Error(`${label}失败: ${lastError.message}`);
}

async function rewriteArchitectures(novelId, reviewResult, userPrompt, signal) {
    const novel = await Novel.findByPk(novelId);
    if (!novel) throw new Error('小说不存在');

    const architectures = await Architecture.findAll({
        where: { novel_id: novelId }
    });

    const fullArch = architectures.find(a => a.level === 'full');
    const volumes = architectures.filter(a => a.level === 'volume').sort((a, b) => a.id - b.id);
    const chapters = architectures.filter(a => a.level === 'chapter').sort((a, b) => a.id - b.id);

    const config = await getConfig();
    const aiClient = getAIClient(config, signal, { jsonMode: true });

    console.log('[rewrite] 第1步：重写全本架构和卷架构...');
    const fullArchPrompt = buildFullArchRewritePrompt(novel, fullArch, volumes, reviewResult, userPrompt);
    const fullResult = await callAIWithRetry(aiClient, fullArchPrompt, '全本架构重写', signal);

    console.log(`[rewrite] 全本架构重写完成，共 ${fullResult.volumes?.length || 0} 卷`);

    const volumesWithChapters = [];

    for (let i = 0; i < (fullResult.volumes || []).length; i++) {
        if (signal?.aborted) throw Object.assign(new Error('请求已取消'), { name: 'AbortError' });

        const rewrittenVolume = fullResult.volumes[i];
        const originalVolume = volumes.find(v => String(v.id) === String(rewrittenVolume.id));
        const volumeChapters = originalVolume
            ? chapters.filter(ch => ch.parent_id === originalVolume.id)
            : [];

        if (volumeChapters.length === 0) {
            console.log(`[rewrite] 第${i + 1}卷「${rewrittenVolume.title}」无章节，跳过`);
            volumesWithChapters.push({ ...rewrittenVolume, chapters: [] });
            continue;
        }

        console.log(`[rewrite] 第2步(${i + 1}/${fullResult.volumes.length})：重写「${rewrittenVolume.title}」的 ${volumeChapters.length} 个章节...`);

        const chapterPrompt = buildVolumeChaptersRewritePrompt(
            novel, fullResult.fullArchitecture, rewrittenVolume, volumeChapters, reviewResult, userPrompt
        );
        const chapterResult = await callAIWithRetry(aiClient, chapterPrompt, `第${i + 1}卷章节重写`, signal);

        volumesWithChapters.push({
            ...rewrittenVolume,
            chapters: chapterResult.chapters || []
        });

        console.log(`[rewrite] 第${i + 1}卷章节重写完成，共 ${chapterResult.chapters?.length || 0} 章`);
    }

    const finalResult = {
        fullArchitecture: fullResult.fullArchitecture,
        volumes: volumesWithChapters
    };

    console.log(`[rewrite] 全部重写完成！全本 + ${volumesWithChapters.length} 卷`);
    return finalResult;
}

module.exports = {
    reviewArchitectures,
    rewriteArchitectures,
};
