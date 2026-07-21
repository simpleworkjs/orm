'use strict';

const fs = require('fs');
const path = require('path');
const {buildDesiredSchema, buildCurrentSchema, diffSchemas, formatColumnsToString, formatColumnAttrToString} = require('./schema');

module.exports = async function migrateMake(ctx) {
  const desired = buildDesiredSchema(ctx.models);
  const current = await buildCurrentSchema(ctx.paths.migrations);
  const diff = diffSchemas(current, desired);

  if (diff.create.length === 0 && diff.update.length === 0) {
    ctx.log('✅ No schema changes to migrate.');
    return;
  }

  if (!fs.existsSync(ctx.paths.migrations)) {
    fs.mkdirSync(ctx.paths.migrations, {recursive: true});
  }

  const name = ctx.args[0] || 'auto';
  const fileName = `${timestamp()}-${name}.js`;
  const filePath = path.join(ctx.paths.migrations, fileName);

  const upCreates = [];
  const downCreates = [];
  for (const item of diff.create) {
    const cols = formatColumnsToString(item.columns);
    upCreates.push(`await queryInterface.createTable("${item.tableName}", {\n${cols}\n    });`);
    downCreates.unshift(`await queryInterface.dropTable("${item.tableName}");`);
  }

  const upUpdates = [];
  const downUpdates = [];
  for (const item of diff.update) {
    for (const col of item.added) {
      upUpdates.push(`await queryInterface.addColumn('${item.tableName}', '${col.name}', {${formatColumnAttrToString(col.def)}});`);
      downUpdates.unshift(`await queryInterface.removeColumn('${item.tableName}', '${col.name}');`);
    }
    for (const col of item.removed) {
      upUpdates.push(`await queryInterface.removeColumn('${item.tableName}', '${col.name}');`);
      downUpdates.unshift(`await queryInterface.addColumn('${item.tableName}', '${col.name}', {${formatColumnAttrToString(col.def)}});`);
    }
  }

  const upEntries = [...upCreates, ...upUpdates];
  const downEntries = [...downUpdates, ...downCreates];

  const content = `'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    ${upEntries.join('\n    ') || '// no changes'}
  },

  async down(queryInterface, Sequelize) {
    ${downEntries.join('\n    ') || '// no changes'}
  }
};
`;

  fs.writeFileSync(filePath, content);
  ctx.log(`✅ Created migration: ${filePath}`);
};

function timestamp() {
  return String(Date.now());
}
