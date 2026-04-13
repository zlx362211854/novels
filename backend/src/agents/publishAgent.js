const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('path');
const fs = require('node:fs');
const { SystemConfig } = require('../models/sequelize');

const execFileAsync = promisify(execFile);

const PLATFORMS = {
  qimao: require('./platforms/qimao'),
  fanqie: require('./platforms/fanqie')
};

const SCREENSHOT_DIR = path.join(process.cwd(), 'data', 'screenshots');

async function getAgentBrowserPath() {
  const config = await SystemConfig.findOne({ where: { config_key: 'agentBrowserPath' } });
  if (config) {
    try { return JSON.parse(config.config_value); } catch { return config.config_value; }
  }
  return 'agent-browser';
}

async function getChromeProfile() {
  const config = await SystemConfig.findOne({ where: { config_key: 'chromeProfile' } });
  if (config) {
    try { return JSON.parse(config.config_value); } catch { return config.config_value; }
  }
  return 'Profile 2'; // 默认值，可在设置中修改
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function stripMarkdown(content) {
  if (!content) return '';
  return content
    .replace(/^#{1,6}\s+/gm, '')        // headings
    .replace(/\*\*(.+?)\*\*/g, '$1')    // bold
    .replace(/\*(.+?)\*/g, '$1')        // italic
    .replace(/`(.+?)`/g, '$1')          // inline code
    .replace(/```[\s\S]*?```/g, '')      // code blocks
    .replace(/!\[.*?\]\(.*?\)/g, '')     // images
    .replace(/\[(.+?)\]\(.*?\)/g, '$1') // links
    .replace(/^[-*+]\s+/gm, '')         // list markers
    .replace(/^\d+\.\s+/gm, '')         // ordered list markers
    .replace(/^>\s+/gm, '')             // blockquotes
    .replace(/---+/g, '')               // horizontal rules
    .replace(/\n{3,}/g, '\n\n')         // excessive newlines
    .trim();
}

async function publish(platformKey, chapter, platformConfig, signal, mode = 'publish') {
  const platform = PLATFORMS[platformKey];
  if (!platform) throw new Error(`未知平台: ${platformKey}`);

  const agentBrowser = await getAgentBrowserPath();

  async function run(cmd, ...args) {
    if (signal?.aborted) throw Object.assign(new Error('已取消'), { name: 'AbortError' });
    // 使用 --auto-connect 控制用户已打开的 Chrome（需以 --remote-debugging-port=9222 启动）
    const fullArgs = [cmd, ...args, '--auto-connect'];
    console.log(`[publish] ${platformKey}: ${cmd} ${args.join(' ')}`);
    const { stdout } = await execFileAsync(agentBrowser, fullArgs, {
      timeout: 60000,
      signal,
      maxBuffer: 1024 * 1024
    });
    return stdout;
  }

  const chapterData = {
    title: chapter.title || `第${chapter.chapter_number}章`,
    chapterNumber: chapter.chapter_number,
    plainContent: stripMarkdown(chapter.content)
  };

  const steps = mode === 'draft'
    ? platform.getDraftSteps(platformConfig.workId, chapterData)
    : platform.getPublishSteps(platformConfig.workId, chapterData);

  try {
    for (const step of steps) {
      console.log(`[publish] ${platformKey}: ${step.label}`);
      await step.execute(run);
    }
    return { status: 'success', publishedAt: new Date().toISOString() };
  } catch (error) {
    if (error.name === 'AbortError') throw error;

    // 失败时截图
    let screenshotPath = null;
    try {
      ensureDir(SCREENSHOT_DIR);
      const filename = `${platformKey}-ch${chapter.id}-${Date.now()}.png`;
      const p = path.join(SCREENSHOT_DIR, filename);
      await execFileAsync(agentBrowser, ['screenshot', p, '--auto-connect'], { timeout: 10000 });
      // 确认文件确实写入了
      if (fs.existsSync(p) && fs.statSync(p).size > 0) {
        screenshotPath = p;
        console.log(`[publish] 失败截图已保存: ${screenshotPath}`);
      } else {
        console.warn('[publish] 截图命令成功但文件为空或不存在');
      }
    } catch (e) {
      console.warn('[publish] 截图失败:', e.message);
    }

    return {
      status: 'failed',
      error: error.message,
      screenshotPath
    };
  }
}

// 使用 --auto-connect 时无需单独登录，直接复用 Chrome 已有的登录态
// 此函数保留用于兼容前端登录按钮，实际只做连通性检查
async function openLoginBrowser(platformKey) {
  const platform = PLATFORMS[platformKey];
  if (!platform) throw new Error(`未知平台: ${platformKey}`);

  const agentBrowser = await getAgentBrowserPath();

  const { stdout } = await execFileAsync(
    agentBrowser,
    ['get', 'url', '--auto-connect'],
    { timeout: 10000, maxBuffer: 1024 * 1024 }
  );
  console.log(`[publish] 已连接，当前页面: ${stdout.trim()}`);
  return { platform: platformKey, connected: true, currentUrl: stdout.trim() };
}

function checkLoginStatus(platformKey) {
  // 使用 --auto-connect 模式，登录状态由 Chrome 自身维护
  // 此处始终返回 true，实际登录态在发布时由 snapshot 检测
  return { loggedIn: true, mode: 'auto-connect' };
}

function getPlatformList() {
  return Object.entries(PLATFORMS).map(([key, platform]) => ({
    key,
    name: platform.name,
    loginUrl: platform.loginUrl
  }));
}

module.exports = {
  publish,
  openLoginBrowser,
  checkLoginStatus,
  getPlatformList,
  stripMarkdown
};
