// 番茄小说作者后台发布步骤

module.exports = {
  name: '番茄小说',
  loginUrl: 'https://fanqienovel.com/main/writer/?enter_from=author_zone',

  getDraftSteps(workId, chapter) {
    return [
      ...getCommonSteps(workId, chapter),
      {
        label: '存草稿',
        execute: async (run) => {
          await run('find', 'text', '存草稿', 'click');
          await run('wait', '2000');
        }
      },
      {
        label: '验证结果',
        execute: async (run) => {
          const snapshot = await run('snapshot');
          const failed = ['保存失败', '操作失败', '网络错误', '系统错误'].some(t => snapshot.includes(t));
          if (failed) throw new Error('存草稿失败，请检查截图');
        }
      }
    ];
  },

  getPublishSteps(workId, chapter) {
    return [
      ...getCommonSteps(workId, chapter),
      {
        label: '点击下一步',
        execute: async (run) => {
          await run('find', 'text', '下一步', 'click');
          await run('wait', '2000');
        }
      },
      {
        label: '处理错别字检测弹窗',
        execute: async (run) => {
          const snapshot = await run('snapshot');
          if (snapshot.includes('错别字') && snapshot.includes('确定提交')) {
            await run('find', 'text', '确定提交', 'click');
            await run('wait', '3000');

            let replaced = false;
            const keywords = ['替换全部', '全部替换', '一键替换', '确认替换'];
            for (const kw of keywords) {
              try {
                await run('find', 'text', kw, 'click');
                replaced = true;
                await run('wait', '2000');
                break;
              } catch { }
            }

            if (!replaced) {
              try {
                await run('find', 'text', '替换', 'click');
                await run('wait', '2000');
              } catch { }
            }
          }
        }
      },
      {
        label: '跳过内容风险检测',
        execute: async (run) => {
          // 弹窗：是否进行内容风险检测？→ 点击取消
          await run('find', 'text', '取消', 'click');
          await run('wait', '2000');
        }
      },
      {
        label: '选择不使用AI',
        execute: async (run) => {
          // 弹窗中有 AI 单选，选择"否"
          await run('find', 'text', '否', 'click');
          await run('wait', '1000');
        }
      },
      {
        label: '确认发布',
        execute: async (run) => {
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
  const manageUrl = `https://fanqienovel.com/main/writer/chapter-manage/${workId}`;
  return [
    {
      label: '切换到番茄标签页',
      execute: async (run) => {
        const tabList = await run('tab', 'list');
        const tabIndex = findFanqieTabIndex(tabList, workId);
        if (tabIndex !== null) {
          await run('tab', String(tabIndex));
        } else {
          await run('open', manageUrl);
          await run('wait', '--load', 'networkidle');
          const url = await run('get', 'url');
          if (url.includes('login') || url.includes('passport')) {
            throw new Error(`番茄登录态已过期，请先在 Chrome 中登录：${manageUrl}`);
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
      label: '填写章节序号和标题',
      execute: async (run) => {
        // 序号 input: class="serial-input" 但没有 placeholder，用 :not 区分
        // 标题 input: class="serial-editor-input-hint-area" + placeholder="请输入标题"
        await run('eval', `window.__chapterNum = ${JSON.stringify(String(chapter.chapterNumber || '1'))}`);
        await run('eval', `window.__chapterTitle = ${JSON.stringify(chapter.title)}`);
        await run('eval', `
          (function() {
            function setNativeValue(el, value) {
              const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
              setter.set.call(el, value);
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            // 序号：没有 placeholder 的那个 serial-input
            const numEl = document.querySelector('input.serial-input:not([placeholder])');
            if (numEl) setNativeValue(numEl, window.__chapterNum);
            // 标题：有 placeholder="请输入标题" 的那个
            const titleEl = document.querySelector('input[placeholder="请输入标题"]');
            if (titleEl) setNativeValue(titleEl, window.__chapterTitle);
            delete window.__chapterNum;
            delete window.__chapterTitle;
          })()
        `);
        await run('wait', '500');
      }
    },
    {
      label: '填写正文',
      execute: async (run) => {
        // ProseMirror contenteditable
        await run('eval', `window.__insertContent = ${JSON.stringify(chapter.plainContent)}`);
        await run('eval', `
          (function() {
            const el = document.querySelector('.ProseMirror[contenteditable="true"]');
            if (!el) throw new Error('找不到番茄正文编辑器');
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

function findFanqieTabIndex(tabList, workId) {
  for (const line of tabList.split('\n')) {
    const match = line.match(/\[(\d+)\].*fanqienovel\.com.*chapter/);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}
