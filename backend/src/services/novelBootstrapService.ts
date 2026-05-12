import * as novelService from './novelService';
import * as storyBibleService from './storyBibleService';
import * as architectureService from './architectureService';
import * as architectureReviewService from './architectureReviewService';
import { NovelAiConfig } from '../ai/runtimeConfig';

export interface DraftArchitecture {
  draftId: string;
  title: string;
  plotOutline: string;
  characters?: unknown;
  worldSetting?: unknown;
  emotionalTone?: string;
  metadata?: Record<string, unknown>;
}

export interface DraftChapterArchitecture extends DraftArchitecture {
  parentDraftVolumeId: string;
}

export interface NovelBootstrapMetadata {
  prompt: string;
  aiConfig?: NovelAiConfig | null;
  novel: {
    title: string;
    description: string;
    genre: string;
  };
  cast: {
    maleLead: Record<string, unknown> | null;
    femaleLead: Record<string, unknown> | null;
    supportingCharacters: Record<string, unknown>[];
    relationships: Record<string, unknown>[];
  };
  story: {
    premise: string;
    mainLine: string;
    arcs: string[];
    bibleSummary: string;
  };
}

export interface NovelBootstrapDraft extends NovelBootstrapMetadata {
  storyBibleEntries: Array<{
    type: string;
    title: string;
    content: string;
    priority: number;
    labels: string[];
  }>;
  fullArchitecture: DraftArchitecture;
  volumeArchitectures: DraftArchitecture[];
  chapterArchitectures: DraftChapterArchitecture[];
}

function buildFullMetadata(metadata: NovelBootstrapMetadata, fullArchitecture: DraftArchitecture): Record<string, unknown> {
  return {
    prompt: metadata.prompt,
    cast: metadata.cast,
    story: metadata.story,
    generatedTheme: fullArchitecture.metadata?.theme || null,
    endingDirection: fullArchitecture.metadata?.endingDirection || null,
  };
}

export async function createBootstrapNovel(metadata: NovelBootstrapMetadata): Promise<any> {
  return novelService.create({
    title: metadata.novel.title,
    description: metadata.novel.description,
    genre: metadata.novel.genre,
    aiConfig: metadata.aiConfig || undefined,
  });
}

export async function saveBootstrapStoryBible(novelId: number, entries: Array<{
  type: string;
  title: string;
  content: string;
  priority: number;
  labels: string[];
}>): Promise<void> {
  for (const entry of entries) {
    await storyBibleService.createEntry({
      novelId,
      type: entry.type,
      title: entry.title,
      content: entry.content,
      priority: entry.priority,
      labels: entry.labels,
    });
  }
}

export async function saveBootstrapFullArchitecture(
  novelId: number,
  metadata: NovelBootstrapMetadata,
  fullArchitecture: DraftArchitecture,
): Promise<any> {
  return architectureService.create({
    novelId,
    level: 'full',
    parentId: null,
    title: fullArchitecture.title,
    plotOutline: fullArchitecture.plotOutline,
    characters: (fullArchitecture.characters ?? []) as object,
    worldSetting: (fullArchitecture.worldSetting ?? {}) as object,
    emotionalTone: fullArchitecture.emotionalTone ?? '',
    metadata: buildFullMetadata(metadata, fullArchitecture),
  });
}

export async function saveBootstrapVolumeArchitectures(
  novelId: number,
  fullArchitectureId: number,
  volumes: DraftArchitecture[],
): Promise<any[]> {
  const createdVolumes = [];
  for (const volume of volumes) {
    const created = await architectureService.create({
      novelId,
      level: 'volume',
      parentId: fullArchitectureId,
      title: volume.title,
      plotOutline: volume.plotOutline,
      characters: (volume.characters ?? []) as object,
      worldSetting: (volume.worldSetting ?? {}) as object,
      emotionalTone: volume.emotionalTone ?? '',
      metadata: {
        ...(volume.metadata || {}),
        draftId: volume.draftId,
      },
    });
    createdVolumes.push(created);
  }
  return createdVolumes;
}

export async function applyPersistedChapterArchitectureReviewLoop(
  novelId: number,
  rounds: number,
  taskId?: string | null,
): Promise<Array<{ round: number; reviewResult: any; repairResult: any; applyResult: any }>> {
  const history: Array<{ round: number; reviewResult: any; repairResult: any; applyResult: any }> = [];
  for (let round = 1; round <= rounds; round += 1) {
    const reviewResult = await architectureReviewService.reviewChapterArchitectures(novelId, undefined, taskId ?? null);
    const repairResult = await architectureReviewService.repairChapterArchitectures(
      novelId,
      reviewResult,
      '请只修补受影响章架构，必要时新增章架构，不要删除章节。',
      undefined,
      taskId ?? null,
    );
    const applyResult = await architectureReviewService.applyChapterArchitectureRepair(
      novelId,
      repairResult,
      taskId ?? null,
    );
    history.push({ round, reviewResult, repairResult, applyResult });
  }
  return history;
}
