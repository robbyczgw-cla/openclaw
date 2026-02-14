import os from "node:os";
import path from "node:path";
import { expandHomePrefix, resolveRequiredHomeDir } from "../../infra/home-dir.js";
import { DEFAULT_AGENT_ID, normalizeAgentId } from "../../routing/session-key.js";
import { resolveStateDir } from "../paths.js";

function resolveAgentSessionsDir(
  agentId?: string,
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = () => resolveRequiredHomeDir(env, os.homedir),
): string {
  const root = resolveStateDir(env, homedir);
  const id = normalizeAgentId(agentId ?? DEFAULT_AGENT_ID);
  return path.join(root, "agents", id, "sessions");
}

export function resolveSessionTranscriptsDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = () => resolveRequiredHomeDir(env, os.homedir),
): string {
  return resolveAgentSessionsDir(DEFAULT_AGENT_ID, env, homedir);
}

export function resolveSessionTranscriptsDirForAgent(
  agentId?: string,
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = () => resolveRequiredHomeDir(env, os.homedir),
): string {
  return resolveAgentSessionsDir(agentId, env, homedir);
}

export function resolveDefaultSessionStorePath(agentId?: string): string {
  return path.join(resolveAgentSessionsDir(agentId), "sessions.json");
}

export type SessionFilePathOptions = {
  agentId?: string;
  sessionsDir?: string;
};

export function resolveSessionFilePathOptions(params: {
  agentId?: string;
  storePath?: string;
}): SessionFilePathOptions | undefined {
  const storePath = params.storePath?.trim();
  if (storePath) {
    return { sessionsDir: path.dirname(path.resolve(storePath)) };
  }
  const agentId = params.agentId?.trim();
  if (agentId) {
    return { agentId };
  }
  return undefined;
}

export const SAFE_SESSION_ID_RE = /^[a-z0-9][a-z0-9._:+-]{0,127}$/i;

const SAFE_FILE_ID_BYTE_RE = /^[a-z0-9_-]$/i;

export function dotQuote(value: string): string {
  const bytes = Buffer.from(value, "utf8");
  let encoded = "";
  for (const byte of bytes) {
    const char = String.fromCharCode(byte);
    if (SAFE_FILE_ID_BYTE_RE.test(char)) {
      encoded += char;
    } else {
      encoded += `.${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return encoded;
}

export function dotUnquote(value: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    const next = value.slice(i + 1, i + 3);
    if (char === "." && /^[0-9A-Fa-f]{2}$/.test(next)) {
      bytes.push(Number.parseInt(next, 16));
      i += 2;
      continue;
    }
    bytes.push(char.charCodeAt(0));
  }
  return Buffer.from(bytes).toString("utf8");
}

export function validateSessionId(sessionId: string): string {
  const trimmed = sessionId.trim();
  if (!SAFE_SESSION_ID_RE.test(trimmed)) {
    throw new Error(`Invalid session ID: ${sessionId}`);
  }
  return trimmed;
}

function resolveSessionsDir(opts?: SessionFilePathOptions): string {
  const sessionsDir = opts?.sessionsDir?.trim();
  if (sessionsDir) {
    return path.resolve(sessionsDir);
  }
  return resolveAgentSessionsDir(opts?.agentId);
}

function resolvePathWithinSessionsDir(sessionsDir: string, candidate: string): string {
  const trimmed = candidate.trim();
  if (!trimmed) {
    throw new Error("Session file path must not be empty");
  }
  const resolvedBase = path.resolve(sessionsDir);
  // Normalize absolute paths that are within the sessions directory.
  // Older versions stored absolute sessionFile paths in sessions.json;
  // convert them to relative so the containment check passes.
  const normalized = path.isAbsolute(trimmed) ? path.relative(resolvedBase, trimmed) : trimmed;
  if (!normalized || normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new Error("Session file path must be within sessions directory");
  }
  return path.resolve(resolvedBase, normalized);
}

export function resolveSessionTranscriptPathInDir(
  sessionId: string,
  sessionsDir: string,
  topicId?: string | number,
): string {
  const safeSessionId = validateSessionId(sessionId);
  const safeSessionFileId = dotQuote(safeSessionId);
  const safeTopicId =
    typeof topicId === "string"
      ? dotQuote(topicId)
      : typeof topicId === "number"
        ? String(topicId)
        : undefined;
  const fileName =
    safeTopicId !== undefined
      ? `${safeSessionFileId}-topic-${safeTopicId}.jsonl`
      : `${safeSessionFileId}.jsonl`;
  return resolvePathWithinSessionsDir(sessionsDir, fileName);
}

export function resolveSessionTranscriptPath(
  sessionId: string,
  agentId?: string,
  topicId?: string | number,
): string {
  return resolveSessionTranscriptPathInDir(sessionId, resolveAgentSessionsDir(agentId), topicId);
}

export function resolveSessionFilePath(
  sessionId: string,
  entry?: { sessionFile?: string },
  opts?: SessionFilePathOptions,
): string {
  const sessionsDir = resolveSessionsDir(opts);
  const candidate = entry?.sessionFile?.trim();
  if (candidate) {
    return resolvePathWithinSessionsDir(sessionsDir, candidate);
  }
  return resolveSessionTranscriptPathInDir(sessionId, sessionsDir);
}

export function resolveStorePath(store?: string, opts?: { agentId?: string }) {
  const agentId = normalizeAgentId(opts?.agentId ?? DEFAULT_AGENT_ID);
  if (!store) {
    return resolveDefaultSessionStorePath(agentId);
  }
  if (store.includes("{agentId}")) {
    const expanded = store.replaceAll("{agentId}", agentId);
    if (expanded.startsWith("~")) {
      return path.resolve(
        expandHomePrefix(expanded, {
          home: resolveRequiredHomeDir(process.env, os.homedir),
          env: process.env,
          homedir: os.homedir,
        }),
      );
    }
    return path.resolve(expanded);
  }
  if (store.startsWith("~")) {
    return path.resolve(
      expandHomePrefix(store, {
        home: resolveRequiredHomeDir(process.env, os.homedir),
        env: process.env,
        homedir: os.homedir,
      }),
    );
  }
  return path.resolve(store);
}
