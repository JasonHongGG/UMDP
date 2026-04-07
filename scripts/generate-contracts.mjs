import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENERATED_FILE_BANNER, canonicalContracts } from '../contracts/canonical/definitions.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const checkOnly = process.argv.includes('--check');

function camelToSnake(value) {
  return value.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function renderTsEnum(definition) {
  return [
    `export type ${definition.name} =`,
    ...definition.values.map((value, index) => `  | '${value.ts}'${index === definition.values.length - 1 ? ';' : ''}`),
  ].join('\n');
}

function renderTsInterface(definition) {
  const generic = definition.generic ?? '';
  return [
    `export interface ${definition.name}${generic} {`,
    ...definition.fields.map((field) => `  ${field.name}: ${field.tsType};`),
    '}',
  ].join('\n');
}

function renderRustEnum(definition) {
  const derives = definition.rustDerives.join(', ');
  const lines = [
    `#[derive(${derives})]`,
    `#[serde(rename_all = "${definition.rustRenameAll}")]`,
    `pub enum ${definition.name} {`,
    ...definition.values.map((value) => `    ${value.rust},`),
    '}',
  ];

  if (definition.defaultRustVariant) {
    lines.push('', `impl Default for ${definition.name} {`, '    fn default() -> Self {', `        Self::${definition.defaultRustVariant}`, '    }', '}');
  }

  return lines.join('\n');
}

function renderRustStruct(definition) {
  const derives = definition.rustDerives.join(', ');
  const generic = definition.generic ?? '';
  const lines = [
    `#[derive(${derives})]`,
    `#[serde(rename_all = "${definition.rustRenameAll}")]`,
    `pub struct ${definition.name}${generic} {`,
    ...definition.fields.map((field) => `    pub ${camelToSnake(field.name)}: ${field.rustType},`),
    '}',
  ];

  if (definition.defaultRust) {
    lines.push('', `impl Default for ${definition.name}${generic} {`, '    fn default() -> Self {', '        Self {');
    for (const field of definition.fields) {
      lines.push(`            ${camelToSnake(field.name)}: ${definition.defaultRust[field.name]},`);
    }
    lines.push('        }', '    }', '}');
  }

  return lines.join('\n');
}

function renderTsWorkspace(contract) {
  const body = [];
  body.push(GENERATED_FILE_BANNER);
  body.push('');
  body.push(...contract.tsImports);
  body.push('');
  for (const definition of contract.enums) {
    body.push(renderTsEnum(definition), '');
  }
  for (const definition of contract.structs) {
    body.push(renderTsInterface(definition), '');
  }
  body.push(
    'export const CURRENT_SYSTEM_CONTRACT_VERSIONS = {',
    `  tauriCommandVersion: ${contract.versions.tauriCommandVersion},`,
    `  analysisSchemaVersion: ${contract.versions.analysisSchemaVersion},`,
    `  workflowSchemaVersion: ${contract.versions.workflowSchemaVersion},`,
    '} as const satisfies SystemContractVersions;',
    '',
    'export function currentSystemContractVersions(): SystemContractVersions {',
    '  return { ...CURRENT_SYSTEM_CONTRACT_VERSIONS };',
    '}',
  );
  return `${body.join('\n')}\n`;
}

function renderRustWorkspace(contract) {
  const body = [];
  body.push(GENERATED_FILE_BANNER);
  body.push('');
  body.push(...contract.rustImports);
  body.push('');
  for (const definition of contract.enums) {
    body.push(renderRustEnum(definition), '');
  }
  for (const definition of contract.structs) {
    body.push(renderRustStruct(definition), '');
  }
  body.push(
    'pub const CURRENT_SYSTEM_CONTRACT_VERSIONS: SystemContractVersions = SystemContractVersions {',
    `    tauri_command_version: ${contract.versions.tauriCommandVersion},`,
    `    analysis_schema_version: ${contract.versions.analysisSchemaVersion},`,
    `    workflow_schema_version: ${contract.versions.workflowSchemaVersion},`,
    '};',
    '',
    'pub fn current_contract_versions() -> SystemContractVersions {',
    '    CURRENT_SYSTEM_CONTRACT_VERSIONS.clone()',
    '}',
  );
  return `${body.join('\n')}\n`;
}

function renderTsOperation(contract) {
  const body = [];
  body.push(GENERATED_FILE_BANNER, '');
  for (const definition of contract.enums) {
    body.push(renderTsEnum(definition), '');
  }
  for (const definition of contract.structs) {
    body.push(renderTsInterface(definition), '');
  }
  body.push(
    'export interface CommandSuccessEnvelope<T> {',
    '  ok: true;',
    '  data: T;',
    '  error: null;',
    '  feedback: OperationFeedbackEnvelope | null;',
    '}',
    '',
    'export interface CommandFailureEnvelope {',
    '  ok: false;',
    '  data: null;',
    '  error: OperationErrorEnvelope;',
    '  feedback: OperationFeedbackEnvelope | null;',
    '}',
    '',
    'export type CommandEnvelope<T> = CommandSuccessEnvelope<T> | CommandFailureEnvelope;',
  );
  return `${body.join('\n')}\n`;
}

function renderRustOperation(contract) {
  const body = [];
  body.push(GENERATED_FILE_BANNER, '');
  body.push(...contract.rustImports, '');
  for (const definition of contract.enums) {
    body.push(renderRustEnum(definition), '');
  }
  for (const definition of contract.structs) {
    body.push(renderRustStruct(definition), '');
  }
  body.push(
    '#[derive(Debug, Clone, Serialize)]',
    '#[serde(rename_all = "camelCase")]',
    'pub struct CommandEnvelope<T> {',
    '    pub ok: bool,',
    '    pub data: Option<T>,',
    '    pub error: Option<OperationErrorEnvelope>,',
    '    pub feedback: Option<OperationFeedbackEnvelope>,',
    '}',
  );
  return `${body.join('\n')}\n`;
}

function syncFile(relativePath, content) {
  const filePath = resolve(repoRoot, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });

  let previous = null;
  try {
    previous = readFileSync(filePath, 'utf8');
  } catch {
    previous = null;
  }

  if (previous === content) {
    return false;
  }

  if (checkOnly) {
    throw new Error(`Generated contract drift detected: ${relativePath}`);
  }

  writeFileSync(filePath, content, 'utf8');
  return true;
}

function main() {
  const outputs = [
    ['src/shared/contracts/generated/workspace.generated.ts', renderTsWorkspace(canonicalContracts.workspace)],
    ['src/shared/contracts/generated/operation.generated.ts', renderTsOperation(canonicalContracts.operation)],
    ['src-tauri/src/generated/contracts/workspace.rs', renderRustWorkspace(canonicalContracts.workspace)],
    ['src-tauri/src/generated/contracts/operation.rs', renderRustOperation(canonicalContracts.operation)],
  ];

  const changed = outputs.filter(([relativePath, content]) => syncFile(relativePath, content));
  if (!checkOnly) {
    const summary = changed.length === 0 ? 'No contract artifacts changed.' : `Updated ${changed.length} generated contract artifact(s).`;
    console.log(summary);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}