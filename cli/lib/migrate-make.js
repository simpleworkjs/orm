'use strict';

const fs = require('fs');
const path = require('path');
const {buildDesiredSchema, buildCurrentSchema, diffSchemas, formatColumnsToString, formatColumnAttrToString} = require('./schema');

module.exports = async function migrateMake(ctx) {
  const desired = buildDesiredSchema(ctx.models);
  const current = buildCurrentSchema(ctx.paths.migrations);
  const diff = diffSchemas(current, desired);

  if (diff.create.length === 0 && diff.update.length === 0) {
    ctx.log('✅ No schema changes to migrate.');
    return;
  }

  if (!fs.existsSync(ctx.paths.migrations)) {
    fs.mkdirSync(ctx.paths.migrations, {recursive: true});
  }

  for (const item of diff.create) {
    generateCreateMigration(item.tableName, item.columns, ctx.paths.migrations, ctx.args[0]);
  }

  for (const item of diff.update) {
    generateUpdateMigration(item, ctx.paths.migrations, ctx.args[0]);
  }
};

function timestamp() {
  return new Date().toISOString().replace(/[-T:Z.]/g, '').slice(0, 14);
}

function generateCreateMigration(tableName, columns, migrationsPath, suffix) {
  const name = suffix || `create-${tableName}`;
  const fileName = `${timestamp()}-${name}.js`;
  const filePath = path.join(migrationsPath, fileName);
  const cols = formatColumnsToString(columns);

  const content = `'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("${tableName}", {
      ${cols}
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("${tableName}");
  }
};
`;

  fs.writeFileSync(filePath, content);
  console.log(`✅ Created migration: ${filePath}`);
  return filePath;
}

function generateUpdateMigration(item, migrationsPath, suffix) {
  const name = suffix || `update-${item.tableName}`;
  const fileName = `${timestamp()}-${name}.js`;
  const filePath = path.join(migrationsPath, fileName);

  const upEntries = [];
  const downEntries = [];

  for (const col of item.added) {
    upEntries.push(`queryInterface.addColumn('${item.tableName}', '${col.name}', {${formatColumnAttrToString(col.def)}})`);
    downEntries.push(`queryInterface.removeColumn('${item.tableName}', '${col.name}')`);
  }

  for (const col of item.removed) {
    upEntries.push(`queryInterface.removeColumn('${item.tableName}', '${col.name}')`);
    downEntries.push(`queryInterface.addColumn('${item.tableName}', '${col.name}', {${formatColumnAttrToString(col.def)}})`);
  }

  const content = `'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return Promise.all([
      ${upEntries.join(',\n\t\t\t')}
    ]);
  },

  async down(queryInterface, Sequelize) {
    return Promise.all([
      ${downEntries.join(',\n\t\t\t')}
    ]);
  }
};
`;

  fs.writeFileSync(filePath, content);
  console.log(`✅ Created migration: ${filePath}`);
  return filePath;
}
