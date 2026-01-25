const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const desktopDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(desktopDir, '..');
const mobileDir = path.resolve(rootDir, 'mobile');
const outputDir = path.resolve(desktopDir, 'app');

if (!fs.existsSync(mobileDir)) {
  console.error('Pasta mobile nao encontrada:', mobileDir);
  process.exit(1);
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

console.log('Exportando app web do Expo...');
execSync(`npx expo export -p web --output-dir "${outputDir}"`, {
  cwd: mobileDir,
  stdio: 'inherit',
});

console.log('Export concluido em:', outputDir);
