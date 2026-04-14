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

## 写作要求
1. 字数要求：4500-5500字，内容要充实丰富
2. 严格根据本章架构的内容概括展开描写，不得超出架构范围
3. 严格遵循全本架构中的世界观设定（如时代、地理、规则等），不得出现与之冲突的内容
4. 注意情节的连贯性和节奏感
5. 人物对话要符合性格特点
6. 场景描写要生动具体
7. ${prevChapterContent ? '根据上一章结尾情况，灵活处理章节衔接（参考衔接说明）' : '注意故事的开篇吸引力'}
8. 只输出正文内容，不要标题、章节号等

## 内容丰富度要求
1. **内心活动**：深入描写人物的心理变化、情感波动、思想斗争，让读者理解人物的动机
2. **对话互动**：增加人物之间的对话，通过对话展现性格、推进情节、制造冲突
3. **情绪冲突**：设置人物之间的矛盾、误解、争执，或人物内心的挣扎与抉择
4. **支线故事**：在不偏离主线的前提下，适当展开配角的故事、背景交代、环境描写
5. **细节描写**：对动作、表情、环境、物品等进行细致刻画，增强画面感
6. **节奏变化**：张弛有度，有紧张的高潮，也有舒缓的过渡，避免流水账式叙述
7. **感官体验**：调动视觉、听觉、嗅觉、触觉等感官，让读者身临其境

## 内容边界要求
1. **以本章架构为主轴**：本章的核心情节必须严格围绕架构中的内容概括展开，不得偏离主线
2. **配角与次要人物可以自由发挥**：架构未提及的人物可以出现，用于推动情节、丰富场景或制造冲突，但不能喧宾夺主、抢占主线
3. **细节事件可以自由填充**：为使情节合理、场景生动，可以在主线之外补充细节性事件，但不得改变架构规定的情节走向和结果
4. **不得跳过架构中的核心情节**：架构中明确写出的情节点必须在本章有所体现，不能略去
5. **不得"剧透"后续章节**：不要让人物预言、明确提及或直接暗示后续章节的具体情节内容

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

export {
  buildChapterPrompt,
  getPreviousChapterContent,
  getChapterByArchitectureId,
};
