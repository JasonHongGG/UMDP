export type DiagnosticsLevel = 'debug' | 'info' | 'warn' | 'error';

export interface DiagnosticsContext {
  [key: string]: unknown;
}

export interface DiagnosticsSerializedError {
  name?: string;
  message: string;
  stack?: string;
}

export interface DiagnosticsEvent {
  level: DiagnosticsLevel;
  channel: string;
  origin: string;
  message: string;
  context?: DiagnosticsContext;
  error?: unknown;
}

export interface DiagnosticsRecord {
  sequence: number;
  timestamp: string;
  level: DiagnosticsLevel;
  channel: string;
  origin: string;
  message: string;
  context?: DiagnosticsContext;
  error?: DiagnosticsSerializedError;
}

export interface DiagnosticsPolicy {
  enabled: boolean;
  minimumLevel: DiagnosticsLevel;
  channels: string[] | null;
  origins: string[] | null;
  consoleOutput: boolean;
  captureBuffer: boolean;
  maxBufferEntries: number;
}

export interface DiagnosticsRuntimeOverride extends Partial<DiagnosticsPolicy> {}

export interface DiagnosticsSink {
  name: string;
  write: (record: DiagnosticsRecord) => void;
}

export interface DiagnosticsConfiguration {
  policy?: Partial<DiagnosticsPolicy>;
  sinks?: DiagnosticsSink[];
  clearBuffer?: boolean;
}

export interface DiagnosticsLogDetails {
  channel?: string;
  context?: DiagnosticsContext;
  error?: unknown;
}

export interface DiagnosticsLogger {
  debug: (message: string, details?: DiagnosticsLogDetails) => DiagnosticsRecord;
  info: (message: string, details?: DiagnosticsLogDetails) => DiagnosticsRecord;
  warn: (message: string, details?: DiagnosticsLogDetails) => DiagnosticsRecord;
  error: (message: string, details?: DiagnosticsLogDetails) => DiagnosticsRecord;
  child: (context: DiagnosticsContext) => DiagnosticsLogger;
}

interface DiagnosticsLoggerOptions {
  channel: string;
  origin: string;
  context?: DiagnosticsContext;
}

export interface DiagnosticsGlobalControls {
  storageKey: string;
  enable: (override?: Partial<Omit<DiagnosticsPolicy, 'enabled'>>) => DiagnosticsPolicy;
  disable: () => DiagnosticsPolicy;
  clearBuffer: () => void;
  getBuffer: () => DiagnosticsRecord[];
  getPolicy: () => DiagnosticsPolicy;
  refresh: () => DiagnosticsPolicy;
}

export const DIAGNOSTICS_STORAGE_KEY = 'unity-mono-studio.debug.diagnostics';

const DIAGNOSTICS_LEVEL_ORDER: Record<DiagnosticsLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_DIAGNOSTICS_POLICY: DiagnosticsPolicy = {
  enabled: false,
  minimumLevel: 'debug',
  channels: null,
  origins: null,
  consoleOutput: false,
  captureBuffer: false,
  maxBufferEntries: 200,
};

let diagnosticsPolicy = resolveDiagnosticsPolicy();
let diagnosticsBuffer: DiagnosticsRecord[] = [];
let diagnosticsSequence = 0;
let diagnosticsSinks: DiagnosticsSink[] = [createConsoleDiagnosticsSink()];

function hasWindow() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function cloneContext(context?: DiagnosticsContext) {
  return context ? { ...context } : undefined;
}

function cloneError(error?: DiagnosticsSerializedError) {
  return error ? { ...error } : undefined;
}

function toDiagnosticsLevel(value: unknown): DiagnosticsLevel | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  switch (value.trim().toLowerCase()) {
    case 'debug':
    case 'info':
    case 'warn':
    case 'error':
      return value.trim().toLowerCase() as DiagnosticsLevel;
    default:
      return undefined;
  }
}

function parseBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  switch (value.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
    case 'enabled':
      return true;
    case '0':
    case 'false':
    case 'no':
    case 'off':
    case 'disabled':
      return false;
    default:
      return undefined;
  }
}

