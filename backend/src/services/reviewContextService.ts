import { Chapter, Novel, Architecture } from '../models/sequelize';
import * as chapterMemoryService from './chapterMemoryService';

function uniqueTerms(values: any[]): string[] {
  const seen = new Set();
  const terms: string[] = [];

  values.forEach((value: any) => {
    if (!value || typeof value !== 'string') return;
    const term = value.trim();
    if (!term || seen.has(term)) return;
    seen.add(term);
    terms.push(term);
  });

  return terms;
}

function collectQueryTerms(memoryCard: any = {}): string[] {
  const entityTerms = [
    ...(memoryCard.entities?.characters || []),
    ...(memoryCard.entities?.locations || []),
    ...(memoryCard.entities?.items || []),
    ...(memoryCard.entities?.organizations || [])
  ];

  const factTerms = (memoryCard.facts || []).flatMap((fact: any) => [
    fact.subject,
    fact.predicate,
    fact.object
  ]);

  const threadTerms = (memoryCard.open_threads || []).map((thread: any) => thread.thread);

  return uniqueTerms([...entityTerms, ...factTerms, ...threadTerms]);
}

function overlapCount(left: string[], right: string[]): number {
  const rightSet = new Set(right);
  return left.reduce((count, term) => count + (rightSet.has(term) ? 1 : 0), 0);
}

function scoreMemoryMatch(currentMemory: any, historicalMemory: any): number {
  const currentEntityTerms = uniqueTerms([
    ...(currentMemory.entities?.characters || []),
    ...(currentMemory.entities?.locations || []),
    ...(currentMemory.entities?.items || []),
    ...(currentMemory.entities?.organizations || [])
  ]);
  const historicalEntityTerms = uniqueTerms([
    ...(historicalMemory.entities?.characters || []),
    ...(historicalMemory.entities?.locations || []),
    ...(historicalMemory.entities?.items || []),
    ...(historicalMemory.entities?.organizations || [])
  ]);

  const currentFactTerms = uniqueTerms((currentMemory.facts || []).flatMap((fact: any) => [fact.subject, fact.object]));
  const historicalFactTerms = uniqueTerms((historicalMemory.facts || []).flatMap((fact: any) => [fact.subject, fact.object]));

  const currentThreadTerms = uniqueTerms((currentMemory.open_threads || []).map((thread: any) => thread.thread));
  const historicalThreadTerms = uniqueTerms((historicalMemory.open_threads || []).map((thread: any) => thread.thread));

  return (
    overlapCount(currentEntityTerms, historicalEntityTerms) * 3 +
    overlapCount(currentFactTerms, historicalFactTerms) * 2 +
    overlapCount(currentThreadTerms, historicalThreadTerms)
  );
}

function sliceExcerpt(content: string, term: string): string {
  if (!content) return '';

  const index = term ? content.indexOf(term) : -1;
  if (index === -1) {
    return content.slice(0, 220);
  }

  return content.slice(Math.max(0, index - 80), index + 140);
}

function pickExcerpt(memory: any, chapter: any, queryTerms: string[]): string {
  const excerptMap = Array.isArray(memory.source_excerpt_map) ? memory.source_excerpt_map : [];
  for (const term of queryTerms) {
    const matched = excerptMap.find((item: any) => item.label === term || item.excerpt?.includes(term));
    if (matched?.excerpt) {
      return matched.excerpt;
    }
  }

  for (const term of queryTerms) {
    const excerpt = sliceExcerpt(chapter.content || '', term);
    if (excerpt) return excerpt;
  }

  return sliceExcerpt(chapter.content || '', '');
}

async function buildReviewContext(chapterId: number, signal?: AbortSignal, preloaded: any = {}): Promise<any> {
  const chapter = preloaded.chapter || await Chapter.findByPk(chapterId);
  if (!chapter) {
    throw new Error('章节不存在');
  }

  const novel = preloaded.novel || await Novel.findByPk(chapter.novel_id);
  if (!novel) {
    throw new Error('小说不存在');
  }

  const architecture = preloaded.architecture ?? (
    chapter.architecture_id
      ? await Architecture.findByPk(chapter.architecture_id)
      : null
  );

  const fullArchitecture = await Architecture.findOne({
    where: { novel_id: novel.id, level: 'full' }
  });

  if (fullArchitecture && fullArchitecture.world_setting && architecture) {
    try {
      const worldSetting = typeof fullArchitecture.world_setting === 'string'
        ? JSON.parse(fullArchitecture.world_setting)
        : fullArchitecture.world_setting;
      architecture.world_setting = JSON.stringify(worldSetting);
    } catch {}
  }

  if (fullArchitecture && fullArchitecture.characters && architecture) {
    try {
      const characters = typeof fullArchitecture.characters === 'string'
        ? JSON.parse(fullArchitecture.characters)
        : fullArchitecture.characters;
      architecture.characters = JSON.stringify(characters);
    } catch {}
  }

  const currentMemory = preloaded.currentMemory ?? await chapterMemoryService.upsertForChapter(chapterId, signal);
  const allMemories = await chapterMemoryService.findByNovelId(chapter.novel_id);
  const historicalMemories = allMemories.filter((memory: any) => memory.chapter_id !== chapter.id);

  const ranked = historicalMemories
    .map((memory: any) => ({
      memory,
      score: scoreMemoryMatch(currentMemory, memory)
    }))
    .filter((item: any) => item.score > 0)
    .sort((left: any, right: any) => right.score - left.score)
    .slice(0, 8);

  const queryTerms = collectQueryTerms(currentMemory);
  const sourceExcerpts: any[] = [];

  for (const item of ranked) {
    const sourceChapter = await Chapter.findByPk(item.memory.chapter_id);
    if (!sourceChapter) continue;

    sourceExcerpts.push({
      chapterId: sourceChapter.id,
      chapterNumber: sourceChapter.chapter_number,
      excerpt: pickExcerpt(item.memory, sourceChapter, queryTerms)
    });
  }

  return {
    currentChapter: chapter,
    currentMemory,
    relevantMemories: ranked.map((item: any) => item.memory),
    sourceExcerpts,
    architecture,
    novel
  };
}

export {
  buildReviewContext,
  collectQueryTerms,
  scoreMemoryMatch,
  sliceExcerpt
};