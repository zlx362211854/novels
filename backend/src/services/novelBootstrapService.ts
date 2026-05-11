import { sequelize, Novel, Architecture, StoryBibleEntry } from '../models/sequelize';
import * as novelService from './novelService';
import * as storyBibleService from './storyBibleService';

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

export interface NovelBootstrapDraft {
  prompt: string;
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

function stringifyJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return JSON.stringify(value);
    }
  }
  return JSON.stringify(value);
}

function buildFullMetadata(draft: NovelBootstrapDraft): Record<string, unknown> {
  return {
    prompt: draft.prompt,
    cast: draft.cast,
    story: draft.story,
  };
}

export async function saveNovelBootstrapDraft(draft: NovelBootstrapDraft): Promise<any> {
  let createdNovelId: number | null = null;

  try {
    const persisted = await sequelize.transaction(async (transaction) => {
      const novel = await Novel.create(
        {
          title: draft.novel.title,
          description: draft.novel.description || null,
          genre: draft.novel.genre || null,
          publish_config: null,
          ai_config: null,
        },
        { transaction }
      );
      createdNovelId = novel.id;

      const fullArchitecture = await Architecture.create(
        {
          novel_id: novel.id,
          level: 'full',
          parent_id: null,
          title: draft.fullArchitecture.title,
          plot_outline: draft.fullArchitecture.plotOutline || null,
          characters: stringifyJson(draft.fullArchitecture.characters ?? []),
          world_setting: stringifyJson(draft.fullArchitecture.worldSetting ?? {}),
          emotional_tone: draft.fullArchitecture.emotionalTone || null,
          metadata: stringifyJson({
            ...(draft.fullArchitecture.metadata || {}),
            ...buildFullMetadata(draft),
          }),
        },
        { transaction }
      );

      const volumeIdMap = new Map<string, number>();

      for (const volume of draft.volumeArchitectures) {
        const createdVolume = await Architecture.create(
          {
            novel_id: novel.id,
            level: 'volume',
            parent_id: fullArchitecture.id,
            title: volume.title,
            plot_outline: volume.plotOutline || null,
            characters: stringifyJson(volume.characters ?? []),
            world_setting: stringifyJson(volume.worldSetting ?? {}),
            emotional_tone: volume.emotionalTone || null,
            metadata: stringifyJson(volume.metadata ?? {}),
          },
          { transaction }
        );
        volumeIdMap.set(volume.draftId, createdVolume.id);
      }

      for (const chapter of draft.chapterArchitectures) {
        await Architecture.create(
          {
            novel_id: novel.id,
            level: 'chapter',
            parent_id: volumeIdMap.get(chapter.parentDraftVolumeId) ?? null,
            title: chapter.title,
            plot_outline: chapter.plotOutline || null,
            characters: stringifyJson(chapter.characters ?? []),
            world_setting: stringifyJson(chapter.worldSetting ?? {}),
            emotional_tone: chapter.emotionalTone || null,
            metadata: stringifyJson(chapter.metadata ?? {}),
          },
          { transaction }
        );
      }

      return { novelId: novel.id };
    });

    if (!createdNovelId) {
      throw new Error('小说保存失败');
    }

    for (const entry of draft.storyBibleEntries) {
      await storyBibleService.createEntry({
        novelId: createdNovelId,
        type: entry.type,
        title: entry.title,
        content: entry.content,
        priority: entry.priority,
        labels: entry.labels,
      });
    }

    return {
      novel: await novelService.findById(createdNovelId),
      counts: {
        volumes: draft.volumeArchitectures.length,
        chapters: draft.chapterArchitectures.length,
        storyBibleEntries: draft.storyBibleEntries.length,
      },
      persisted,
    };
  } catch (error) {
    if (createdNovelId) {
      await StoryBibleEntry.destroy({ where: { novel_id: createdNovelId } }).catch(() => undefined);
      await novelService.deleteNovel(createdNovelId).catch(() => undefined);
    }
    throw error;
  }
}
