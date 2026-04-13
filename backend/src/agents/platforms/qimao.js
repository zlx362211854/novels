// 七猫小说作者后台发布步骤
// 具体元素定位需要实际运行 agent-browser snapshot 后调整

module.exports = {
  name: '七猫小说',
  loginUrl: 'https://zuozhe.qimao.com/',

  getDraftSteps(workId, chapter) {
    return [
      ...getCommonSteps(workId, chapter),
      {
        label: '存为草稿',
        execute: async (run) => {
          await run('find', 'text', '存为草稿', 'click');
          await run('wait', '3000');
        }
      },
      {
        label: '验证结果',
        execute: async (run) => {
          const snapshot = await run('snapshot');
          // 有明确失败提示才报错，否则视为成功
          const failed = ['保存失败', '操作失败', '网络错误', '系统错误'].some(t => snapshot.includes(t));
          if (failed) throw new Error('存为草稿失败，请检查截图');
        }
      }
    ];
  },

  getPublishSteps(workId, chapter) {
    return [
      ...getCommonSteps(workId, chapter),
      {
        label: '立即发布',
        execute: async (run) => {
          await run('find', 'text', '立即发布', 'click');
          await run('wait', '2000');
        }
      },
      {
        label: '确认发布弹窗',
        execute: async (run) => {
          // 点击弹窗中的"确认发布"按钮
          await run('find', 'text', '确认发布', 'click');
          await run('wait', '3000');
        }
      },
      {
        label: '验证结果',
        execute: async (run) => {
          const snapshot = await run('snapshot');
          const failed = ['发布失败', '操作失败', '网络错误', '系统错误'].some(t => snapshot.includes(t));
          if (failed) throw new Error('发布失败，请检查截图');
        }
      }
    ];
  }
};

function getCommonSteps(workId, chapter) {
  const manageUrl = `https://zuozhe.qimao.com/front/book-manage/manage?id=${workId}`;
  return [
    {
      label: '切换到七猫标签页',
      execute: async (run) => {
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
      execute: async (run) => {
        await run('find', 'text', '新建章节', 'click');
        await run('wait', '--load', 'networkidle');
      }
    },
    {
      label: '填写标题',
      execute: async (run) => {
        const cleanTitle = chapter.title.replace(/^第[零一二三四五六七八九十百千\d]+章\s*/, '').trim() || chapter.title;
        await run('find', 'placeholder', '请输入章节名称，最多20个字', 'fill', cleanTitle);
      }
    },
    {
      label: '填写正文',
      execute: async (run) => {
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

function parseContentEditableRef(snapshot) {
  // 匹配 "generic [ref=eN] editable [contenteditable]" 行，取第一个（章节正文编辑器）
  for (const line of snapshot.split('\n')) {
    if (line.includes('editable [contenteditable]') && line.includes('generic')) {
      const m = line.match(/\[ref=(e\d+)\]/);
      if (m) return m[1];
    }
  }
  return null;
}

function findQimaoTabIndex(tabList, workId) {
  // 解析 tab list 输出，找包含七猫章节管理 URL 的 tab
  // 格式: "  [N] title - url" 或 "→ [N] title - url"
  const lines = tabList.split('\n');
  for (const line of lines) {
    const match = line.match(/\[(\d+)\].*zuozhe\.qimao\.com.*book-manage/);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

function parseRefByHint(snapshot, hints) {
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
