import { SystemConfig } from '../models/sequelize';

interface Config {
  aiModel?: string;
  zhipuApiKey?: string;
  zhipuApiUrl?: string;
  deepseekApiKey?: string;
  deepseekApiUrl?: string;
}

interface ExtractOptions {
  skipRepairOnParseFailure?: boolean;
}

async function getConfig(): Promise<Config> {
  const configs = await SystemConfig.findAll();
  const configMap: any = {};

  configs.forEach((config: any) => {
    try {
      configMap[config.config_key] = JSON.parse(config.config_value);
    } catch {
      configMap[config.config_key] = config.config_value;
    }
  });

  return {
    aiModel: configMap.aiModel || process.env.DEFAULT_AI_MODEL || 'zhipu',
    zhipuApiKey: configMap.zhipuApiKey || process.env.ZHIPU_API_KEY,
    zhipuApiUrl: process.env.ZHIPU_API_URL,
    deepseekApiKey: configMap.deepseekApiKey || process.env.DEEPSEEK_API_KEY,
    deepseekApiUrl: process.env.DEEPSEEK_API_URL
  };
}

function buildMemoryPrompt({ chapter, novel, architecture }: any): string {
  return `你是一位长篇小说审校助手。请从下面章节中提取"硬逻辑记忆卡"，只记录明确出现或可以直接推出的事实，不要脑补。

## 小说信息
标题：${novel.title}
类型：${novel.genre || '未指定'}

## 章节信息
章节标题：${chapter.title || '未命名'}
章节序号：${chapter.chapter_number}

## 架构信息（仅辅助理解，若与正文冲突，以正文为准）
${formatArchitecture(architecture)}

## 章节正文
${chapter.content || ''}

请返回 JSON，结构必须完全符合：
{
  "summary": "string",
  "entities": {
    "characters": ["string"],
    "locations": ["string"],
    "items": ["string"],
    "organizations": ["string"]
  },
  "facts": [
    {
      "type": "character_state|relationship|world_rule|knowledge|timeline|item_state",
      "subject": "string",
      "predicate": "string",
      "object": "string",
      "status": "active|resolved|uncertain",
      "evidence": "string"
    }
  ],
  "state_changes": [
    {
      "entity": "string",
      "field": "string",
      "before": "string",
      "after": "string",
      "evidence": "string"
    }
  ],
  "open_threads": [
    {
      "thread": "string",
      "status": "opened|advanced|resolved",
      "evidence": "string"
    }
  ],
  "source_excerpt_map": [
    {
      "label": "string",
      "excerpt": "string"
    }
  ]
}

要求：
1. evidence 和 excerpt 必须来自正文的短原句，不要改写过度
2. 没有的字段返回空数组，不要省略
3. 只保留和硬逻辑相关的信息
4. 输出必须是合法 JSON，不要加 markdown 代码块
5. 所有字符串必须使用英文半角双引号 "
6. summary、evidence、excerpt、thread 尽量简短，避免冗长`;
}

function formatArchitecture(architecture: any): string {
  if (!architecture) return '无架构设定';

  let info = `层级: ${architecture.level}\n标题: ${architecture.title}\n`;
  if (architecture.plot_outline) info += `情节大纲: ${architecture.plot_outline}\n`;
  if (architecture.characters) info += `人物设定: ${architecture.characters}\n`;
  if (architecture.world_setting) info += `世界观: ${architecture.world_setting}\n`;
  if (architecture.emotional_tone) info += `情感基调: ${architecture.emotional_tone}\n`;
  return info;
}

function extractJson(content: string): any {
  const jsonText = extractJsonObject(content);
  if (!jsonText) {
    throw new Error('记忆卡响应中缺少 JSON');
  }
  return JSON.parse(repairCommonJsonIssues(jsonText));
}

function startProgressLog(label: string, signal?: AbortSignal): () => void {
  const start = Date.now();
  const timer = setInterval(() => {
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`[AI] ${label} 生成中... 已等待 ${elapsed}s`);
  }, 5000);
  signal?.addEventListener('abort', () => clearInterval(timer), { once: true });
  return () => clearInterval(timer);
}

