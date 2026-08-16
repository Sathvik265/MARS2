const fs = require('fs');

const f1 = fs.readFileSync('c:/Users/deept/OneDrive/Desktop/Deepthi-pp/rbs/restaurant-billing-app/items_insert.sql', 'utf8');
const f2 = fs.readFileSync('c:/Users/deept/OneDrive/Desktop/Deepthi-pp/rbs/restaurant-billing-app/items_insert_fixed.sql', 'utf8');

const lineRegex = /\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*('[^']*'|NULL|\[[^]*\])\s*::jsonb\s*,\s*([^)]*)\)/g;

function getItems(content) {
  const items = {};
  let match;
  while ((match = lineRegex.exec(content)) !== null) {
    const alphaCode = match[2];
    items[alphaCode] = {
      name: match[1],
      alpha_code: match[2],
      numeric_code: match[3],
      price_fixed: match[4],
      price_general: match[5],
      price_ac: match[6],
      category: match[7],
      is_separate: match[8]
    };
  }
  return items;
}

const items1 = getItems(f1);
const items2 = getItems(f2);

const keys1 = Object.keys(items1);
const keys2 = Object.keys(items2);

console.log('F1 items count:', keys1.length);
console.log('F2 items count:', keys2.length);

const onlyIn1 = keys1.filter(k => !items2[k]);
const onlyIn2 = keys2.filter(k => !items1[k]);

console.log('Only in F1:', onlyIn1);
console.log('Only in F2:', onlyIn2);

// Check for value diffs on common keys
for (const key of keys1) {
  if (items2[key]) {
    const item1 = items1[key];
    const item2 = items2[key];
    const diffs = [];
    if (item1.name !== item2.name) diffs.push(`name: ${item1.name} vs ${item2.name}`);
    if (item1.price_fixed !== item2.price_fixed) diffs.push(`price_fixed: ${item1.price_fixed} vs ${item2.price_fixed}`);
    if (item1.price_general !== item2.price_general) diffs.push(`price_general: ${item1.price_general} vs ${item2.price_general}`);
    if (item1.price_ac !== item2.price_ac) diffs.push(`price_ac: ${item1.price_ac} vs ${item2.price_ac}`);
    if (diffs.length > 0) {
      console.log(`Diff for ${key}:`, diffs);
    }
  }
}
