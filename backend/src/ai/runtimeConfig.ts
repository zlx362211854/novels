import { Op } from 'sequelize';
import { Novel, SystemConfig } from '../models/sequelize';

export const GRAPH_MODEL_KEYS = [
  'architectureGeneration',
  'chapterBatchGeneration',
  'chapterGeneration',
  'chapterReview',
  'chapterRevision',
  'chapterTune',
  'memoryExtraction',
  'memoryRepair',
  'memoryTimeSequence',
  'crossChapterReview',
  'multiChapterFix',
  'architectureReview',
  'architectureRewrite',
  'architectureRepair',
] as const;

export type LLMProvider = 'deepseek' | 'zhipu' | 'minimax';
export type GraphModelKey = typeof GRAPH_MODEL_KEYS[number];

export interface LLMProfile {
  provider: LLMProvider;
  model?: string;
  maxTokens?: number;
}

interface RuntimeConfigRecord {
  aiModel?: LLMProvider;
  aiProfile?: LLMProfile;
  graphModels?: Partial<Record<GraphModelKey, LLMProfile>>;
  chapterGenerationPromptTemplate?: string;
}

export interface NovelAiConfig extends RuntimeConfigRecord {
  defaultModel?: LLMProvider;
  defaultProfile?: LLMProfile;
}

function isProvider(value: unknown): value is LLMProvider {
  return value === 'deepseek' || value === 'zhipu' || value === 'minimax';
}

function normalizeMaxTokens(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

function normalizeProfile(value: unknown): LLMProfile | undefined {
  if (isProvider(value)) {
    return { provider: value };
  }
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const provider = (value as Record<string, unknown>).provider;
  if (!isProvider(provider)) {
    return undefined;
  }
  const model = typeof (value as Record<string, unknown>).model === 'string'
    ? ((value as Record<string, unknown>).model as string).trim()
    : '';
  return {
    provider,
    model: model || undefined,
    maxTokens: normalizeMaxTokens((value as Record<string, unknown>).maxTokens),
  };
}

function normalizeGraphModels(value: unknown): Partial<Record<GraphModelKey, LLMProfile>> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const result: Partial<Record<GraphModelKey, LLMProfile>> = {};
  for (const key of GRAPH_MODEL_KEYS) {
    const profile = normalizeProfile((value as Record<string, unknown>)[key]);
    if (profile) {
      result[key] = profile;
    }
  }
  return result;
}

