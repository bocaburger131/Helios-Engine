const fs = require('fs');
const path = require('path');

// Path to the errors file
const errorsFilePath = path.resolve('src/utils/errors.js');

if (fs.existsSync(errorsFilePath)) {
  let content = fs.readFileSync(errorsFilePath, 'utf8');
  
  // Check if LLMError already exists
  if (content.includes('class LLMError')) {
    console.log('LLMError class already exists, updating...');
    // Replace the existing LLMError class
    const llmErrorRegex = /class LLMError[\s\S]*?}/;
    const updatedLLMError = `class LLMError extends AppError {
  constructor(message, statusCode = 500) {
    super(message, statusCode);
    this.name = 'LLMError';
  }
}`;
    
    content = content.replace(llmErrorRegex, updatedLLMError);
  } else {
    console.log('LLMError class not found, adding...');
    // Add the LLMError class at the end of the file
    const llmErrorClass = `
class LLMError extends AppError {
  constructor(message, statusCode = 500) {
    super(message, statusCode);
    this.name = 'LLMError';
  }
}

export { LLMError };`;
    
    // Check if we need to add the export
    if (content.includes('export {')) {
      // There's an existing export statement, let's modify it
      content = content.replace(/export\s*{([^}]*)}/g, (match, exports) => {
        // Add LLMError to the exports if not already there
        if (!exports.includes('LLMError')) {
          return `export {${exports}, LLMError}`;
        }
        return match;
      });
    } else {
      // No export statement, add the class with its own export
      content += llmErrorClass;
    }
  }
  
  // Write the updated content back to the file
  fs.writeFileSync(errorsFilePath, content, 'utf8');
  console.log('✅ Added/Updated LLMError class with custom status code support');
} else {
  console.error('❌ File not found:', errorsFilePath);
}