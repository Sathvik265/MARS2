const fs = require('fs');
const { Pool } = require('pg');

const f1 = fs.readFileSync('c:/Users/deept/OneDrive/Desktop/Deepthi-pp/rbs/restaurant-billing-app/items_insert.sql', 'utf8');

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

const sqlItems = getItems(f1);

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'restaurant_billing',
  password: 'Deepthi@2004',
  port: 5432,
});

async function run() {
  try {
    const res = await pool.query('SELECT alpha_code, name, price_fixed, price_general, price_ac FROM items');
    const dbItems = {};
    for (const row of res.rows) {
      dbItems[row.alpha_code] = row;
    }

    const sqlKeys = Object.keys(sqlItems);
    const dbKeys = Object.keys(dbItems);

    console.log('SQL items count:', sqlKeys.length);
    console.log('DB items count:', dbKeys.length);

    const onlyInSql = sqlKeys.filter(k => !dbItems[k]);
    const onlyInDb = dbKeys.filter(k => !sqlItems[k]);

    console.log('Only in SQL file:', onlyInSql.map(k => `${k} (${sqlItems[k].name})`));
    console.log('Only in Database:', onlyInDb.map(k => `${k} (${dbItems[k].name})`));

    // Show price differences for items present in both
    for (const key of sqlKeys) {
      if (dbItems[key]) {
        const sqlItem = sqlItems[key];
        const dbItem = dbItems[key];
        const diffs = [];
        if (parseFloat(sqlItem.price_fixed) !== parseFloat(dbItem.price_fixed)) {
          diffs.push(`price_fixed: SQL=${sqlItem.price_fixed} vs DB=${dbItem.price_fixed}`);
        }
        if (parseFloat(sqlItem.price_general) !== parseFloat(dbItem.price_general)) {
          diffs.push(`price_general: SQL=${sqlItem.price_general} vs DB=${dbItem.price_general}`);
        }
        if (parseFloat(sqlItem.price_ac) !== parseFloat(dbItem.price_ac)) {
          diffs.push(`price_ac: SQL=${sqlItem.price_ac} vs DB=${dbItem.price_ac}`);
        }
        if (diffs.length > 0) {
          console.log(`Price diff for ${key} (${dbItem.name}):`, diffs);
        }
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

run();
