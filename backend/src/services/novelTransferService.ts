import { Op } from 'sequelize';
import {
  sequelize,
  Novel,
  Architecture,
  Chapter,
  ChapterVersion,
  ChapterMemory,
  StoryBibleEntry,
} from '../models/sequelize';

interface NovelExportBundle {
  version: number;
  exportedAt: string;
  source: {
    app: string;
  };
  novel: any;
  architectures: any[];
  chapters: any[];
  chapterVersions: any[];
  chapterMemories: any[];
  storyBibleEntries: any[];
}

function toPlain<T extends { toJSON?: () => any }>(record: T | null): any {
  if (!record) return null;
  return typeof record.toJSON === 'function' ? record.toJSON() : record;
}

function assertBundleShape(bundle: any): asserts bundle is NovelExportBundle {
  if (!bundle || typeof bundle !== 'object') {
    throw new Error('导入文件不是合法 JSON 对象');
  }
  if (bundle.version !== 1) {
    throw new Error('导入文件版本不受支持');
  }
  if (!bundle.novel || typeof bundle.novel !== 'object') {
    throw new Error('导入文件缺少 novel 字段');
  }
  if (!Array.isArray(bundle.architectures)) {
    throw new Error('导入文件缺少 architectures 数组');
  }
  if (!Array.isArray(bundle.chapters)) {
    throw new Error('导入文件缺少 chapters 数组');
  }
  if (!Array.isArray(bundle.chapterVersions)) {
    throw new Error('导入文件缺少 chapterVersions 数组');
  }
  if (!Array.isArray(bundle.chapterMemories)) {
    throw new Error('导入文件缺少 chapterMemories 数组');
  }
  if (!Array.isArray(bundle.storyBibleEntries)) {
    throw new Error('导入文件缺少 storyBibleEntries 数组');
  }
}

async function buildImportedTitle(baseTitle: string): Promise<string> {
  const rootTitle = baseTitle?.trim() || '未命名小说';
  const baseImportedTitle = `${rootTitle}（导入）`;
  let candidate = baseImportedTitle;
  let index = 2;

  while (await Novel.findOne({ where: { title: candidate } })) {
    candidate = `${rootTitle}（导入 ${index}）`;
    index += 1;
  }

  return candidate;
}

async function exportNovelBundle(novelId: number): Promise<NovelExportBundle> {
  const novel = await Novel.findByPk(novelId);
  if (!novel) {
    throw new Error('小说不存在');
  }

  const architectures = await Architecture.findAll({
    where: { novel_id: novelId },
    order: [['id', 'ASC']],
  });

  const chapters = await Chapter.findAll({
    where: { novel_id: novelId },
    order: [['chapter_number', 'ASC'], ['id', 'ASC']],
  });

  const chapterIds = chapters.map((item: any) => Number(item.id)).filter(Number.isFinite);
  const chapterVersions = chapterIds.length
    ? await ChapterVersion.findAll({
      where: { chapter_id: { [Op.in]: chapterIds } },
      order: [['chapter_id', 'ASC'], ['version_number', 'ASC']],
    })
    : [];

  const chapterMemories = chapterIds.length
    ? await ChapterMemory.findAll({
      where: { chapter_id: { [Op.in]: chapterIds } },
      order: [['chapter_id', 'ASC']],
    })
    : [];

  const storyBibleEntries = await StoryBibleEntry.findAll({
    where: { novel_id: novelId },
    order: [['id', 'ASC']],
  });

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: {
      app: 'NovelForge',
    },
    novel: toPlain(novel),
    architectures: architectures.map(toPlain),
    chapters: chapters.map(toPlain),
    chapterVersions: chapterVersions.map(toPlain),
    chapterMemories: chapterMemories.map(toPlain),
    storyBibleEntries: storyBibleEntries.map(toPlain),
  };
}

async function importNovelBundle(bundle: NovelExportBundle): Promise<{ novelId: number; title: string }> {
  assertBundleShape(bundle);

  const importedTitle = await buildImportedTitle(String(bundle.novel.title || '未命名小说'));

  return await sequelize.transaction(async (transaction) => {
    const createdNovel = await Novel.create(
      {
        title: importedTitle,
        description: bundle.novel.description || null,
        genre: bundle.novel.genre || null,
        publish_config: bundle.novel.publish_config || null,
        ai_config: bundle.novel.ai_config || null,
      },
      { transaction }
    );

    const architectureIdMap = new Map<number, number>();
    for (const item of bundle.architectures) {
      const parentId = item.parent_id ? architectureIdMap.get(Number(item.parent_id)) ?? null : null;
      const created = await Architecture.create(
        {
          novel_id: Number(createdNovel.id),
          level: item.level,
          parent_id: parentId,
          title: item.title,
          plot_outline: item.plot_outline || null,
          characters: item.characters || null,
          world_setting: item.world_setting || null,
          emotional_tone: item.emotional_tone || null,
          metadata: item.metadata || null,
        },
        { transaction }
      );

      if (item.id !== undefined && item.id !== null) {
        architectureIdMap.set(Number(item.id), Number(created.id));
      }
    }

    const chapterIdMap = new Map<number, number>();
    for (const item of bundle.chapters) {
      const created = await Chapter.create(
        {
          novel_id: Number(createdNovel.id),
          architecture_id: item.architecture_id ? architectureIdMap.get(Number(item.architecture_id)) ?? null : null,
          chapter_number: item.chapter_number,
          title: item.title || null,
          content: item.content || null,
          review_result: item.review_result || null,
          publish_result: item.publish_result || null,
          status: item.status || 'draft',
        },
        { transaction }
      );

      if (item.id !== undefined && item.id !== null) {
        chapterIdMap.set(Number(item.id), Number(created.id));
      }
    }

    for (const item of bundle.chapterVersions) {
      const mappedChapterId = chapterIdMap.get(Number(item.chapter_id));
      if (!mappedChapterId) continue;

      await ChapterVersion.create(
        {
          chapter_id: mappedChapterId,
          version_number: item.version_number,
          content: item.content || '',
        },
        { transaction }
      );
    }

    for (const item of bundle.chapterMemories) {
      const mappedChapterId = chapterIdMap.get(Number(item.chapter_id));
      if (!mappedChapterId) continue;

      await ChapterMemory.create(
        {
          novel_id: Number(createdNovel.id),
          chapter_id: mappedChapterId,
          chapter_number: item.chapter_number,
          summary: item.summary || null,
          entities: item.entities || null,
          facts: item.facts || null,
          state_changes: item.state_changes || null,
          open_threads: item.open_threads || null,
          source_excerpt_map: item.source_excerpt_map || null,
          key_events: item.key_events || null,
          time_sequence: item.time_sequence || null,
          content_hash: item.content_hash || '',
        },
        { transaction }
      );
    }

    for (const item of bundle.storyBibleEntries) {
      await StoryBibleEntry.create(
        {
          novel_id: Number(createdNovel.id),
          entry_type: item.entry_type,
          title: item.title,
          content: item.content || '',
          metadata: item.metadata || null,
        },
        { transaction }
      );
    }

    return {
      novelId: Number(createdNovel.id),
      title: createdNovel.title,
    };
  });
}

export type { NovelExportBundle };
export {
  exportNovelBundle,
  importNovelBundle,
};
