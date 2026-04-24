export function summarizeMemory(memory) {
  if (!memory) {
    return {
      hasMemory: false,
      keyEventCount: 0,
      entityCount: 0,
      factCount: 0,
      stateChangeCount: 0,
      openThreadCount: 0,
    };
  }

  const entities = memory.entities || {};
  const entityCount = ['characters', 'locations', 'items', 'organizations'].reduce(
    (total, key) => total + (Array.isArray(entities[key]) ? entities[key].length : 0),
    0
  );

  return {
    hasMemory: true,
    keyEventCount: memory.key_events?.length || 0,
    entityCount,
    factCount: memory.facts?.length || 0,
    stateChangeCount: memory.state_changes?.length || 0,
    openThreadCount: memory.open_threads?.length || 0,
  };
}

export function summarizeReview(review) {
  if (!review) {
    return {
      hasReview: false,
      status: 'empty',
      issueCount: 0,
      noteCount: 0,
    };
  }

  const issueCount = review.issues?.length || 0;

  return {
    hasReview: true,
    status: issueCount === 0 ? 'healthy' : 'warning',
    issueCount,
    noteCount: review.notes?.length || 0,
  };
}

export function buildNextChapterDraft(chapter, nextArchitecture = null) {
  const currentNumber = Number(chapter?.chapter_number) || 0;
  const chapterNumber = currentNumber + 1;

  const draft = {
    chapterNumber,
    title: nextArchitecture?.title || `第 ${chapterNumber} 章`,
    content: '',
    status: 'generating',
  };

  if (nextArchitecture?.id) {
    draft.architectureId = nextArchitecture.id;
  }

  return draft;
}
