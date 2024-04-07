#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

const transformerPath = path.join(__dirname, 'tsImportRefiner.js');

const args = process.argv.slice(2).join(' ');

try {
    const command = `jscodeshift -t ${transformerPath} ${args}`;
    execSync(command, { stdio: 'inherit' });
} catch (error) {
    console.error(`Error executing jscodeshift: ${error}`);
    process.exit(1);
}