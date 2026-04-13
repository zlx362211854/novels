import { Novel, Architecture, Chapter } from '../models/sequelize';

interface ExportParams {
  novelId: number;
  scope?: string;
  volumeId?: string | number;
}

async function exportToMarkdown(params: ExportParams): Promise<string> {
  const { novelId, scope, volumeId } = params;

  const novel = await Novel.findByPk(novelId);
  if (!novel) throw new Error('小说不存在');

  let markdown = `# ${novel.title}\n\n`;

  if (novel.description) {
    markdown += `> ${novel.description}\n\n`;
  }

  markdown += `类型: ${novel.genre || '未分类'}\n\n`;
  markdown += `---\n\n`;

  const architectures = await Architecture.findAll({
    where: { novel_id: novelId },
    order: [['id', 'ASC']]
  });

  const chapters = await Chapter.findAll({
    where: { novel_id: novelId },
    order: [['chapter_number', 'ASC']]
  });

  const fullArch = architectures.find((a: any) => a.level === 'full');
  if (fullArch) {
    markdown += `## 全本架构: ${fullArch.title}\n\n`;
    if (fullArch.plot_outline) {
      markdown += `### 情节大纲\n\n${fullArch.plot_outline}\n\n`;
    }
    markdown += `---\n\n`;
  }

  const volumes = architectures.filter((a: any) => a.level === 'volume');
  const chapterArchs = architectures.filter((a: any) => a.level === 'chapter');

  if (scope === 'volume' && volumeId) {
    const volume = volumes.find((v: any) => v.id === parseInt(String(volumeId)));
    if (volume) {
      markdown += exportVolume(volume, chapterArchs, chapters);
    }
  } else {
    volumes.forEach((volume: any) => {
      markdown += exportVolume(volume, chapterArchs, chapters);
    });

    const orphanChapters = chapters.filter((c: any) => !c.architecture_id);
    orphanChapters.forEach((chapter: any) => {
      markdown += exportChapter(chapter);
    });
  }

  return markdown;
}

function exportVolume(volume: any, chapterArchs: any[], chapters: any[]): string {
  let markdown = `## 卷: ${volume.title}\n\n`;

  if (volume.plot_outline) {
    markdown += `### 情节大纲\n\n${volume.plot_outline}\n\n`;
  }

  const volumeChapterArchs = chapterArchs.filter((a: any) => a.parent_id === volume.id);
  volumeChapterArchs.forEach((arch: any) => {
    const archChapters = chapters.filter((c: any) => c.architecture_id === arch.id);
    archChapters.forEach((chapter: any) => {
      markdown += exportChapter(chapter, arch);
    });
  });

  const volumeChapters = chapters.filter((c: any) => c.architecture_id === volume.id);
  volumeChapters.forEach((chapter: any) => {
    markdown += exportChapter(chapter);
  });

  markdown += `---\n\n`;
  return markdown;
}

function exportChapter(chapter: any, arch?: any): string {
  let markdown = `### 第${chapter.chapter_number}章: ${chapter.title || '未命名'}\n\n`;

  if (arch) {
    if (arch.plot_outline) {
      markdown += `> 情节: ${arch.plot_outline}\n\n`;
    }
  }

  if (chapter.content) {
    markdown += `${chapter.content}\n\n`;
  }

  return markdown;
}

async function exportNovel(novelId: number, format: string = 'txt'): Promise<string> {
  return exportToMarkdown({ novelId });
}

async function exportChapterContent(chapterId: number): Promise<any> {
  const chapter = await Chapter.findByPk(chapterId);
  if (!chapter) throw new Error('章节不存在');
  return exportChapter(chapter);
}

export {
  exportToMarkdown,
  exportNovel,
  exportChapterContent
};