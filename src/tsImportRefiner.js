const fs = require('fs');
const ts = require('typescript');
const path = require('path');

/**
 * Find the closest tsconfig.json file to a given file path.
 * @param {string} filePath - The path of the file.
 * @returns {string|null} The path to the closest tsconfig.json or null if not found.
 */
function findClosestTsConfig(filePath) {
    let currentDir = path.dirname(path.resolve(filePath));
    while (currentDir !== path.parse(currentDir).root) {
        const candidate = path.join(currentDir, 'tsconfig.json');
        if (fs.existsSync(candidate)) {
            return candidate;
        }
        currentDir = path.dirname(currentDir);
    }
    return null;
}

/**
 * Get compiler options from a tsconfig file.
 * @param {string} tsconfigPath - Path to the tsconfig file.
 * @returns {object} Compiler options object.
 */
function getCompilerOptions(tsconfigPath) {
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    return ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(tsconfigPath),
    ).options;
}

/**
 * Convert module paths to aliases based on tsconfig paths.
 * @param {string} tsconfigPath - Path to the tsconfig file.
 * @param {string} filePath - The file path of the current file.
 * @param {string} importPath - The original import path.
 * @returns {string} The aliased path, or the original path if no alias found.
 */
function convertToAlias(tsconfigPath, filePath, importPath) {
    if (!tsconfigPath) {
        return importPath;
    }

    const compilerOptions = getCompilerOptions(tsconfigPath);

    if (!compilerOptions.paths) {
        return importPath;
    }

    const mappings = compilerOptions.paths;
    const baseUrl = compilerOptions.baseUrl || '.';

    const result = ts.resolveModuleName(
        importPath,
        filePath,
        compilerOptions,
        ts.sys,
    );

    if (result.resolvedModule && !result.resolvedModule.isExternalLibraryImport) {
        let resolvedPath = path
            .resolve(result.resolvedModule.resolvedFileName)
            .replace(/\\/g, '/');
        const projectRoot = path
            .resolve(path.dirname(tsconfigPath), baseUrl)
            .replace(/\\/g, '/');
        const relativeResolvedPath = resolvedPath.startsWith(projectRoot)
            ? resolvedPath.substring(projectRoot.length + 1)
            : resolvedPath;

        const sortedAliases = Object.keys(mappings).sort((a, b) => b.length - a.length);

        for (const alias of sortedAliases) {
            const aliasKey = alias.replace('*', '');
            const aliasPaths = mappings[alias].map(p => p.replace('*', ''));

            for (const aliasPath of aliasPaths) {
                if (relativeResolvedPath.startsWith(aliasPath)) {
                    const relativePath = relativeResolvedPath.substring(aliasPath.length);
                    let optimizedPath = aliasKey + relativePath;

                    optimizedPath = optimizedPath
                        .replace(/\/index\.[^\/]+$/, '')
                        .replace(/\.[^/.]+$/, '');

                    return optimizedPath;
                }
            }
        }
    }

    return importPath;
}

module.exports = function (fileInfo, api) {
    if (
        fileInfo.path.includes('node_modules') ||
        fileInfo.path.endsWith('declarations.d.ts')
    ) {
        return fileInfo.source;
    }

    const j = api.jscodeshift.withParser('tsx');
    const tsconfigPath = findClosestTsConfig(fileInfo.path);
    if (tsconfigPath == null) {
        return fileInfo.source;
    }
    const root = j(fileInfo.source);

    let importDeclarations = root
        .find(j.ImportDeclaration)
        .map(path => {
            const currentPath = path.node.source.value;
            const aliasPath = convertToAlias(
                tsconfigPath,
                fileInfo.path,
                currentPath,
            );

            // Create a new import declaration node with the updated path
            path.node.source.value = aliasPath;
            return path;
        })
        .nodes();

    // Optimize sorting by pre-calculating source lengths
    importDeclarations.sort(
        (a, b) => j(a).toSource().length - j(b).toSource().length,
    );

    root.find(j.ImportDeclaration).remove();
    root.get().node.program.body.unshift(...importDeclarations);

    return root.toSource({quote: 'single'});
};
