'use strict';

const {buildDesiredSchema, buildCurrentSchema, diffSchemas} = require('./schema');

module.exports = async function status(ctx) {
  const desired = buildDesiredSchema(ctx.models);
  const current = await buildCurrentSchema(ctx.paths.migrations);
  const diff = diffSchemas(current, desired);

  ctx.log('Current schema tables:', Object.keys(current).join(', ') || '(none)');
  ctx.log('Desired schema tables:', Object.keys(desired).join(', '));
  ctx.log('');

  if (diff.create.length === 0 && diff.update.length === 0) {
    ctx.log('✅ Schema is up to date.');
    return;
  }

  if (diff.create.length) {
    ctx.log('📝 Tables to create:');
    for (const item of diff.create) {
      ctx.log(`  - ${item.tableName} (${Object.keys(item.columns).join(', ')})`);
    }
  }

  if (diff.update.length) {
    ctx.log('🔄 Tables to update:');
    for (const item of diff.update) {
      const added = item.added.map(c => `+${c.name}`).join(', ');
      const removed = item.removed.map(c => `-${c.name}`).join(', ');
      ctx.log(`  - ${item.tableName}: ${added} ${removed}`);
    }
  }

  ctx.log('');
  ctx.log(`Run "simpleworks orm:migrate:make" to generate a migration.`);
};
