// ESM compatible module-alias setup
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import moduleAlias from 'module-alias';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Register the module aliases
moduleAlias.addAliases({
  '@': resolve(__dirname, '..')  // Points to project root, so '@/src' works
});

// Log registered aliases using a safe approach
console.log('Module aliases registered:', { '@': resolve(__dirname, '..') });

// Export individual functions and the module
export const getAliases = () => ({ '@': resolve(__dirname, '..') });
export const addAliases = moduleAlias.addAliases;

// Export the module as default
export default moduleAlias;