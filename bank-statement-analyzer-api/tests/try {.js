try {
  // Use a replacer function to inspect each matched hook
  content = content.replace(hookRegex, (matchedBlock) => {
    // Check if the block contains any of our database keywords
    const isDbHook = dbKeywords.some(keyword => matchedBlock.includes(keyword));
    
    if (isDbHook) {
      console.log(`  - Found a database hook to comment out in: ${path.basename(filePath)}`);
      // If it's a DB hook, wrap it in block comments
      return `/* --- AUTOMATED CLEANUP: This block was removed by cleanup-db-hooks.js ---\n${matchedBlock}\n*/`; 
    } else {
      // Otherwise, leave the block untouched
      return matchedBlock;
    }
  });

  // Only write to the file if changes were actually made
  if (originalContent !== content) {
    await fs.writeFile(filePath, content, 'utf8');
    filesChanged++;
  }

} catch (error) {
  console.error(`❌ Failed to process ${filePath}:`, error);
}

// Execute the script with: node scripts/cleanup-db-hooks.js

/* MongoDB setup commands (run in terminal):
# Create data directory if it doesn't exist
mkdir C:\data\db -Force

# Run MongoDB and keep this terminal open
"C:\Program Files\MongoDB\Server\6.0\bin\mongod.exe" --dbpath="C:\data\db"
*/

{
  "editor.codeActionsOnSave": {
    "source.fixAll": true
  }
}