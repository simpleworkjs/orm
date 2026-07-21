'use strict';

const fs = require('fs');
const path = require('path');

module.exports = async function seed(ctx) {
  if (!fs.existsSync(ctx.paths.seeds)) {
    ctx.log(`No seed directory found at ${ctx.paths.seeds}.`);
    return;
  }

  const files = fs.readdirSync(ctx.paths.seeds)
    .filter(f => f.endsWith('.js'))
    .sort();

  if (files.length === 0) {
    ctx.log('No seed files to run.');
    return;
  }

  ctx.log(`Running ${files.length} seed file(s)...`);
  for (const file of files) {
    const seed = require(path.join(ctx.paths.seeds, file));
    if (typeof seed.up === 'function') {
      await seed.up(ctx.models);
      ctx.log(`  ✅ ${file}`);
    } else {
      ctx.warn(`  ⚠️  ${file} has no up() function; skipped.`);
    }
  }

  ctx.log('Seeding complete.');
};
