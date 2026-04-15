import { Architecture, Chapter, ChapterMemory } from '../models/sequelize';

async function getPreviousChapterContent(currentArchId: number, parentId: number | null): Promise<any> {
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

async function getChapterByArchitectureId(archId: number): Promise<any> {
  const prevChapter = await Chapter.findOne({
    where: { architecture_id: archId }
  });

  if (!prevChapter || !prevChapter.content) return null;

  const content = prevChapter.content;
  const lastPart = content.length > 800 ? content.slice(-800) : content;

  let prevMemory = null;
  if (prevChapter.id) {
    const memoryRecord = await ChapterMemory.findOne({
      where: { chapter_id: prevChapter.id }
    });
    if (memoryRecord && (memoryRecord as any).memory_data) {
      prevMemory = (memoryRecord as any).memory_data;
    }
  }

  return {
    title: prevChapter.title,
    chapterNumber: prevChapter.chapter_number,
    endingContent: lastPart,
    memory: prevMemory
  };
}

function buildChapterPrompt(novel: any, chapterArch: any, volumeArch: any, fullArch: any, prevChapterContent: any): string {
  let context = `## 小说信息
标题：${novel.title}
类型：${novel.genre || '未指定'}
`;

  let fullArchContext = '';
  if (fullArch) {
    fullArchContext = `\n## 全本架构\n`;
    if (fullArch.plot_outline) fullArchContext += `\n### 情节大纲\n${fullArch.plot_outline}\n`;
    if (fullArch.characters) {
      try {
        const chars = JSON.parse(fullArch.characters);
        fullArchContext += `\n### 人物设定\n${JSON.stringify(chars, null, 2)}\n`;
      } catch {
        fullArchContext += `\n### 人物设定\n${fullArch.characters}\n`;
      }
    }
    if (fullArch.world_setting) {
      try {
        const world = JSON.parse(fullArch.world_setting);
        fullArchContext += `\n### 世界观\n${JSON.stringify(world, null, 2)}\n`;
      } catch {
        fullArchContext += `\n### 世界观\n${fullArch.world_setting}\n`;
      }
    }
    if (fullArch.emotional_tone) {
      fullArchContext += `\n### 情感基调\n${fullArch.emotional_tone}\n`;
    }
  }

  if (fullArch) {
    context += fullArchContext;
  }

  if (volumeArch) {
    context += `\n## 卷架构：${volumeArch.title}\n`;
    if (volumeArch.plot_outline) context += `情节大纲：${volumeArch.plot_outline}\n`;
    if (volumeArch.characters) {
      try {
        const chars = JSON.parse(volumeArch.characters);
        context += `人物设定：${JSON.stringify(chars, null, 2)}\n`;
      } catch {
        context += `人物设定：${volumeArch.characters}\n`;
      }
    }
    if (volumeArch.world_setting) {
      try {
        const world = JSON.parse(volumeArch.world_setting);
        context += `世界观：${JSON.stringify(world, null, 2)}\n`;
      } catch {
        context += `世界观：${volumeArch.world_setting}\n`;
      }
    }
    if (volumeArch.emotional_tone) {
      context += `情感基调：${volumeArch.emotional_tone}\n`;
    }
  }

  let prevChapterInfo = '';
  if (prevChapterContent) {
    let memorySection = '';
    if (prevChapterContent.memory && prevChapterContent.memory.facts && prevChapterContent.memory.facts.length > 0) {
      const facts = prevChapterContent.memory.facts;
      const keyFacts = facts.slice(0, 10).map((f: any) => `- ${f.subject} ${f.predicate} ${f.object}`).join('\n');
      memorySection = `
**关键事实：**
${keyFacts}
`;
    }

    prevChapterInfo = `
## 上一章结尾（参考）
章节：${prevChapterContent.title}（第${prevChapterContent.chapterNumber || '?'}章）
---
${prevChapterContent.endingContent}
---
${memorySection}
**衔接说明：**
- 如果上一章结尾是动作/对话/场景的中断点（如：走进房间、战斗中、对话进行中），本章开头需要严格衔接，保持空间、时间、人物状态的连续性
- 如果上一章结尾是情节的自然收束（如：事件结束、场景转换提示），本章可以根据架构内容概括灵活安排时间跳跃或场景切换
`;
  }

  let chapterInfo = `## 本章架构
标题：${chapterArch.title}`;
  if (chapterArch.plot_outline) {
    chapterInfo += `\n内容概括：${chapterArch.plot_outline}`;
  }
  if (chapterArch.world_setting) {
    try {
      const world = JSON.parse(chapterArch.world_setting);
      chapterInfo += `\n世界观设定：${JSON.stringify(world, null, 2)}`;
    } catch {
      chapterInfo += `\n世界观设定：${chapterArch.world_setting}`;
    }
  }
  if (chapterArch.emotional_tone) {
    chapterInfo += `\n情感基调：${chapterArch.emotional_tone}`;
  }

  return `你是一位专业的网络小说作家。请根据以下架构信息，撰写章节正文。

${context}

${prevChapterInfo}

${chapterInfo}

## 基本要求
- 字数：4500-5500字，内容充实丰富
- 严格围绕本章架构的内容概括展开，不得偏离主线，不得跳过架构中的核心情节
- 严格遵循全本架构的世界观设定（时代、地理、规则等），不得出现与之冲突的内容
- ${prevChapterContent ? '根据上一章结尾情况，灵活处理章节衔接（参考上方衔接说明）' : '注意故事的开篇吸引力'}
- 只输出正文内容，不要标题、章节号等

## 一、逻辑严谨性（核心规避）
- **设定统一**：所有人物称谓、物品、场景、技能等须与小说整体设定保持一致，禁止前后矛盾（称谓统一，时代背景适配，禁用超出设定的物品/词汇）
- **常识正确**：结合小说设定确保医学、生活、场景等相关常识合理，人物行为符合自身身份，无无目的动作
- **时间线自洽**：所有时间表述必须能互相印证；数字（年龄、天数、人数等）前后一致；人物状态前后连贯，不可无故跳变
- **逻辑闭环**：所有情节、人物行为均有合理动机和因果关系，避免逻辑断层、突兀转折
- **细节适配**：人物衣着、言行、场景细节贴合人物身份和小说设定（寒门物品符合家境，贵族言行符合身份）
- **场景连贯**：人物在A地点，不能突然出现在B地点，必须有移动过程

## 二、行文流畅性
- **节奏平衡**：张弛有度，有紧张高潮也有舒缓过渡，避免冗余堆砌与节奏过快；每章须有核心情节或核心情感，围绕核心展开
- **过渡自然**：场景切换、人物对话、情感转折、情节推进均须自然衔接，可通过人物动作、环境描写过渡
- **句式优化**：减少重复句式，语句流畅有质感，无语法错误，无表述拖沓，与小说整体基调一致
- **感官体验**：调动视觉、听觉、嗅觉、触觉等感官，让读者身临其境

## 三、情感描写
- **情感真实**：所有人物情感贴合自身身份、处境和情节发展，情随事出，避免情感单薄、突兀或脱离人物设定
- **层次丰富**：人物情感须有完整变化（喜、怒、哀、惧的递进或转折），用动作、神态、细节支撑情感，而非单纯用词汇堆砌
- **共情力**：情感描写贴合人物心境，避免情感虚假、生硬，不强行煽情；用动作和细节展现人物情绪，而非直接描述

## 四、人物塑造
- **形象立体**：所有出场人物（主配角）须有自身性格特质和行为习惯，避免标签化（反派不只"刻薄"，正派不只"善良"，须有自身矛盾或闪光点）
- **性格统一**：人物性格、言行举止须前后一致，避免人设崩塌（性格转变须有合理诱因和铺垫）
- **细节鲜活**：通过习惯性动作、语言风格、神态表情等细节塑造人物记忆点，对话口语化有个性，避免书面腔
- **身份适配**：人物的言行、思维、价值观须贴合自身身份（寒门的务实、贵族的骄矜、职业人物的特质）

## 五、事件推动
- **情节合理**：核心事件的出现、发展、转折须符合小说设定和逻辑，避免刻意突兀、强行推动
- **铺垫到位**：核心冲突、关键转折须有足够铺垫（通过人物对话、场景描写、细节暗示让冲突/转折自然出现）
- **关联紧密**：本章情节须与前后章节紧密关联，既完成本章核心内容，又为后续情节埋下伏笔或做好衔接，避免孤立章节
- **冲突合理**：冲突须贴合人物身份和小说核心线，冲突的解决/推进须符合逻辑，避免强行解围
- **内容边界**：架构未提及的人物可出现推动情节，但不能喧宾夺主；不得"剧透"后续章节具体情节

## 六、禁止事项
- 禁用与小说设定不符的词汇、物品、行为、常识
- 禁止使用带标号的列举（如"1. xxx 2. xxx"），用自然叙述代替
- 禁止使用"首先、其次、然后、最后"等程式化连接词
- 禁止使用"总的来说、综上所述"等总结性表达，及"值得注意的是、需要强调的是"等说教式表达
- 禁止使用"让我们、我们一起"等与读者对话的口吻
- 禁止使用"这一刻、就在这时、突然之间"等刻意制造悬念的表达
- 禁止每段都用"他知道、他明白、他意识到"开头
- 禁止使用"心中暗想、心中默念、心中感叹"等重复的心理描写句式
- 避免人物标签化、情感虚假、人设崩塌、逻辑断层

请开始撰写本章正文：`;
}

export {
  buildChapterPrompt,
  getPreviousChapterContent,
  getChapterByArchitectureId,
};
