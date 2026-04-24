import { Op } from 'sequelize';
import { Architecture, Chapter, sequelize } from '../models/sequelize';

interface CreateArchitectureData {
  novelId: number;
  level: string;
  parentId?: number | null;
  title: string;
  plotOutline?: string;
  characters?: object;
  worldSetting?: object;
  emotionalTone?: string;
  metadata?: object;
}

interface UpdateArchitectureData {
  title?: string;
  plotOutline?: string;
  characters?: object;
  worldSetting?: object;
  emotionalTone?: string;
  metadata?: object;
}

function toJsonString(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    // 验证是否已经是合法 JSON，是则直接存，否则当普通字符串处理
    try { JSON.parse(value); return value; } catch { return JSON.stringify(value); }
  }
  return JSON.stringify(value);
}

async function create(data: CreateArchitectureData): Promise<any> {
  const architecture = await Architecture.create({
    novel_id: data.novelId,
    level: data.level,
    parent_id: data.parentId || null,
    title: data.title,
    plot_outline: data.plotOutline || null,
    characters: toJsonString(data.characters),
    world_setting: toJsonString(data.worldSetting),
    emotional_tone: data.emotionalTone || null,
    metadata: toJsonString(data.metadata),
  });
  return parseJsonFields(architecture);
}

async function findByNovelId(novelId: number | string): Promise<any[]> {
  const architectures = await Architecture.findAll({
    where: { novel_id: novelId },
    order: [['id', 'ASC']]
  });
  return architectures.map(row => parseJsonFields(row));
}

async function findByParentId(parentId: number | string): Promise<any[]> {
  const architectures = await Architecture.findAll({
    where: { parent_id: parentId },
    order: [['id', 'ASC']]
  });
  return architectures.map(row => parseJsonFields(row));
}

async function findById(id: number | string): Promise<any | null> {
  const architecture = await Architecture.findByPk(id);
  return architecture ? parseJsonFields(architecture) : null;
}

async function update(id: number | string, data: UpdateArchitectureData): Promise<any | null> {
  const architecture = await Architecture.findByPk(id);
  if (!architecture) return null;

  if (data.title !== undefined) architecture.title = data.title;
  if (data.plotOutline !== undefined) architecture.plot_outline = data.plotOutline;
  if (data.characters !== undefined) architecture.characters = toJsonString(data.characters);
  if (data.worldSetting !== undefined) architecture.world_setting = toJsonString(data.worldSetting);
  if (data.emotionalTone !== undefined) architecture.emotional_tone = data.emotionalTone;
  if (data.metadata !== undefined) architecture.metadata = JSON.stringify(data.metadata);

  await architecture.save();
  return parseJsonFields(architecture);
}

async function deleteArchitecture(id: number | string): Promise<boolean> {
  const architecture = await Architecture.findByPk(id);
  if (!architecture) return false;

  await architecture.destroy();
  return true;
}

async function withSqliteBusyRetry<T>(operation: () => Promise<T>, attempts = 6): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const message = `${error?.message || ''} ${error?.parent?.message || ''}`;
      if (!message.includes('SQLITE_BUSY') || attempt === attempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}

async function renumberChaptersForNovel(novelId: number | string, transaction?: any): Promise<void> {
  let nextChapterNumber = 1;
  const volumes = await Architecture.findAll({
    where: { novel_id: novelId, level: 'volume' },
    order: [['id', 'ASC']],
    transaction
  });

  for (const volume of volumes) {
    const chapterArchs = await Architecture.findAll({
      where: { parent_id: volume.id, level: 'chapter' },
      order: [['id', 'ASC']],
      transaction
    });

    const chapterArchIds = chapterArchs.map((chapterArch: any) => chapterArch.id);
    const chaptersByArchId = new Map<number, any[]>();
    if (chapterArchIds.length) {
      const linkedChapters = await Chapter.findAll({
        where: { architecture_id: { [Op.in]: chapterArchIds } },
        order: [['architecture_id', 'ASC'], ['id', 'ASC']],
        transaction
      });

      linkedChapters.forEach((chapter: any) => {
        const archId = chapter.architecture_id;
        const list = chaptersByArchId.get(archId) || [];
        list.push(chapter);
        chaptersByArchId.set(archId, list);
      });
    }

    for (const chapterArch of chapterArchs) {
      const chapters = chaptersByArchId.get(chapterArch.id) || [];
      for (const chapter of chapters) {
        if (chapter.chapter_number !== nextChapterNumber) {
          await Chapter.update(
            { chapter_number: nextChapterNumber },
            { where: { id: chapter.id }, transaction }
          );
        }
      }

      if (chapters.length > 0) {
        nextChapterNumber += 1;
      }
    }
  }

  const orphanChapters = await Chapter.findAll({
    where: { novel_id: novelId, architecture_id: null },
    order: [['chapter_number', 'ASC'], ['id', 'ASC']],
    transaction
  });

  for (const chapter of orphanChapters) {
    if (chapter.chapter_number !== nextChapterNumber) {
      await Chapter.update(
        { chapter_number: nextChapterNumber },
        { where: { id: chapter.id }, transaction }
      );
    }
    nextChapterNumber += 1;
  }
}

async function renumberNovelChapters(novelId: number | string): Promise<void> {
  await withSqliteBusyRetry(() => renumberChaptersForNovel(novelId), 8);
}

async function replaceChapterArchitectures(novelId: number | string, volumeId: number | string | null, chapters: any[]): Promise<any[]> {
  const where: any = {
    novel_id: novelId,
    level: 'chapter',
    parent_id: volumeId || null
  };

  const existingArchitectures = await Architecture.findAll({
    where,
    order: [['id', 'ASC']]
  });

  const existingIds = existingArchitectures.map((architecture) => architecture.id);
  if (existingIds.length) {
    await Chapter.destroy({
      where: { architecture_id: existingIds }
    });

    await Architecture.destroy({ where: { id: existingIds } });
  }

  const created = [];
  for (const chapter of chapters) {
    const createdArchitecture = await create({
      novelId: Number(novelId),
      level: 'chapter',
      parentId: volumeId ? Number(volumeId) : null,
      title: chapter.title,
      plotOutline: chapter.plot_outline || chapter.plotOutline || ''
    });
    created.push(createdArchitecture);
  }

  return created;
}

function parseJsonFields(row: any): any {
  let plain;
  if (row.toJSON) {
    plain = row.toJSON();
  } else if (row.to) {
    plain = row.to();
  } else {
    plain = row;
  }

  if (plain.dataValues) {
    plain = plain.dataValues;
  }

  return {
    ...plain,
    characters: plain.characters ? JSON.parse(plain.characters) : null,
    worldSetting: plain.world_setting ? JSON.parse(plain.world_setting) : null,
    metadata: plain.metadata ? JSON.parse(plain.metadata) : null
  };
}

export { create, findByNovelId, findByParentId, findById, update, deleteArchitecture as delete, replaceChapterArchitectures, renumberNovelChapters };
