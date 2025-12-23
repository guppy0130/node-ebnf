#!/usr/bin/env bun

console.log(`/* AUTO GENERATED CODE USING ebnf NPM MODULE ${new Date().toISOString()}`);

function printUsage() {
  console.error(`Usage:
  ebnf Grammar.ebnf >> myFile.js
       ^^^^^^^^^^^^ Source file`);
}

import { inspect } from 'util';
import { readFileSync } from 'fs';
import path from 'path';
import { Grammars } from '.';

let source: string = process.argv[2];

if (!source || source.length == 0) {
  printUsage();
  throw new Error('You must provide a source file');
}

source = path.resolve(process.cwd(), source);

const sourceCode = readFileSync(source).toString() + '\n';

const RULES = Grammars.Custom.getRules(sourceCode);

console.log(`*/

export const RULES = ${inspect(RULES, { depth: 20, maxArrayLength: null })};`);
