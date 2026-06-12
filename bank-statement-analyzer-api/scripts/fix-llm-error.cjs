const fs = require('fs');
const path = require('path');

// Path to the errors utility file
const errorsFilePath = path.resolve('src/utils/errors.js');

if (fs.existsSync(errorsFilePath)) {
  let content = fs.readFileSync(errorsFilePath, 'utf8');
  
  // Find the LLMError class
  const llmErrorMatch = content.match(/class\s+LLMError\s+extends\s+AppError\s*{[^}]*}/);
  
  if (llmErrorMatch) {
    const llmErrorClass = llmErrorMatch[0];
    
    // Check if we need to modify the constructor
    if (llmErrorClass.includes('super(message, 500)')) {
      // Replace hardcoded 500 with statusCode parameter
      const modifiedLLMError = llmErrorClass.replace(
        /constructor\s*\(\s*message\s*\)\s*{[^}]*}/,
        'constructor(message, statusCode = 500) {\n        super(message, statusCode);\n        this.name = \'LLMError\';\n    }'
      );
      
      content = content.replace(llmErrorClass, modifiedLLMError);
      fs.writeFileSync(errorsFilePath, content, 'utf8');
      console.log(`✅ Modified LLMError constructor to accept custom status codes in ${errorsFilePath}`);
    } else {
      console.log(`ℹ️ No changes needed for LLMError constructor in ${errorsFilePath}`);
    }
  } else {
    console.log(`⚠️ LLMError class not found in ${errorsFilePath}`);
  }
} else {
  console.error(`❌ File not found: ${errorsFilePath}`);
}