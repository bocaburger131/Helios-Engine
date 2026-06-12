const fs = require('fs');
const path = require('path');

// Define paths
const projectRoot = path.join(__dirname, '..');
const uploadsDir = path.join(projectRoot, 'uploads');
const gitkeepFile = path.join(uploadsDir, '.gitkeep');

// Create uploads directory if it doesn't exist
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Created uploads directory');
}

// Create .gitkeep file
fs.writeFileSync(gitkeepFile, '');
console.log('Created .gitkeep file');