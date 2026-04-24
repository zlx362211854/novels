import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'path';
import * as fs from 'node:fs';
import { SystemConfig } from '../models/sequelize';
import * as qimao from './platforms/qimao';
import * as fanqie from './platforms/fanqie';

const execFileAsync = promisify(execFile);

const PLATFORMS: Record<string, any> = { qimao, fanqie };
const SCREENSHOT_DIR = path.join(process.cwd(), 'data', 'screenshots');

async function getAgentBrowserPath(): Promise<string> {
  const config = await SystemConfig.findOne({ where: { config_key: 'agentBrowserPath' } });
  if (config) { try { return JSON.parse(config.config_value); } catch { return config.config_value; } }
  return 'agent-browser';
}

async function getChromeProfile(): Promise<string> {
  const config = await SystemConfig.findOne({ where: { config_key: 'chromeProfile' } });
  if (config) { try { return JSON.parse(config.config_value); } catch { return config.config_value; } }
  return 'Profile 2';
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function stripMarkdown(content: string): string {
  if (!content) return '';
  return content
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[(.+?)\]\(.*?\)/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/---+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function publish(platformKey: string, chapter: any, platformConfig: any, signal?: AbortSignal, mode = 'publish'): Promise<any> {
  const platform = PLATFORMS[platformKey];
  if (!platform) throw new Error(`未知平台: ${platformKey}`);
  const agentBrowser = await getAgentBrowserPath();
  const run = async (cmd: string, ...args: string[]) => {
    if (signal?.aborted) throw Object.assign(new Error('已取消'), { name: 'AbortError' });
    const fullArgs = [cmd, ...args, '--auto-connect'];
    console.log(`[publish] ${platformKey}: ${cmd} ${args.join(' ')}`);
    const { stdout } = await execFileAsync(agentBrowser, fullArgs, { timeout: 60000, signal, maxBuffer: 1024 * 1024 });
    return stdout;
  };
  const chapterData = { title: chapter.title || `第${chapter.chapter_number}章`, chapterNumber: chapter.chapter_number, plainContent: stripMarkdown(chapter.content) };
  const steps = mode === 'draft' ? platform.getDraftSteps(platformConfig.workId, chapterData) : platform.getPublishSteps(platformConfig.workId, chapterData);
  for (const step of steps) {
    console.log(`[publish] ${platformKey}: step ${step.label}`);
    await step.execute(run);
  }
  return { status: 'success', success: true, platform: platformKey };
}

async function openLoginBrowser(platformKey: string): Promise<any> {
  const agentBrowser = await getAgentBrowserPath();
  await execFileAsync(agentBrowser, ['open', platformKey], { timeout: 30000 });
  return { success: true };
}

function checkLoginStatus(platformKey: string): any {
  return { loggedIn: true, platform: platformKey };
}

function getPlatformList(): string[] {
  return Object.keys(PLATFORMS);
}

export { publish, openLoginBrowser, checkLoginStatus, getPlatformList };
