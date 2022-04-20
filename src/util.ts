import { dirname, resolve } from 'path';

export interface IRawTSConfig {
  extends?: string;
  compilerOptions?: {
    baseUrl?: string;
    outDir?: string;
    paths?: { [key: string]: string[] };
  };
}

export interface ITSConfig {
  baseUrl?: string;
  outDir?: string;
  paths?: { [key: string]: string[] };
}

export const loadConfig = (file: string): ITSConfig => {
  const {
    extends: ext,
    compilerOptions: { baseUrl, outDir, paths } = {
      baseUrl: undefined,
      outDir: undefined,
      paths: undefined,
    },
  } = require(file) as IRawTSConfig;

  const config: ITSConfig = {};

  if (baseUrl) config.baseUrl = baseUrl;
  if (outDir) config.outDir = outDir;
  if (paths) config.paths = paths;

  if (ext) {
    const parentConfig = loadConfig(resolve(dirname(file), ext));
    return {
      ...parentConfig,
      ...config,
    };
  }

  return config;
};
