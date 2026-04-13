interface Step {
  label: string;
  execute: (run: any) => Promise<void>;
}

interface ChapterData {
  title: string;
  chapterNumber: number;
  plainContent: string;
}

export const name = '七猫小说';
export const loginUrl = 'https://zuozhe.qimao.com/';

export function getDraftSteps(workId: string, chapter: ChapterData): Step[] {
  return [
    ...getCommonSteps(workId, chapter),
    {
      label: '存为草稿',
      execute: async (run: any) => {
        await run('find', 'text', '存为草稿', 'click');
        await run('wait', '3000');
      }
    },
    {
      label: '验证结果',
      execute: async (run: any) => {
        const snapshot = await run('snapshot');
        const failed = ['保存失败', '操作失败', '网络错误', '系统错误'].some(t => snapshot.includes(t));
        if (failed) throw new Error('存为草稿失败，请检查截图');
      }
    }
  ];
}

export function getPublishSteps(workId: string, chapter: ChapterData): Step[] {
  return [
    ...getCommonSteps(workId, chapter),
    {
      label: '立即发布',
      execute: async (run: any) => {
        await run('find', 'text', '立即发布', 'click');
        await run('wait', '2000');
      }
    },
    {
      label: '确认发布弹窗',
      execute: async (run: any) => {
        await run('find', 'text', '确认发布', 'click');
        await run('wait', '3000');
      }
    },
    {
      label: '验证结果',
      execute: async (run: any) => {
        const snapshot = await run('snapshot');
        const failed = ['发布失败', '操作失败', '网络错误', '系统错误'].some(t => snapshot.includes(t));
        if (failed) throw new Error('发布失败，请检查截图');
      }
    }
  ];
}

function getCommonSteps(workId: string, chapter: ChapterData): Step[] {
  const manageUrl = `https://zuozhe.qimao.com/front/book-manage/manage?id=${workId}`;
  return [
    {
      label: '切换到七猫标签页',
      execute: async (run: any) => {
        const tabList = await run('tab', 'list');
        const tabIndex = findQimaoTabIndex(tabList, workId);
        if (tabIndex !== null) {
          await run('tab', String(tabIndex));
        } else {
          await run('open', manageUrl);
          await run('wait', '--load', 'networkidle');
          const url = await run('get', 'url');
          if (url.includes('register-login') || url.includes('/login')) {
            throw new Error(`七猫登录态已过期，请先在 Chrome 中登录：${manageUrl}`);
          }
        }
      }
    },
    {
      label: '新建章节',
      execute: async (run: any) => {
        await run('find', 'text', '新建章节', 'click');
        await run('wait', '--load', 'networkidle');
      }
    },
    {
      label: '填写标题',
      execute: async (run: any) => {
        const cleanTitle = chapter.title.replace(/^第[零一二三四五六七八九十百千\d]+章\s*/, '').trim() || chapter.title;
        await run('find', 'placeholder', '请输入章节名称，最多20个字', 'fill', cleanTitle);
      }
    },
    {
      label: '填写正文',
      execute: async (run: any) => {
        const snapshot = await run('snapshot');
        const editorRef = parseContentEditableRef(snapshot);
        if (!editorRef) throw new Error('找不到正文编辑器，请截图检查页面状态');
        await run('click', editorRef);
        await run('eval', `window.__insertContent = ${JSON.stringify(chapter.plainContent)}`);
        await run('eval', `
          (function() {
            const el = document.querySelector('[contenteditable="true"].edit-mask');
            el.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, window.__insertContent);
            delete window.__insertContent;
          })()
        `);
        await run('wait', '2000');
      }
    }
  ];
}

function parseContentEditableRef(snapshot: string): string | null {
  for (const line of snapshot.split('\n')) {
    if (line.includes('editable [contenteditable]') && line.includes('generic')) {
      const m = line.match(/\[ref=(e\d+)\]/);
      if (m) return m[1];
    }
  }
  return null;
}

function findQimaoTabIndex(tabList: string, workId: string): number | null {
  const lines = tabList.split('\n');
  for (const line of lines) {
    const match = line.match(/\[(\d+)\].*zuozhe\.qimao\.com.*book-manage/);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

function parseRefByHint(snapshot: string, hints: string[]): string | null {
  const lines = snapshot.split('\n');
  for (const hint of hints) {
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.includes(hint.toLowerCase())) {
        const refMatch = line.match(/@e\d+/);
        if (refMatch) return refMatch[0];
      }
    }
  }
  return null;
}