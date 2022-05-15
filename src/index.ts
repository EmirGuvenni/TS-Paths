#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import * as fg from 'fast-glob';

import { loadConfig } from './util';

const configFile = resolve(process.cwd(), 'tsconfig.json');
const { baseUrl, outDir, paths } = loadConfig(configFile);

if (!baseUrl) throw new Error('compilerOptions.baseUrl is not set');
if (!paths) throw new Error('compilerOptions.paths is not set');
if (!outDir) throw new Error('compilerOptions.outDir is not set');

const srcRoot = resolve(baseUrl);
const outRoot = outDir && resolve(outDir);
const configDir = dirname(configFile);
const basePath = resolve(configDir, baseUrl);
const outPath = outRoot || resolve(basePath, outDir);

console.log(`baseUrl: ${baseUrl}`);
console.log(`outDir: ${outDir}`);

console.log(`basePath: ${basePath}`);
console.log(`outPath: ${outPath}`);

const aliases = Object.keys(paths)
  .map((alias) => ({
    prefix: alias.replace(/\*$/, ''),
    aliasPaths: paths[alias as keyof typeof paths].map((p) =>
      resolve(outPath, p.replace(/\*$/, ''))
    ),
  }))
  .filter(({ prefix }) => prefix);

let replaceCount = 0;

const absToRel = (modulePath: string, outFile: string): string => {
  const exts = ['.js', '.jsx', '.ts', '.tsx', '.d.ts', '.json'];

  for (let j = 0; j < aliases.length; j++) {
    const { prefix, aliasPaths } = aliases[j];

    if (modulePath.startsWith(prefix)) {
      const modulePathRel = modulePath.substring(prefix.length);
      const srcFile = resolve(srcRoot, relative(outPath, outFile));
      const outRel = relative(basePath, outFile);

      console.log(`${outRel} (source: ${relative(basePath, srcFile)}):`);

      for (let i = 0; i < aliasPaths.length; i++) {
        const moduleSrc = resolve(aliasPaths[i], modulePathRel);
        if (
          existsSync(moduleSrc) ||
          exts.some((ext) => existsSync(moduleSrc + ext))
        ) {
          const rel = relative(dirname(srcFile), moduleSrc);

          console.log(
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
  const newText = text
    .replace(/(?:import|require)\(['"]([^'"]*)['"]\)/g, (orig, matched) =>
      replaceImportStatement(orig, matched, file)
    )
    .replace(/(?:import|from) ['"]([^'"]*)['"]/g, (orig, matched) =>
      replaceImportStatement(orig, matched, file)
    );

  if (text !== newText) {
    changedFileCount++;
    writeFileSync(file, newText, 'utf8');
  }
}

console.log(`Replaced ${replaceCount} paths in ${changedFileCount} files`);
