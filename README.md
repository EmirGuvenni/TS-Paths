# TS-Paths

Replace absolute paths to relative paths after typescript compilation (tsc) during compile-time.

[![npm version](https://badge.fury.io/js/@emirguvenni%2Ftspaths.svg)](https://badge.fury.io/js/@emirguvenni%2Ftspaths)
[![License](http://img.shields.io/:license-mit-blue.svg)](http://doge.mit-license.org)

## Getting Started

First, install tspaths as devDependency using npm or yarn.

```sh
npm install --save-dev @emirguvenni/tspaths
```

or

```sh
yarn add -D @emirguvenni/tspaths
```

## Add it to your build scripts in package.json

```json
"scripts": {
  "build": "tsc -p tsconfig.json && tspaths",
}
```

Then run the build script in the same directory as your tsconfig.json.

# Disclaimer !!!!!

This is an update fork since this project was abandoned. The original project is [tscpaths](https://www.npmjs.com/package/tscpaths).
