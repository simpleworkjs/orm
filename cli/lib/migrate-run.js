'use strict';

const fs = require('fs');
const path = require('path');
const {Sequelize} = require('sequelize');

module.exports = async function migrateRun(ctx) {
  const sequelize = getSequelize(ctx);
  if (!sequelize) {
    ctx.error('No Sequelize adapter configured. Check your conf.orm settings.');
    process.exit(1);
  }

  const queryInterface = sequelize.getQueryInterface();

  // Ensure SequelizeMeta table exists.
  await queryInterface.createTable('SequelizeMeta', {
    name: {type: Sequelize.STRING, allowNull: false, primaryKey: true},
  });

  const [appliedRows] = await sequelize.query(
    'SELECT name FROM "SequelizeMeta" ORDER BY name ASC;'
  );
  const applied = new Set(appliedRows.map(r => r.name));

  if (!fs.existsSync(ctx.paths.migrations)) {
    ctx.log('No migrations directory found.');
    return;
  }

  const files = fs.readdirSync(ctx.paths.migrations)
    .filter(f => f.endsWith('.js'))
    .sort();

  const pending = files.filter(f => !applied.has(f));

  if (pending.length === 0) {
    ctx.log('✅ No pending migrations.');
    return;
  }

  ctx.log(`Applying ${pending.length} migration(s)...`);
  for (const file of pending) {
    const migration = require(path.join(ctx.paths.migrations, file));
    if (typeof migration.up === 'function') {
      await migration.up(queryInterface, Sequelize);
    }
    await sequelize.query(
      'INSERT INTO "SequelizeMeta" (name) VALUES (?);',
      {replacements: [file]}
    );
    ctx.log(`  ✅ ${file}`);
  }

  ctx.log('Migrations complete.');
};

function getSequelize(ctx) {
  const adapter = ctx.orm.adapters.sequelize;
  if (adapter && adapter.sequelize) return adapter.sequelize;

  // If adapter was not yet initialized, force creation via the ORM.
  const ModelClass = Object.values(ctx.models).find(m => m.adapterName === 'sequelize');
  if (!ModelClass) return null;
  ctx.orm.adapter(ModelClass);
  return ctx.orm.adapters.sequelize ? ctx.orm.adapters.sequelize.sequelize : null;
}
