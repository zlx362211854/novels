import { ChatOpenAI } from '@langchain/openai';
import { SystemConfig } from '../models/sequelize';

export interface AIConfig {
  aiModel: string;
  zhipuApiKey?: string;
  zhipuApiUrl?: string;
  deepseekApiKey?: string;
  deepseekApiUrl?: string;
  reviewStrictness?: string;
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  provider?: 'deepseek' | 'zhipu';
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
    aiModel: configMap.aiModel || process.env.DEFAULT_AI_MODEL || 'deepseek',
    zhipuApiKey: configMap.zhipuApiKey || process.env.ZHIPU_API_KEY,
    zhipuApiUrl: process.env.ZHIPU_API_URL,
    deepseekApiKey: configMap.deepseekApiKey || process.env.DEEPSEEK_API_KEY,
    deepseekApiUrl: process.env.DEEPSEEK_API_URL,
    reviewStrictness: configMap.reviewStrictness || process.env.REVIEW_STRICTNESS || 'strict',
  };
}

export async function createLLM(options: LLMOptions = {}): Promise<ChatOpenAI> {
  const config = await getAIConfig();
  const provider = options.provider || (config.aiModel as 'deepseek' | 'zhipu') || 'deepseek';

  if (provider === 'deepseek') {
    return new ChatOpenAI({
      model: 'deepseek-chat',
      temperature: options.temperature ?? 0.8,
      maxTokens: options.maxTokens ?? 8000,
      configuration: { baseURL: config.deepseekApiUrl },
      apiKey: config.deepseekApiKey,
    });
  }

  return new ChatOpenAI({
    model: 'glm-5',
    temperature: options.temperature ?? 0.8,
    maxTokens: options.maxTokens ?? 8000,
    configuration: { baseURL: config.zhipuApiUrl },
    apiKey: config.zhipuApiKey,
  });
}
