export type ExpectsValidation =
  | { ok: true }
  | { ok: false; error: string };

export function normalizeKvOutput(output: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of output.split("\n")) {
    const match = line.match(/^([A-Z_]+):\s*(.+)$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2].trim();
    if (key === "STORIES_JSON") continue;
    out[key.toLowerCase()] = value;
  }
  return out;
}

export function resolveTemplate(template: string, context: Record<string, any>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_m, key: string) => {
    const raw = context[key] ?? context[key.toLowerCase()];
    if (raw === undefined || raw === null) return `[missing: ${key}]`;
    if (typeof raw === "string") return raw;
    return JSON.stringify(raw);
  });
}

export function parseStoriesJson(output: string): Array<{
  id: string;
  title: string;
  description: string;
  acceptanceCriteria?: string[];
  acceptance_criteria?: string[];
}> | null {
  const lines = output.split("\n");
  const startIdx = lines.findIndex((l) => l.startsWith("STORIES_JSON:"));
  if (startIdx === -1) return null;

  const firstLine = lines[startIdx].slice("STORIES_JSON:".length).trim();
  const jsonLines = [firstLine];
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^[A-Z_]+:\s/.test(lines[i])) break;
    jsonLines.push(lines[i]);
  }
  const jsonText = jsonLines.join("\n").trim();
  if (!jsonText) return null;
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) throw new Error("STORIES_JSON must be an array");
  if (parsed.length > 20) throw new Error(`STORIES_JSON has ${parsed.length} stories, max is 20`);
  return parsed;
}

function parseExpectsKeyValue(expects: string): { key: string; value: string } | null {
  const m = expects.match(/^\s*([A-Z_]+):\s*(.+)\s*$/);
  if (!m) return null;
  return { key: m[1].toLowerCase(), value: m[2].trim() };
}

function parseRegexSpec(spec: string): RegExp | null {
  const s = spec.trim();
  // Accept /pattern/flags form.
  if (s.startsWith("/") && s.lastIndexOf("/") > 0) {
    const last = s.lastIndexOf("/");
    const body = s.slice(1, last);
    const flags = s.slice(last + 1);
    try {
      return new RegExp(body, flags);
    } catch {
      return null;
    }
  }
  // Accept raw pattern (no flags).
  try {
    return new RegExp(s);
  } catch {
    return null;
  }
}

export function validateExpects(expects: string, output: string, kv?: Record<string, string>): ExpectsValidation {
  const exp = (expects ?? "").trim();
  if (!exp) return { ok: true };

  // regex:<spec>
  if (exp.toLowerCase().startsWith("regex:")) {
    const re = parseRegexSpec(exp.slice("regex:".length));
    if (!re) return { ok: false, error: `Invalid expects regex: ${exp}` };
    if (!re.test(output)) return { ok: false, error: `Output does not match expects regex: ${exp}` };
    return { ok: true };
  }

  // KEY: value
  const kvExp = parseExpectsKeyValue(exp);
  if (kvExp) {
    const normalized = kv ?? normalizeKvOutput(output);
    const actual = normalized[kvExp.key];
    if (actual === undefined) {
      return { ok: false, error: `Missing expected key "${kvExp.key}"` };
    }
    if (String(actual).trim() !== kvExp.value) {
      return { ok: false, error: `Expected "${kvExp.key}: ${kvExp.value}", got "${kvExp.key}: ${String(actual).trim()}"` };
    }
    return { ok: true };
  }

  // Fallback: substring containment.
  if (!output.includes(exp)) return { ok: false, error: `Output is missing expected substring: ${exp}` };
  return { ok: true };
}