function parseJsonString(value: unknown): any {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function parseNovelAiConfig(value: unknown): NovelAiConfig {
  const parsed = parseJsonString(value);
  if (!parsed || typeof parsed !== 'object') {
    return {
      defaultModel: undefined,
      defaultProfile: undefined,
      graphModels: {},
      chapterGenerationPromptTemplate: '',
    };
  }

  const defaultProfile = normalizeProfile(parsed.defaultProfile)
    || normalizeProfile(parsed.defaultModel)
    || normalizeProfile(parsed.aiProfile);

  return {
    defaultModel: defaultProfile?.provider || (isProvider(parsed.defaultModel) ? parsed.defaultModel : undefined),
    defaultProfile,
    graphModels: normalizeGraphModels(parsed.graphModels),
    chapterGenerationPromptTemplate:
      typeof parsed.chapterGenerationPromptTemplate === 'string'
        ? parsed.chapterGenerationPromptTemplate
        : '',
  };
}

export function serializeNovelAiConfig(config: NovelAiConfig | undefined): string | null {
  if (!config) return null;

  const graphModels = normalizeGraphModels(config.graphModels);
  const payload: NovelAiConfig = {
    defaultModel: isProvider(config.defaultModel) ? config.defaultModel : undefined,
    defaultProfile: normalizeProfile(config.defaultProfile) || normalizeProfile(config.defaultModel),
    graphModels,
    chapterGenerationPromptTemplate:
      typeof config.chapterGenerationPromptTemplate === 'string'
        ? config.chapterGenerationPromptTemplate
        : '',
  };

  if (!payload.defaultProfile && !payload.defaultModel && Object.keys(graphModels).length === 0 && !payload.chapterGenerationPromptTemplate) {
    return null;
  }

  return JSON.stringify(payload);
}

export async function getSystemRuntimeConfig(): Promise<RuntimeConfigRecord> {
  const configs = await SystemConfig.findAll({
    where: {
      config_key: {
        [Op.in]: ['aiModel', 'aiProfile', 'graphModels', 'chapterGenerationPromptTemplate'],
      },
    },
  });

  const result: RuntimeConfigRecord = {
    aiModel: undefined,
    aiProfile: undefined,
    graphModels: {},
    chapterGenerationPromptTemplate: '',
  };

  configs.forEach((config: any) => {
    let value: any = config.config_value;
    try {
      value = JSON.parse(config.config_value);
    } catch {}

    if (config.config_key === 'aiModel' && isProvider(value)) {
      result.aiModel = value;
      return;
    }

    if (config.config_key === 'aiProfile') {
      result.aiProfile = normalizeProfile(value);
      return;
    }

    if (config.config_key === 'graphModels') {
      result.graphModels = normalizeGraphModels(value);
      return;
    }

    if (config.config_key === 'chapterGenerationPromptTemplate' && typeof value === 'string') {
      result.chapterGenerationPromptTemplate = value;
    }
  });

  return result;
}

async function loadNovelRecord(novelOrId?: unknown): Promise<any | null> {
  if (!novelOrId) return null;
  if (typeof novelOrId === 'object' && novelOrId !== null) {
    return novelOrId;
  }
  return await Novel.findByPk(novelOrId as any);
}

export async function resolveGraphProvider(options: {
  provider?: LLMProvider;
  graph?: GraphModelKey;
  novel?: unknown;
  novelId?: number;
  fallback?: LLMProvider;
}): Promise<LLMProvider> {
  if (isProvider(options.provider)) {
    return options.provider;
  }

  const fallback = options.fallback || 'minimax';
  const graph = options.graph;
  const novel = await loadNovelRecord(options.novel ?? options.novelId);
  const novelConfig = novel ? parseNovelAiConfig((novel as any).ai_config) : null;
  const systemConfig = await getSystemRuntimeConfig();

  if (graph && novelConfig?.graphModels?.[graph]?.provider) {
    return novelConfig.graphModels[graph]!.provider;
  }
  if (novelConfig?.defaultProfile?.provider) {
    return novelConfig.defaultProfile.provider;
  }
  if (novelConfig?.defaultModel) {
    return novelConfig.defaultModel;
  }
  if (graph && systemConfig.graphModels?.[graph]?.provider) {
    return systemConfig.graphModels[graph]!.provider;
  }
  if (systemConfig.aiProfile?.provider) {
    return systemConfig.aiProfile.provider;
  }
  if (systemConfig.aiModel) {
    return systemConfig.aiModel;
  }

  return fallback;
}

export async function resolveGraphProfile(options: {
  provider?: LLMProvider;
  graph?: GraphModelKey;
  novel?: unknown;
  novelId?: number;
  fallbackProvider?: LLMProvider;
}): Promise<LLMProfile> {
  if (isProvider(options.provider)) {
    return { provider: options.provider };
  }

  const novel = await loadNovelRecord(options.novel ?? options.novelId);
  const novelConfig = novel ? parseNovelAiConfig((novel as any).ai_config) : null;
  const systemConfig = await getSystemRuntimeConfig();

  if (options.graph && novelConfig?.graphModels?.[options.graph]) {
    return novelConfig.graphModels[options.graph]!;
  }
  if (novelConfig?.defaultProfile) {
    return novelConfig.defaultProfile;
  }
  if (options.graph && systemConfig.graphModels?.[options.graph]) {
    return systemConfig.graphModels[options.graph]!;
  }
  if (systemConfig.aiProfile) {
    return systemConfig.aiProfile;
  }

  const provider = await resolveGraphProvider({
    provider: options.provider,
    graph: options.graph,
    novel,
    novelId: options.novelId,
    fallback: options.fallbackProvider,
  });
  return { provider };
}

export async function resolveChapterGenerationPromptTemplate(novelOrId?: unknown): Promise<string> {
  const novel = await loadNovelRecord(novelOrId);
  const novelConfig = novel ? parseNovelAiConfig((novel as any).ai_config) : null;
  if (novelConfig?.chapterGenerationPromptTemplate) {
    return novelConfig.chapterGenerationPromptTemplate;
  }

  const systemConfig = await getSystemRuntimeConfig();
  return systemConfig.chapterGenerationPromptTemplate || '';
}
