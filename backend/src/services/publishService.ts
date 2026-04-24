import { Chapter, Novel, SystemConfig } from '../models/sequelize';
import * as publishAgent from '../agents/publishAgent';
import * as aiStatus from './aiStatusService';

interface PlatformConfig {
    [key: string]: {
        enabled?: boolean;
        workId?: string;
        [key: string]: any;
    };
}

interface PublishResult {
    status: string;
    error?: string;
    [key: string]: any;
}

async function getPlatformConfig(): Promise<PlatformConfig> {
    const row = await SystemConfig.findOne({ where: { config_key: 'publishPlatforms' } });
    if (!row) return {};
    try { return JSON.parse((row as any).config_value); } catch { return {}; }
}

function parseJsonConfig(raw: string | null): Record<string, any> {
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return {}; }
}

async function publishChapter(chapterId: number | string, platforms: string[], signal?: AbortSignal, mode = 'publish'): Promise<any> {
    const chapter = await Chapter.findByPk(chapterId);
    if (!chapter) throw new Error('章节不存在');
    if (!chapter.content || !chapter.content.trim()) {
        throw new Error('章节正文为空，无法发布');
    }

    const platformConfig = await getPlatformConfig();
    const novel = await Novel.findByPk(chapter.novel_id);
    const novelPublishConfig = parseJsonConfig((novel as any)?.publish_config || null);
    const taskId = `publish-${chapterId}-${Date.now()}`;
    const stepLabels = platforms.map(p => `发布到${p}`);

    aiStatus.start(taskId, `发布「${chapter.title || '章节'}」`, stepLabels);

    const results: Record<string, any> = {};
    let hasError = false;

    try {
        for (let i = 0; i < platforms.length; i++) {
            const platformKey = platforms[i];
            aiStatus.step(taskId, i, stepLabels[i]);

            const config = platformConfig[platformKey];
            const workId = novelPublishConfig[platformKey]?.workId;
            if (!config || !config.enabled) {
                results[platformKey] = { status: 'skipped', error: '平台未启用或未配置' };
                continue;
            }
            if (!workId) {
                results[platformKey] = { status: 'skipped', error: '当前小说未配置该平台作品 ID' };
                continue;
            }

            const result = await publishAgent.publish(platformKey, chapter, { ...config, workId }, signal, mode);
            results[platformKey] = result;

            if (result.status === 'failed') hasError = true;
        }

        const existingResult = parsePublishResult(chapter.publish_result);
        const merged = { ...existingResult, ...results };
        chapter.publish_result = JSON.stringify(merged);
        await chapter.save();

        if (hasError) {
            aiStatus.error(taskId, '部分平台发布失败');
        } else {
            aiStatus.finish(taskId);
        }

        return { chapterId, results: merged };
    } catch (err: any) {
        aiStatus.error(taskId, err.message);
        throw err;
    }
}

async function openLoginBrowser(platformKey: string): Promise<any> {
    return publishAgent.openLoginBrowser(platformKey);
}

function checkLoginStatus(platformKey: string): any {
    return publishAgent.checkLoginStatus(platformKey);
}

function platformName(platformKey: string): string {
    const names: Record<string, string> = {
        qimao: '七猫小说',
        fanqie: '番茄小说',
    };
    return names[platformKey] || platformKey;
}

async function getAvailablePlatforms(): Promise<any[]> {
    const config = await getPlatformConfig();
    return publishAgent.getPlatformList().map((key) => ({
        key,
        name: platformName(key),
        enabled: Boolean(config[key]?.enabled),
        ...checkLoginStatus(key),
    }));
}

function parsePublishResult(raw: string | null): Record<string, any> {
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return {}; }
}

export {
    publishChapter,
    openLoginBrowser,
    checkLoginStatus,
    getAvailablePlatforms,
    getPlatformConfig
};
