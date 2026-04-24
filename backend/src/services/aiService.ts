import { Architecture, Chapter, ChapterMemory } from '../models/sequelize';

function parseJsonField(value: any, fallback: any): any {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function formatPreviousChapterMemory(memory: any): string {
  if (!memory) return '';

  const facts = parseJsonField(memory.facts, []);
  const stateChanges = parseJsonField(memory.state_changes, []);
  const openThreads = parseJsonField(memory.open_threads, []);
  const keyEvents = parseJsonField(memory.key_events, []);

  const sections: string[] = [];

  if (Array.isArray(keyEvents) && keyEvents.length > 0) {
    sections.push([
      '**上一章关键事件：**',
      keyEvents.slice(0, 6).map((event: any) => {
        const time = event.time ? `[${event.time}]` : '';
        const chars = Array.isArray(event.characters) && event.characters.length
          ? `（${event.characters.join('、')}）`
          : '';
        return `- ${time}${event.event || ''}${chars}`;
      }).join('\n')
    ].join('\n'));
  }

  if (Array.isArray(facts) && facts.length > 0) {
    sections.push([
      '**上一章关键事实：**',
      facts.slice(0, 10).map((f: any) => `- ${f.subject || ''} ${f.predicate || ''} ${f.object || ''}`.trim()).join('\n')
    ].join('\n'));
  }

  if (Array.isArray(stateChanges) && stateChanges.length > 0) {
    sections.push([
      '**上一章状态变化：**',
      stateChanges.slice(0, 8).map((s: any) => `- ${s.entity || ''}.${s.field || ''}：${s.before ?? '?'} → ${s.after ?? '?'}`).join('\n')
    ].join('\n'));
  }

  if (Array.isArray(openThreads) && openThreads.length > 0) {
    sections.push([
      '**上一章未解决线索：**',
      openThreads.slice(0, 8).map((thread: any) => {
        const label = typeof thread === 'string' ? thread : thread.thread;
        const status = typeof thread === 'string' ? '' : thread.status;
        return `- ${label || ''}${status ? `（${status}）` : ''}`;
      }).join('\n')
    ].join('\n'));
  }

  return sections.filter(Boolean).join('\n\n');
}

async function getPreviousChapterContent(currentArchId: number, parentId: number | null): Promise<any> {
  const currentArch = await Architecture.findByPk(currentArchId);
  if (!currentArch) return null;

  const volumes = await Architecture.findAll({
    where: { novel_id: currentArch.novel_id, level: 'volume' },
    order: [['id', 'ASC']]
  });
  const volumeOrder = new Map(volumes.map((volume: any, index: number) => [volume.id, index]));

  const chapterArchitectures = await Architecture.findAll({
    where: { novel_id: currentArch.novel_id, level: 'chapter' },
    order: [['id', 'ASC']]
  });

  const orderedArchitectures = chapterArchitectures.sort((left: any, right: any) => {
    const leftOrder = volumeOrder.get(left.parent_id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = volumeOrder.get(right.parent_id) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.id - right.id;
  });

  const prevArch = selectPreviousChapterArchitecture(orderedArchitectures, currentArchId);
  if (!prevArch) return null;

  return await getChapterByArchitectureId(prevArch.id);
}

function selectPreviousChapterArchitecture(siblings: any[], currentArchId: number): any | null {
  const currentIndex = siblings.findIndex((arch: any) => arch.id === currentArchId);
  if (currentIndex <= 0) return null;
  return siblings[currentIndex - 1] || null;
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
    if (memoryRecord) {
      prevMemory = typeof (memoryRecord as any).get === 'function'
        ? (memoryRecord as any).get({ plain: true })
        : memoryRecord;
    }
  }

  return {
    title: prevChapter.title,
    chapterNumber: prevChapter.chapter_number,
    endingContent: lastPart,
    memory: prevMemory
  };
}

function buildChapterPrompt(
  novel: any,
  chapterArch: any,
  volumeArch: any,
  fullArch: any,
  prevChapterContent: any,
  volumeChapterArchs: any[] = [],
  userPrompt: string = ''
): string {
  let context = `## 小说信息
标题：${novel.title}
类型：${novel.genre || '未指定'}
行文风格: 金庸武侠笔法,古风
`;

  let fullArchContext = '';
  if (fullArch) {
    fullArchContext = `\n## 全本架构（方向参考）\n`;
    fullArchContext += `⚠️ 以下全本情节大纲仅供理解故事走向、主题脉络和埋设伏笔，**不得据此提前写出尚未到达的具体事件或人物登场**。\n`;
    if (fullArch.plot_outline) fullArchContext += `\n### 故事走向\n${fullArch.plot_outline}\n`;
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
    context += `⚠️ 以下卷情节大纲仅供理解本卷走向，不得据此提前写出本章架构中未描述的事件。\n`;
    if (volumeArch.plot_outline) context += `本卷走向：${volumeArch.plot_outline}\n`;
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

  if (volumeChapterArchs.length > 0) {
    context += `\n## 本卷章节架构（按顺序）\n`;
    context += `⚠️ 以下是本卷所有章节的架构信息，请了解整体脉络和角色出场顺序，但只撰写「本章架构」中指定的内容，不得提前写出后续章节的情节。这里展示的是卷内顺序提示，不是正文的全书章号。\n`;
    volumeChapterArchs.forEach((arch, index) => {
      const isCurrentChapter = arch.id === chapterArch.id;
      const marker = isCurrentChapter ? '【当前章节】' : `【同卷顺位${index + 1}】`;
      context += `\n${marker} ${arch.title || '未命名'}\n`;
      if (arch.plot_outline) {
        context += `  情节：${arch.plot_outline}\n`;
      }
      if (arch.characters) {
        try {
          const chars = typeof arch.characters === 'string' ? JSON.parse(arch.characters) : arch.characters;
          const charList = Array.isArray(chars) ? chars : Object.values(chars);
          const charNames = charList.map((c: any) => typeof c === 'string' ? c : (c.name || '')).filter(Boolean);
          if (charNames.length > 0) {
            context += `  角色：${charNames.join('、')}\n`;
          }
        } catch { }
      }
    });
  }

  let prevChapterInfo = '';
  if (prevChapterContent) {
    const memorySection = formatPreviousChapterMemory(prevChapterContent.memory);

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

  const normalizedUserPrompt = typeof userPrompt === 'string' ? userPrompt.trim() : '';
  const userPromptSection = normalizedUserPrompt
    ? `\n## 用户补充要求（优先遵守）\n${normalizedUserPrompt}\n`
    : '';

  return `你是一位深谙金庸武侠笔法的小说作家。请根据以下架构信息，以金庸风格撰写章节正文。

## 金庸武侠写作风格指南（核心，贯穿全文）

### 叙事笔法
- 采用**全知视角**，叙事者如说书人，偶尔直接评点人物或形势（如"此人心机之深，实非常人所能揣度"）
- 叙述语气沉稳从容，不疾不徐，有掌控全局之感
- 行文**文白夹杂**：主体用现代汉语，人物对话与场景描写中自然融入文言词汇和古典意象，典雅而不晦涩
- 善用**旁白点睛**：在关键情节后，叙事者用一两句话点破其中深意或留下悬念

### 武打与动作描写
- 武功招式有名有实，描写时兼顾技巧细节与宏观气势
- 打斗节奏**张弛结合**：激烈交锋之中穿插人物心理、旁观者反应、环境变化，而非一味快节奏铺陈
- 高手过招，胜负往往在一招半式之间，以"静"衬"动"，以轻描淡写写惊天一击
- 武功境界通过行为和他人反应体现，少用夸张形容词，多用具体细节

### 人物与对话
- 对话**言简意赅**，江湖人物说话带侠气，惜字如金；智者之言往往一语双关
- 人物情感**含蓄克制**：爱恨情仇多通过行为、神态、细节流露，少有直白表白
- 性格鲜明但有层次：英雄有弱点，奸人有苦衷，配角也有一两个令人印象深刻的细节
- 善用**对比映衬**：以他人的平庸衬托主角的不凡，以小人的猥琐衬托英雄的磊落

### 场景与意境
- 场景描写有**诗词意境**，借景抒情，山川草木皆有情
- 江湖气息浓厚：酒肆、古道、深山、月夜是常见舞台，描写时注重氛围营造
- **诗词运用**（重要）：诗词非必须，仅在情绪或意境自然升华时插入，方式可选：
  1. 引用真实的唐宋古诗、词、歌谣（如白居易、苏轼、辛弃疾等），须与场景情绪高度契合
  2. 仿古自创：以文言仿写四言、五言、七言诗句或词牌片段，风格须与引文无异，不可露出现代痕迹
  - 插入形式：可由人物吟诵、叙述者引出、匾额题字、酒旗所书等方式自然融入
  - 切忌生硬堆砌，诗词出现的时机须是情绪或意境的升华点

### 情节节奏
- 重要情节前有铺垫，转折处出人意料又在情理之中
- **章末留悬念**：本章结尾在情节的紧要关头或情感的高潮处戛然而止，令读者欲罢不能
- 恩怨情仇脉络清晰，江湖道义（重义气、重承诺、恩仇必报）贯穿始终
- 偶尔以**幽默笔法**调节气氛，在紧张之中插入轻松一笔，令人莞尔

### 禁止事项（风格层面）
- 禁止使用现代网文的"爽文"节奏（主角光环、无脑升级、大量意淫）
- 禁止使用夸张的现代口语或网络用语
- 禁止情感描写过于直白露骨，含蓄方显深情
- 禁止武打描写流于流水账式罗列招式，须有节奏变化和人物心理

---

${context}

${prevChapterInfo}

${chapterInfo}

${userPromptSection}

## 基本要求
- **行文风格（核心，贯穿全文）**：
  - 语言：**半文半白**，以古典白话为主干，四字短语、对仗句式、文言虚词（”却、便、只见、但见、须知”等）自然穿插；句式长短相间，错落有致；**严禁现代口语、网络用语及西化句式**
  - 叙事：全知视角，叙述者如说书先生，语气从容沉稳；关键处偶以”话说……””却说……”起笔，或以”此乃……”作旁白点睛
  - **诗词**：诗词非必须，仅在情绪或意境自然升华时插入，切忌为凑诗词而生硬堆砌；若有诗词，可引用古人名篇或仿古自创（四言、五七言、词牌皆可），须与当下场景高度契合
  - 场景：借景抒情，以白描手法绘山川风物，营造江湖苍凉或清幽意境；酒肆、古道、荒庙、月夜是常见舞台
  - 人物对话：言简意赅，江湖人物惜字如金，一语双关；忌长篇说教和现代逻辑
  - 整体气质贴近《射雕英雄传》《神雕侠侣》《倚天屠龙记》，风骨端正，侠气盎然
- **字数**：4500-6000字（硬性要求：不得少于4500字，不得超过6000字）
- **严格边界（核心禁令）**：只生成「本章架构·内容概括」所描述的情节范围内的内容。不得新增本章架构未授权的主要人物；如需路人、店家、守卫等功能性小人物推动场景，必须一笔带过，不得喧宾夺主或引入新主线。
- 严格围绕本章架构的内容概括展开，不得偏离主线，不得跳过架构中的核心情节
- 严格遵循全本架构的世界观设定（时代、地理、规则等），不得出现与之冲突的内容
- ${prevChapterContent ? '根据上一章结尾情况，灵活处理章节衔接（参考上方衔接说明）' : '注意故事的开篇吸引力'}
- 只输出正文内容，不要标题、章节号等
- 章末禁止出现"欲知后事如何，且听下回分解"或任何类似的说书套语收尾；章末结尾方式自然多样，可以是动作、景物、人物心理、对话，无需固定公式

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
- **细节鲜活**：通过习惯性动作、语言风格、神态表情等细节塑造人物记忆点；对话简洁有力，言辞符合人物身份与时代背景
- **身份适配**：人物的言行、思维、价值观须贴合自身身份（寒门的务实、贵族的骄矜、职业人物的特质）

## 五、事件推动
- **情节合理**：核心事件的出现、发展、转折须符合小说设定和逻辑，避免刻意突兀、强行推动
- **铺垫到位**：核心冲突、关键转折须有足够铺垫（通过人物对话、场景描写、细节暗示让冲突/转折自然出现）
- **关联紧密**：本章情节须与前后章节紧密关联，既完成本章核心内容，又为后续情节埋下伏笔或做好衔接，避免孤立章节
- **冲突合理**：冲突须贴合人物身份和小说核心线，冲突的解决/推进须符合逻辑，避免强行解围
- **内容边界**：不得越过本章架构提前写后续章节具体情节；功能性小人物只能服务当前场景，不能承担新主线

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
  formatPreviousChapterMemory,
  getPreviousChapterContent,
  getChapterByArchitectureId,
  selectPreviousChapterArchitecture,
};
