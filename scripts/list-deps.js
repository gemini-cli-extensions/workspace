const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'node_modules');
const visited = new Set();
const toVisit = ['jsdom', 'keytar'];

function getDependencies(pkgName) {
  const pkgPath = path.join(root, pkgName, 'package.json');
  if (!fs.existsSync(pkgPath)) return [];
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return Object.keys(pkg.dependencies || {});
}

while (toVisit.length > 0) {
  const pkg = toVisit.pop();
  if (visited.has(pkg)) continue;
  visited.add(pkg);
  
  const deps = getDependencies(pkg);
  deps.forEach(dep => {
    if (!visited.has(dep)) {
      toVisit.push(dep);
    }
  });
}

console.log(Array.from(visited).sort().join('\n'));
console.log(`Total packages: ${visited.size}`);
