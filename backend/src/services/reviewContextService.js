const { Chapter, Novel, Architecture } = require('../models/sequelize');
const chapterMemoryService = require('./chapterMemoryService');

function uniqueTerms(values) {
  const seen = new Set();
  const terms = [];

  values.forEach((value) => {
    if (!value || typeof value !== 'string') return;
    const term = value.trim();
    if (!term || seen.has(term)) return;
    seen.add(term);
    terms.push(term);
  });

  return terms;
}

function collectQueryTerms(memoryCard = {}) {
  const entityTerms = [
    ...(memoryCard.entities?.characters || []),
    ...(memoryCard.entities?.locations || []),
    ...(memoryCard.entities?.items || []),
    ...(memoryCard.entities?.organizations || [])
  ];

  const factTerms = (memoryCard.facts || []).flatMap((fact) => [
    fact.subject,
    fact.predicate,
    fact.object
  ]);

  const threadTerms = (memoryCard.open_threads || []).map((thread) => thread.thread);

  return uniqueTerms([...entityTerms, ...factTerms, ...threadTerms]);
}

function overlapCount(left, right) {
  const rightSet = new Set(right);
  return left.reduce((count, term) => count + (rightSet.has(term) ? 1 : 0), 0);
}

function scoreMemoryMatch(currentMemory, historicalMemory) {
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

  const currentFactTerms = uniqueTerms((currentMemory.facts || []).flatMap((fact) => [fact.subject, fact.object]));
  const historicalFactTerms = uniqueTerms((historicalMemory.facts || []).flatMap((fact) => [fact.subject, fact.object]));

  const currentThreadTerms = uniqueTerms((currentMemory.open_threads || []).map((thread) => thread.thread));
  const historicalThreadTerms = uniqueTerms((historicalMemory.open_threads || []).map((thread) => thread.thread));

  return (
    overlapCount(currentEntityTerms, historicalEntityTerms) * 3 +
    overlapCount(currentFactTerms, historicalFactTerms) * 2 +
    overlapCount(currentThreadTerms, historicalThreadTerms)
  );
}

function sliceExcerpt(content, term) {
  if (!content) return '';

  const index = term ? content.indexOf(term) : -1;
  if (index === -1) {
    return content.slice(0, 220);
  }

  return content.slice(Math.max(0, index - 80), index + 140);
}

function pickExcerpt(memory, chapter, queryTerms) {
  const excerptMap = Array.isArray(memory.source_excerpt_map) ? memory.source_excerpt_map : [];
  for (const term of queryTerms) {
    const matched = excerptMap.find((item) => item.label === term || item.excerpt?.includes(term));
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

async function buildReviewContext(chapterId, signal, preloaded = {}) {
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

  const currentMemory = preloaded.currentMemory ?? await chapterMemoryService.upsertForChapter(chapterId, signal);
  const allMemories = await chapterMemoryService.findByNovelId(chapter.novel_id);
  const historicalMemories = allMemories.filter((memory) => memory.chapter_id !== chapter.id);

  const ranked = historicalMemories
    .map((memory) => ({
      memory,
      score: scoreMemoryMatch(currentMemory, memory)
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);

  const queryTerms = collectQueryTerms(currentMemory);
  const sourceExcerpts = [];

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
    relevantMemories: ranked.map((item) => item.memory),
    sourceExcerpts,
    architecture,
    novel
  };
}

module.exports = {
  buildReviewContext,
  collectQueryTerms,
  scoreMemoryMatch,
  sliceExcerpt
};
