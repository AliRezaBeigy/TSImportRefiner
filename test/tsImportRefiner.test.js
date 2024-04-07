const fs = require('fs');
const os = require('os');
const path = require('path');
const jscodeshift = require('jscodeshift');
const transform = require('../src/tsImportRefiner');

function createTempDir() {
    let tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsImportRefiner-'));
    fs.mkdirSync(path.join(tempDir, 'some-path1'));
    fs.writeFileSync(path.join(tempDir, 'some-path1', 'test.js'), '');
    fs.mkdirSync(path.join(tempDir, 'some-path2'));
    fs.writeFileSync(path.join(tempDir, 'some-path2', 'test.js'), '');
    return tempDir;
}

function createTsConfig(aliases, tempDir) {
    const tsConfigPath = path.join(tempDir, 'tsconfig.json');
    const tsConfig = {
        compilerOptions: {
            baseUrl: ".",
            paths: aliases
        }
    };
    fs.writeFileSync(tsConfigPath, JSON.stringify(tsConfig, null, 2));
    return tsConfigPath;
}

function deleteTempDir(tempDir) {
    if (tempDir && fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir, {recursive: true});
    }
}

function applyTransform(source, tempDir) {
    const j = jscodeshift.withParser('tsx');
    const fileInfo = {source, path: path.join(tempDir, 'test-file.ts')};
    fs.writeFileSync(fileInfo.path, source);
    const api = {
        jscodeshift: j, stats: () => {
        }
    };
    return transform(fileInfo, api);
}

describe('tsImportRefiner', () => {
    it('should convert aliased imports correctly', () => {
        const tempDir = createTempDir();
        createTsConfig({
            "some-alias/*": ["some-path1/*"]
        }, tempDir);

        const source = `import something from 'some-path1/test';`;
        const expected = `import something from 'some-alias/test';`;
        const result = applyTransform(source, tempDir);

        expect(result).toBe(expected);

        deleteTempDir(tempDir);
    });

    it('should handle multiple aliases correctly', () => {
        const tempDir = createTempDir();
        createTsConfig({
            "alias1/*": ["some-path1/*"],
            "alias2/*": ["some-path2/*"]
        }, tempDir);

        const source = `import mod1 from 'some-path1/test'; import mod2 from 'some-path2/test';`;
        const expected = `import mod1 from 'alias1/test'; import mod2 from 'alias2/test';`;
        const result = applyTransform(source, tempDir);

        expect(result).toBe(expected);
        deleteTempDir(tempDir);
    });

    it('should keep non-aliased imports unchanged', () => {
        const tempDir = createTempDir();
        createTsConfig({
            "some-alias/*": ["some-path/*"]
        }, tempDir);

        const source = `import something from 'unaliased-path/test';`;
        const expected = `import something from 'unaliased-path/test';`;
        const result = applyTransform(source, tempDir);

        expect(result).toBe(expected);
        deleteTempDir(tempDir);
    });
});