function parseStringList(value: unknown) {
  if (Array.isArray(value)) {
    const next = value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean);
    return next.length > 0 ? next : null;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const next = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return next.length > 0 ? next : null;
}

function parseNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizePolicy(policy: Partial<DiagnosticsPolicy>): DiagnosticsPolicy {
  return {
    enabled: policy.enabled ?? DEFAULT_DIAGNOSTICS_POLICY.enabled,
    minimumLevel: toDiagnosticsLevel(policy.minimumLevel) ?? DEFAULT_DIAGNOSTICS_POLICY.minimumLevel,
    channels: policy.channels && policy.channels.length > 0 ? [...policy.channels] : null,
    origins: policy.origins && policy.origins.length > 0 ? [...policy.origins] : null,
    consoleOutput: policy.consoleOutput ?? DEFAULT_DIAGNOSTICS_POLICY.consoleOutput,
    captureBuffer: policy.captureBuffer ?? DEFAULT_DIAGNOSTICS_POLICY.captureBuffer,
    maxBufferEntries: Math.max(1, parseNumber(policy.maxBufferEntries) ?? DEFAULT_DIAGNOSTICS_POLICY.maxBufferEntries),
  };
}

function parseRuntimeOverride(value: unknown): DiagnosticsRuntimeOverride | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const next = value as Record<string, unknown>;
  const override: DiagnosticsRuntimeOverride = {};
  const enabled = parseBoolean(next.enabled);
  const minimumLevel = toDiagnosticsLevel(next.minimumLevel);
  const channels = parseStringList(next.channels);
  const origins = parseStringList(next.origins);
  const consoleOutput = parseBoolean(next.consoleOutput);
  const captureBuffer = parseBoolean(next.captureBuffer);
  const maxBufferEntries = parseNumber(next.maxBufferEntries);

  if (enabled !== undefined) {
    override.enabled = enabled;
  }
  if (minimumLevel) {
    override.minimumLevel = minimumLevel;
  }
  if (channels !== undefined) {
    override.channels = channels;
  }
  if (origins !== undefined) {
    override.origins = origins;
  }
  if (consoleOutput !== undefined) {
    override.consoleOutput = consoleOutput;
  }
  if (captureBuffer !== undefined) {
    override.captureBuffer = captureBuffer;
  }
  if (maxBufferEntries !== undefined) {
    override.maxBufferEntries = maxBufferEntries;
  }

  return Object.keys(override).length > 0 ? override : null;
}

function readEnvironmentOverride(): DiagnosticsRuntimeOverride {
  const override: DiagnosticsRuntimeOverride = {};
  const enabled = parseBoolean(import.meta.env.UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS);
  const minimumLevel = toDiagnosticsLevel(import.meta.env.UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS_LEVEL);
  const channels = parseStringList(import.meta.env.UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS_CHANNELS);
  const origins = parseStringList(import.meta.env.UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS_ORIGINS);
  const consoleOutput = parseBoolean(import.meta.env.UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS_CONSOLE);
  const captureBuffer = parseBoolean(import.meta.env.UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS_BUFFER);
  const maxBufferEntries = parseNumber(import.meta.env.UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS_MAX_BUFFER);

  if (enabled !== undefined) {
    override.enabled = enabled;
  }
  if (minimumLevel) {
    override.minimumLevel = minimumLevel;
  }
  if (channels !== undefined) {
    override.channels = channels;
  }
  if (origins !== undefined) {
    override.origins = origins;
  }
  if (consoleOutput !== undefined) {
    override.consoleOutput = consoleOutput;
  }
  if (captureBuffer !== undefined) {
    override.captureBuffer = captureBuffer;
  }
  if (maxBufferEntries !== undefined) {
    override.maxBufferEntries = maxBufferEntries;
  }

  return override;
}

