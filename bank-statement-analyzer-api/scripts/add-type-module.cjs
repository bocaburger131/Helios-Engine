const fs = require('fs');
const path = require('path');

// Path to package.json
const packageJsonPath = path.resolve('package.json');

if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  // Add type: "module" if not already present
  if (!packageJson.type) {
    packageJson.type = "module";
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    console.log('✅ Added "type": "module" to package.json');
  } else if (packageJson.type !== 'module') {
    packageJson.type = "module";
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    console.log(`✅ Changed "type" from "${packageJson.type}" to "module" in package.json`);
  } else {
    console.log('ℹ️ "type": "module" already exists in package.json');
  }
} else {
  console.error('❌ package.json not found');
}