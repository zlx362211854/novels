import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';

export function strictJsonOutputRules(options: { allowExtraText?: boolean } = {}): string {
  const rules = [
    '输出必须是合法 JSON，不要加 markdown 代码块。',
    'JSON 的 key 和字符串边界必须使用英文半角双引号 "。',
    '字符串内容里引用原文、称谓、短语时，禁止直接使用未转义的英文双引号；请改用中文引号“”或把英文双引号写成 \\"。',
  ];
  if (!options.allowExtraText) {
    rules.push('不要输出 JSON 之外的解释文字。');
  }
  return rules.join('\n');
}

export function stripCodeFences(content: string): string {
  let result = content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/```(?:json)?/g, '')
    .trim();
  while (result.includes('<think>')) {
    const start = result.indexOf('<think>');
    const end = result.indexOf('</think>', start);
    if (end === -1) break;
    result = result.slice(0, start) + result.slice(end + 7);
  }
  return result.trim();
}

export function extractJsonObject(content: string): string {
  const text = stripCodeFences(content);
  const objStart = text.indexOf('{');
  const arrStart = text.indexOf('[');

  // Pick whichever delimiter comes first
  const isArray = arrStart !== -1 && (objStart === -1 || arrStart < objStart);
  const start = isArray ? arrStart : objStart;
  if (start === -1) return '';

  const openChar = isArray ? '[' : '{';
  const closeChar = isArray ? ']' : '}';

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) { escaped = false; }
      else if (char === '\\') { escaped = true; }
      else if (char === '"') { inString = false; }
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === openChar) depth++;
    if (char === closeChar) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return text.slice(start);
}

export function repairCommonJsonIssues(content: string): string {
  const normalized = content
    .replace(/\uff0c/g, ',')
    .replace(/\uff1a/g, ':')
    .replace(/```(?:json)?/g, '')
    .trim();

  const lines = normalized.split('\n');
  const repairedLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (repairedLines.length > 0 && /^"[^"]+"\s*:/.test(trimmed)) {
      const previous = repairedLines[repairedLines.length - 1];
      if (/("|\]|\}|null|true|false|\d)\s*$/.test(previous.trim()) && !previous.trim().endsWith(',')) {
        repairedLines[repairedLines.length - 1] = `${previous},`;
      }
    }
    repairedLines.push(line);
  }

  return repairedLines.join('\n').replace(/,\s*([}\]])/g, '$1');
}

export function parseJson(content: string): any {
  const jsonText = extractJsonObject(content);
  if (!jsonText) throw new Error('响应中缺少 JSON');
  return JSON.parse(repairCommonJsonIssues(jsonText));
}

export async function parseJsonWithRepair(
  rawContent: string,
  llm: ChatOpenAI,
  repairPromptBuilder: (raw: string) => string
): Promise<any> {
  try {
    return parseJson(rawContent);
  } catch {
    console.error('JSON 解析失败，尝试修复...');
    const repaired = await llm.invoke([new HumanMessage(repairPromptBuilder(rawContent))]);
    return parseJson(repaired.content as string);
  }
}