function readStoredOverride() {
  if (!hasWindow()) {
    return null;
  }

  const raw = window.localStorage.getItem(DIAGNOSTICS_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  const enabled = parseBoolean(raw);
  if (enabled !== undefined) {
    return { enabled } satisfies DiagnosticsRuntimeOverride;
  }

  try {
    return parseRuntimeOverride(JSON.parse(raw));
  } catch {
    return null;
  }
}

function resolveDiagnosticsPolicy() {
  const envOverride = readEnvironmentOverride();
  const storedOverride = readStoredOverride() ?? undefined;
  const merged = normalizePolicy({
    ...DEFAULT_DIAGNOSTICS_POLICY,
    ...envOverride,
    ...storedOverride,
  });
  const enabled = storedOverride?.enabled ?? envOverride.enabled ?? merged.enabled;

  if (enabled) {
    if (envOverride.consoleOutput === undefined && storedOverride?.consoleOutput === undefined) {
      merged.consoleOutput = true;
    }
    if (envOverride.captureBuffer === undefined && storedOverride?.captureBuffer === undefined) {
      merged.captureBuffer = true;
    }
  }

  return merged;
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function serializeError(error: unknown): DiagnosticsSerializedError | undefined {
  if (error === undefined) {
    return undefined;
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: typeof error === 'string' ? error : safeStringify(error) ?? String(error),
  };
}

function mergeContext(left?: DiagnosticsContext, right?: DiagnosticsContext) {
  if (!left && !right) {
    return undefined;
  }

  const merged = {
    ...(left ?? {}),
    ...(right ?? {}),
  };

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function matchesPolicy(record: DiagnosticsRecord, policy: DiagnosticsPolicy) {
  if (!policy.enabled) {
    return false;
  }

  if (DIAGNOSTICS_LEVEL_ORDER[record.level] < DIAGNOSTICS_LEVEL_ORDER[policy.minimumLevel]) {
    return false;
  }

  if (policy.channels && !policy.channels.includes(record.channel)) {
    return false;
  }

  if (policy.origins && !policy.origins.includes(record.origin)) {
    return false;
  }

  return true;
}

function consoleMethodForLevel(level: DiagnosticsLevel) {
  switch (level) {
    case 'debug':
      return 'log';
    case 'info':
      return 'info';
    case 'warn':
      return 'warn';
    case 'error':
      return 'error';
  }
}

function buildConsolePayload(record: DiagnosticsRecord) {
  if (!record.context && !record.error) {
    return undefined;
  }

  return {
    context: record.context,
    error: record.error,
    sequence: record.sequence,
    timestamp: record.timestamp,
  };
}

function createConsoleDiagnosticsSink(): DiagnosticsSink {
  return {
    name: 'console',
    write(record) {
      const method = consoleMethodForLevel(record.level);
      const prefix = `[diag][${record.channel}][${record.origin}] ${record.message}`;
      const payload = buildConsolePayload(record);

      if (payload) {
        console[method](prefix, payload);
        return;
      }

      console[method](prefix);
    },
  };
}

function appendToBuffer(record: DiagnosticsRecord) {
  diagnosticsBuffer.push(record);

  if (diagnosticsBuffer.length > diagnosticsPolicy.maxBufferEntries) {
    diagnosticsBuffer.splice(0, diagnosticsBuffer.length - diagnosticsPolicy.maxBufferEntries);
  }
}

function writeToSinks(record: DiagnosticsRecord) {
  diagnosticsSinks.forEach((sink) => {
    try {
      sink.write(record);
    } catch {
      return;
    }
  });
}

function createRecord(event: DiagnosticsEvent): DiagnosticsRecord {
  diagnosticsSequence += 1;

  return {
    sequence: diagnosticsSequence,
    timestamp: new Date().toISOString(),
    level: event.level,
    channel: event.channel,
    origin: event.origin,
    message: event.message,
    context: cloneContext(event.context),
    error: serializeError(event.error),
  };
}

function installGlobalControls() {
  if (!hasWindow() || !import.meta.env.DEV) {
    return;
  }

  window.__UNITY_MONO_STUDIO_DIAGNOSTICS__ = {
    storageKey: DIAGNOSTICS_STORAGE_KEY,
    enable(override) {
      return setDiagnosticsRuntimeOverride({
        ...override,
        enabled: true,
      });
    },
    disable() {
      return setDiagnosticsRuntimeOverride({ enabled: false });
    },
    clearBuffer() {
      clearDiagnosticsBuffer();
    },
    getBuffer() {
      return getDiagnosticsBuffer();
    },
    getPolicy() {
      return getDiagnosticsPolicy();
    },
    refresh() {
      return refreshDiagnosticsPolicy();
    },
  } satisfies DiagnosticsGlobalControls;
}

export function emitDiagnostic(event: DiagnosticsEvent) {
  const record = createRecord(event);

  if (!matchesPolicy(record, diagnosticsPolicy)) {
    return record;
  }

  if (diagnosticsPolicy.captureBuffer) {
    appendToBuffer(record);
  }

  if (diagnosticsPolicy.consoleOutput) {
    writeToSinks(record);
  }

  return record;
}

export function createDiagnosticsLogger({ channel, origin, context }: DiagnosticsLoggerOptions): DiagnosticsLogger {
  const write = (level: DiagnosticsLevel, message: string, details?: DiagnosticsLogDetails) => emitDiagnostic({
    level,
    channel: details?.channel ?? channel,
    origin,
    message,
    context: mergeContext(context, details?.context),
    error: details?.error,
  });

  return {
    debug(message, details) {
      return write('debug', message, details);
    },
    info(message, details) {
      return write('info', message, details);
    },
    warn(message, details) {
      return write('warn', message, details);
    },
    error(message, details) {
      return write('error', message, details);
    },
    child(nextContext) {
      return createDiagnosticsLogger({
        channel,
        origin,
        context: mergeContext(context, nextContext),
      });
    },
  };
}

export function configureDiagnostics(configuration: DiagnosticsConfiguration = {}) {
  if (configuration.clearBuffer) {
    clearDiagnosticsBuffer();
  }

  if (configuration.policy) {
    diagnosticsPolicy = normalizePolicy({
      ...diagnosticsPolicy,
      ...configuration.policy,
    });
  }

  if (configuration.sinks) {
    diagnosticsSinks = [...configuration.sinks];
  }

  installGlobalControls();
  return getDiagnosticsPolicy();
}

export function refreshDiagnosticsPolicy() {
  diagnosticsPolicy = resolveDiagnosticsPolicy();
  installGlobalControls();
  return getDiagnosticsPolicy();
}

export function getDiagnosticsPolicy(): DiagnosticsPolicy {
  return {
    ...diagnosticsPolicy,
    channels: diagnosticsPolicy.channels ? [...diagnosticsPolicy.channels] : null,
    origins: diagnosticsPolicy.origins ? [...diagnosticsPolicy.origins] : null,
  };
}

export function getDiagnosticsBuffer() {
  return diagnosticsBuffer.map((record) => ({
    ...record,
    context: cloneContext(record.context),
    error: cloneError(record.error),
  }));
}

export function clearDiagnosticsBuffer() {
  diagnosticsBuffer = [];
}

export function setDiagnosticsRuntimeOverride(override: DiagnosticsRuntimeOverride | null) {
  if (hasWindow()) {
    if (!override) {
      window.localStorage.removeItem(DIAGNOSTICS_STORAGE_KEY);
    } else {
      window.localStorage.setItem(DIAGNOSTICS_STORAGE_KEY, JSON.stringify(override));
    }
  }

  return refreshDiagnosticsPolicy();
}

export function resetDiagnosticsStateForTests() {
  if (hasWindow()) {
    window.localStorage.removeItem(DIAGNOSTICS_STORAGE_KEY);
    delete window.__UNITY_MONO_STUDIO_DIAGNOSTICS__;
  }

  diagnosticsSequence = 0;
  diagnosticsBuffer = [];
  diagnosticsSinks = [createConsoleDiagnosticsSink()];
  diagnosticsPolicy = { ...DEFAULT_DIAGNOSTICS_POLICY };
  installGlobalControls();
}

installGlobalControls();