function getAIClient(config: Config, signal?: AbortSignal): any {
  if (config.aiModel === 'deepseek') {
    return {
      generate: async (prompt: string, options: any = {}) => {
        const label = options.label || 'deepseek-chat (chapter-memory)';
        console.log(`[AI] 开始调用 ${label}`);
        const stop = startProgressLog(label, signal);
        try {
          const response = await fetch(config.deepseekApiUrl!, {
            method: 'POST',
            signal,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.deepseekApiKey}`
            },
            body: JSON.stringify({
              model: 'deepseek-chat',
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.2,
              max_tokens: 8000
            })
          });

          if (!response.ok) {
            throw new Error(`DeepSeek API错误: ${response.status}`);
          }

          const data = await response.json() as any;
          console.log(`[AI] ${label} 返回完成`);
          return data.choices[0].message.content;
        } finally {
          stop();
        }
      }
    };
  }

  return {
    generate: async (prompt: string, options: any = {}) => {
      const label = options.label || 'glm-4 (chapter-memory)';
      console.log(`[AI] 开始调用 ${label}`);
      const stop = startProgressLog(label, signal);
      try {
        const response = await fetch(config.zhipuApiUrl!, {
          method: 'POST',
          signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.zhipuApiKey}`
          },
          body: JSON.stringify({
            model: 'glm-4',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,
            max_tokens: 8000
          })
        });

        if (!response.ok) {
          throw new Error(`智谱AI API错误: ${response.status}`);
        }

        const data = await response.json() as any;
        console.log(`[AI] ${label} 返回完成`);
        return data.choices[0].message.content;
      } finally {
        stop();
      }
    }
  };
}

async function extractMemoryCard({ chapter, novel, architecture }: any, signal?: AbortSignal, options: ExtractOptions = {}): Promise<any> {
  const config = await getConfig();
  const aiClient = getAIClient(config, signal);
  const prompt = buildMemoryPrompt({ chapter, novel, architecture });
  const response = await aiClient.generate(prompt, {
    label: config.aiModel === 'deepseek'
      ? 'deepseek-chat (chapter-memory)'
      : 'glm-4 (chapter-memory)'
  });
  try {
    return extractJson(response);
  } catch (error: any) {
    console.error('解析记忆卡失败:', error.message);
    console.error('原始记忆卡输出片段:', snippetForLog(response));
    if (options.skipRepairOnParseFailure) {
      throw error;
    }

    const repaired = await aiClient.generate(buildRepairPrompt(response), {
      label: config.aiModel === 'deepseek'
        ? 'deepseek-chat (chapter-memory-repair)'
        : 'glm-4 (chapter-memory-repair)'
    });
    try {
      return extractJson(repaired);
    } catch (repairError: any) {
      console.error('解析修复后的记忆卡失败:', repairError.message);
      console.error('修复后记忆卡输出片段:', snippetForLog(repaired));
      throw repairError;
    }
  }
}

function normalizeJsonLikeString(content: string): string {
  return content
    .replace(/\uff0c/g, ',')
    .replace(/\uff1a/g, ':');
}

function repairCommonJsonIssues(content: string): string {
  const normalized = normalizeJsonLikeString(stripCodeFences(content));
  const lines = normalized.split('\n');
  const repairedLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (repairedLines.length > 0 && startsWithJsonKey(trimmed)) {
      const previous = repairedLines[repairedLines.length - 1];
      if (endsWithJsonValue(previous) && !previous.trim().endsWith(',')) {
        repairedLines[repairedLines.length - 1] = `${previous},`;
      }
    }
    repairedLines.push(line);
  }

  return repairedLines
    .join('\n')
    .replace(/,\s*([}\]])/g, '$1');
}

function stripCodeFences(content: string): string {
  return content.replace(/```(?:json)?/g, '').trim();
}

function startsWithJsonKey(line: string): boolean {
  return /^"[^"]+"\s*:/.test(line);
}

function endsWithJsonValue(line: string): boolean {
  const trimmed = line.trim();
  return /("|\]|\}|null|true|false|\d)\s*$/.test(trimmed);
}

function extractJsonObject(content: string): string {
  const text = stripCodeFences(content);
  const start = text.indexOf('{');
  if (start === -1) return '';

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return text.slice(start);
}

function snippetForLog(content: string): string {
  return (content || '').slice(0, 800);
}

function buildRepairPrompt(rawResult: string): string {
  return `请把下面这段"本来想输出为JSON，但格式损坏了"的文本，修复成合法 JSON。

要求：
1. 只能输出 JSON
2. 保持原有语义，不要添加新结论
3. 所有字符串必须使用英文半角双引号 "
4. 结构必须保持为章节记忆卡：
{
  "summary": "",
  "entities": {
    "characters": [],
    "locations": [],
    "items": [],
    "organizations": []
  },
  "facts": [],
  "state_changes": [],
  "open_threads": [],
  "source_excerpt_map": []
}

待修复文本：
${rawResult}`;
}

export {
  extractMemoryCard,
  extractJson
};