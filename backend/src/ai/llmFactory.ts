import { ChatOpenAI } from '@langchain/openai';
import { SystemConfig } from '../models/sequelize';
import { GraphModelKey, LLMProvider, resolveGraphProfile } from './runtimeConfig';

export interface AIConfig {
  aiModel: string;
  zhipuApiKey?: string;
  zhipuApiUrl?: string;
  zhipuEmbeddingModel?: string;
  deepseekApiKey?: string;
  deepseekApiUrl?: string;
  minimaxApiKey?: string;
  minimaxApiUrl?: string;
  reviewStrictness?: string;
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  provider?: LLMProvider;
  graph?: GraphModelKey;
  novel?: unknown;
  novelId?: number;
}


export async function getAIConfig(): Promise<AIConfig> {
  const configs = await SystemConfig.findAll();
  const configMap: Record<string, any> = {};

  configs.forEach((c: any) => {
    try {
      configMap[c.config_key] = JSON.parse(c.config_value);
    } catch {
      configMap[c.config_key] = c.config_value;
    }
  });

  return {
    aiModel: configMap.aiModel || process.env.DEFAULT_AI_MODEL || 'minimax',
    zhipuApiKey: configMap.zhipuApiKey || process.env.ZHIPU_API_KEY,
    zhipuApiUrl: configMap.zhipuApiUrl || process.env.ZHIPU_API_URL || 'https://open.bigmodel.cn/api/paas/v4',
    zhipuEmbeddingModel: process.env.ZHIPU_EMBEDDING_MODEL || 'embedding-3',
    deepseekApiKey: configMap.deepseekApiKey || process.env.DEEPSEEK_API_KEY,
    deepseekApiUrl: process.env.DEEPSEEK_API_URL,
    minimaxApiKey: configMap.minimaxApiKey || process.env.MINIMAX_API_KEY,
    minimaxApiUrl: configMap.minimaxApiUrl || process.env.MINIMAX_API_URL || 'https://api.minimaxi.com/v1',
    reviewStrictness: configMap.reviewStrictness || process.env.REVIEW_STRICTNESS || 'strict',
  };
}

export async function createLLM(options: LLMOptions = {}): Promise<ChatOpenAI> {
  const config = await getAIConfig();
  const profile = await resolveGraphProfile({
    provider: options.provider,
    graph: options.graph,
    novel: options.novel,
    novelId: options.novelId,
    fallbackProvider: (config.aiModel as LLMProvider) || 'minimax',
  });
  const provider = profile.provider;
  const model = profile.model;
  const maxTokens = options.maxTokens ?? profile.maxTokens ?? 8000;

  if (provider === 'minimax') {
    return new ChatOpenAI({
      model: model || 'MiniMax-M2.7',
      temperature: options.temperature ?? 0.8,
      maxTokens,
      configuration: { baseURL: config.minimaxApiUrl },
      apiKey: config.minimaxApiKey,
    });
  }

  if (provider === 'deepseek') {
    return new ChatOpenAI({
      model: model || 'deepseek-v4-pro',
      temperature: options.temperature ?? 0.8,
      maxTokens,
      configuration: { baseURL: config.deepseekApiUrl},
      apiKey: config.deepseekApiKey,
    });
  }

  // zhipu
  return new ChatOpenAI({
    model: model || 'glm-5',
    temperature: options.temperature ?? 0.8,
    maxTokens,
    configuration: { baseURL: config.zhipuApiUrl },
    apiKey: config.zhipuApiKey,
  });
}
