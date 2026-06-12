// This is a Node.js ESM loader
import { resolve as pathResolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const baseDir = pathResolve(__dirname, '..');

// This resolves path aliases in ESM
export function resolve(specifier, context, nextResolve) {
  // Replace @ with the actual path to src
  if (specifier.startsWith('@/')) {
    const newSpecifier = specifier.replace('@/', `${baseDir}/src/`);
    return nextResolve(newSpecifier, context);
  }
  
  // Handle #test alias if needed
  if (specifier.startsWith('#test/')) {
    const newSpecifier = specifier.replace('#test/', `${baseDir}/tests/`);
    return nextResolve(newSpecifier, context);
  }
  
  // For all other imports, use the default resolution
  return nextResolve(specifier, context);
}