// tslint:disable no-console
import { program } from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import * as fg from 'fast-glob';
import { dirname, relative, resolve } from 'path';
import { loadConfig } from './util';

program
  .version('0.0.1')
  .option('-p, --project <file>', 'path to tsconfig.json')
  .option('-s, --src <path>', 'source root path')
  .option('-o, --out <path>', 'output root path')
  .option('-v, --verbose', 'output logs')
  .on('--help', () => {
    console.log(`$ tspaths -p tsconfig.json`);
  })
  .parse();

const { project, src, out, verbose } = program.opts();

if (!project) throw new Error('--project must be specified');
if (!src) throw new Error('--src must be specified');

const configFile = resolve(process.cwd(), project);
const { baseUrl, outDir, paths } = loadConfig(configFile);

if (!baseUrl) throw new Error('compilerOptions.baseUrl is not set');
if (!paths) throw new Error('compilerOptions.paths is not set');
if (!outDir) throw new Error('compilerOptions.outDir is not set');

const srcRoot = resolve(src);
const outRoot = out && resolve(out);
const configDir = dirname(configFile);
const basePath = resolve(configDir, baseUrl);
const outPath = outRoot || resolve(basePath, outDir);

const verboseLog = (...args: any[]): void => {
  if (verbose) console.log(...args);
};

verboseLog(`baseUrl: ${baseUrl}`);
verboseLog(`outDir: ${outDir}`);
verboseLog(`paths: ${JSON.stringify(paths, null, 2)}`);

verboseLog(`basePath: ${basePath}`);
verboseLog(`outPath: ${outPath}`);

const aliases = Object.keys(paths)
  .map((alias) => ({
    prefix: alias.replace(/\*$/, ''),
    aliasPaths: paths[alias as keyof typeof paths].map((p) =>
      resolve(basePath, p.replace(/\*$/, ''))
    ),
  }))
  .filter(({ prefix }) => prefix);
verboseLog(`aliases: ${JSON.stringify(aliases, null, 2)}`);

let replaceCount = 0;

const absToRel = (modulePath: string, outFile: string): string => {
  const exts = ['.js', '.jsx', '.ts', '.tsx', '.d.ts', '.json'];

  for (let j = 0; j < aliases.length; j++) {
    const { prefix, aliasPaths } = aliases[j];

    if (modulePath.startsWith(prefix)) {
      const modulePathRel = modulePath.substring(prefix.length);
      const srcFile = resolve(srcRoot, relative(outPath, outFile));
      const outRel = relative(basePath, outFile);

      verboseLog(`${outRel} (source: ${relative(basePath, srcFile)}):`);
      verboseLog(`\timport '${modulePath}'`);

      for (let i = 0; i < aliasPaths.length; i++) {
        const moduleSrc = resolve(aliasPaths[i], modulePathRel);
        if (
          existsSync(moduleSrc) ||
          exts.some((ext) => existsSync(moduleSrc + ext))
        ) {
          const rel = relative(dirname(srcFile), moduleSrc);

          verboseLog(
            `\treplacing '${modulePath}' -> '${rel}' referencing ${relative(
              basePath,
              moduleSrc
            )}`
          );

          replaceCount++;
          return (rel.startsWith('.') ? rel : `./${rel}`).replace(/\\/g, '/');
        }
      }
      console.log(`could not replace ${modulePath}`);
    }
  }
  return modulePath;
};

const replaceImportStatement = (
  orig: string,
  matched: string,
  outFile: string
): string => {
  const index = orig.indexOf(matched);
  return (
    orig.substring(0, index) +
    absToRel(matched, outFile) +
    orig.substring(index + matched.length)
  );
};

// import relative to absolute path
const files = fg
  .sync(`${outPath}/**/*.{js,jsx,ts,tsx}`, {
    dot: true,
    onlyFiles: true,
  })
  .map((x) => resolve(x));

let changedFileCount = 0;

for (let i = 0; i < files.length; i++) {
  const file = files[i];
  const text = readFileSync(file, 'utf8');
  const prevReplaceCount = replaceCount;
  const newText = text
    .replace(/(?:import|require)\(['"]([^'"]*)['"]\)/g, (orig, matched) =>
      replaceImportStatement(orig, matched, file)
    )
    .replace(/(?:import|from) ['"]([^'"]*)['"]/g, (orig, matched) =>
      replaceImportStatement(orig, matched, file)
    );

  if (text !== newText) {
    changedFileCount++;
    console.log(`${file}: replaced ${replaceCount - prevReplaceCount} paths`);
    writeFileSync(file, newText, 'utf8');
  }
}

console.log(`Replaced ${replaceCount} paths in ${changedFileCount} files`);
