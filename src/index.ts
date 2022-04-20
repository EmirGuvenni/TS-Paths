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
  .option('-v, --verbose', 'output logs');

program.on('--help', () => {
  console.log(`$ tscpath -p tsconfig.json`);
});

program.parse();

const { project, src, out, verbose } = program.opts();

if (!project) throw new Error('--project must be specified');
if (!src) throw new Error('--src must be specified');

const verboseLog = (...args: any[]): void => {
  if (verbose) console.log(...args);
};

const configFile = resolve(process.cwd(), project);
const srcRoot = resolve(src);
const outRoot = out && resolve(out);

console.log(
  `tscpaths --project ${configFile} --src ${srcRoot} --out ${outRoot}`
);

const { baseUrl, outDir, paths } = loadConfig(configFile);

if (!baseUrl) throw new Error('compilerOptions.baseUrl is not set');
if (!paths) throw new Error('compilerOptions.paths is not set');
if (!outDir) throw new Error('compilerOptions.outDir is not set');

verboseLog(`baseUrl: ${baseUrl}`);
verboseLog(`outDir: ${outDir}`);
verboseLog(`paths: ${JSON.stringify(paths, null, 2)}`);

const configDir = dirname(configFile);

const basePath = resolve(configDir, baseUrl);
verboseLog(`basePath: ${basePath}`);

const outPath = outRoot || resolve(basePath, outDir);
verboseLog(`outPath: ${outPath}`);

const outFileToSrcFile = (x: string): string =>
  resolve(srcRoot, relative(outPath, x));

const aliases = Object.keys(paths)
  .map((alias) => ({
    prefix: alias.replace(/\*$/, ''),
    aliasPaths: paths[alias as keyof typeof paths].map((p) =>
      resolve(basePath, p.replace(/\*$/, ''))
    ),
  }))
  .filter(({ prefix }) => prefix);
verboseLog(`aliases: ${JSON.stringify(aliases, null, 2)}`);

const toRelative = (from: string, x: string): string => {
  const rel = relative(from, x);
  return (rel.startsWith('.') ? rel : `./${rel}`).replace(/\\/g, '/');
};

const exts = ['.js', '.jsx', '.ts', '.tsx', '.d.ts', '.json'];

let replaceCount = 0;

const absToRel = (modulePath: string, outFile: string): string => {
  for (let j = 0; j < aliases.length; j++) {
    const { prefix, aliasPaths } = aliases[j];

    if (modulePath.startsWith(prefix)) {
      const modulePathRel = modulePath.substring(prefix.length);
      const srcFile = outFileToSrcFile(outFile);
      const outRel = relative(basePath, outFile);
      verboseLog(`${outRel} (source: ${relative(basePath, srcFile)}):`);
      verboseLog(`\timport '${modulePath}'`);
      for (let i = 0; i < aliasPaths.length; i++) {
        const moduleSrc = resolve(aliasPaths[i], modulePathRel);
        if (
          existsSync(moduleSrc) ||
          exts.some((ext) => existsSync(moduleSrc + ext))
        ) {
          const rel = toRelative(dirname(srcFile), moduleSrc);
          replaceCount++;
          verboseLog(
            `\treplacing '${modulePath}' -> '${rel}' referencing ${relative(
              basePath,
              moduleSrc
            )}`
          );
          return rel;
        }
      }
      console.log(`could not replace ${modulePath}`);
    }
  }
  return modulePath;
};

const requireRegex = /(?:import|require)\(['"]([^'"]*)['"]\)/g;
const importRegex = /(?:import|from) ['"]([^'"]*)['"]/g;

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

const replaceAlias = (text: string, outFile: string): string =>
  text
    .replace(requireRegex, (orig, matched) =>
      replaceImportStatement(orig, matched, outFile)
    )
    .replace(importRegex, (orig, matched) =>
      replaceImportStatement(orig, matched, outFile)
    );

// import relative to absolute path
const files = fg.sync(`${outPath}/**/*.{js,jsx,ts,tsx}`, {
  dot: true,
  onlyFiles: true,
}).map((x) => resolve(x));

let changedFileCount = 0;

for (let i = 0; i < files.length; i++) {
  const file = files[i];
  const text = readFileSync(file, 'utf8');
  const prevReplaceCount = replaceCount;
  const newText = replaceAlias(text, file);
  if (text !== newText) {
    changedFileCount++;
    console.log(`${file}: replaced ${replaceCount - prevReplaceCount} paths`);
    writeFileSync(file, newText, 'utf8');
  }
}

console.log(`Replaced ${replaceCount} paths in ${changedFileCount} files`);
