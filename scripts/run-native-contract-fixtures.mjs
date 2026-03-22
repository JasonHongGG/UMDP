import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const repoRoot = process.cwd();
const projectFile = join(repoRoot, 'tools', 'UnityMonoBridge', 'UnityMonoBridge.vcxproj');
const fixtureDir = join(repoRoot, 'contract-fixtures', 'native');
const exePath = join(repoRoot, 'tools', 'UnityMonoBridge', 'build', 'x64', 'Debug', 'UnityMonoBridge.exe');

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function resolveMsBuild() {
  const vswhere = join(process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  if (existsSync(vswhere)) {
    const result = spawnSync(vswhere, [
      '-latest',
      '-products', '*',
      '-requires', 'Microsoft.Component.MSBuild',
      '-find', 'MSBuild/**/Bin/MSBuild.exe',
    ], { encoding: 'utf8' });
    const candidate = result.stdout?.trim();
    if (candidate) {
      return candidate;
    }
  }

  const fallbacks = [
    'C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/MSBuild/Current/Bin/MSBuild.exe',
    'C:/Program Files/Microsoft Visual Studio/2022/BuildTools/MSBuild/Current/Bin/MSBuild.exe',
  ];

  return fallbacks.find((path) => existsSync(path)) ?? null;
}

if (process.platform !== 'win32') {
  console.log('Skipping native contract fixtures: UnityMonoBridge build is Windows-only.');
  process.exit(0);
}

const msbuild = resolveMsBuild();
if (!msbuild) {
  console.error('MSBuild not found. Cannot validate UnityMonoBridge native fixtures.');
  process.exit(1);
}

run(msbuild, [projectFile, '-t:Build', '-p:Configuration=Debug', '-p:Platform=x64', '-nologo']);
run(exePath, ['--validate-fixtures', fixtureDir]);