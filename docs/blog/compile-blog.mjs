#!/usr/bin/env bun
/*
 * Compiles agentic-software-factory.md and template/ into agentic-software-factory.html, without the draft comment layer.
 * The compiler is the html-with-comments skill's script; run it without --final to get the comment layer back.
 */
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const blogDirectory = dirname(fileURLToPath(import.meta.url));
const compileScript = join(homedir(), '.claude', 'skills', 'html-with-comments', 'scripts', 'compile-markdown-page.mjs');
const compileRun = spawnSync('bun', [compileScript, join(blogDirectory, 'agentic-software-factory.md'), '--final'], { stdio: 'inherit' });
process.exit(compileRun.status ?? 1);
