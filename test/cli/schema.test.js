'use strict';

const {describe, it, beforeEach, afterEach} = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {DataTypes, Sequelize} = require('sequelize');
const {
  buildDesiredSchema,
  buildCurrentSchema,
  diffSchemas,
  formatColumnAttrToString,
} = require('../../cli/lib/schema');

describe('CLI schema helpers', () => {
  function makeModel(name, fields, relationships) {
    return {
      name,
      tableName: name,
      adapterName: 'sequelize',
      fieldInstances: fields,
      relationships: relationships || [],
      primaryKey: fields.id,
    };
  }

  function uuidPk() {
    return {
      name: 'id',
      toSequelize() {
        return {type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true};
      },
    };
  }

  describe('buildDesiredSchema', () => {
    it('maps scalar fields to column definitions', () => {
      const Task = makeModel('Task', {
        id: uuidPk(),
        title: {
          name: 'title',
          toSequelize() {
            return {type: DataTypes.STRING, allowNull: false};
          },
        },
        done: {
          name: 'done',
          toSequelize() {
            return {type: DataTypes.BOOLEAN, defaultValue: false};
          },
        },
      });

      const schema = buildDesiredSchema({Task});
      assert.ok(schema.Task, 'Task table present');
      assert.strictEqual(schema.Task.columns.title.type, DataTypes.STRING);
      assert.strictEqual(schema.Task.columns.done.type, DataTypes.BOOLEAN);
    });

    it('adds hasOne foreign key columns', () => {
      const User = makeModel('User', {
        id: uuidPk(),
      });
      const Task = makeModel('Task', {
        id: uuidPk(),
        title: {
          name: 'title',
          toSequelize() {
            return {type: DataTypes.STRING};
          },
        },
      }, [
        {type: 'hasOne', model: 'User', foreignKey: 'createdById', isRequired: false},
      ]);

      const schema = buildDesiredSchema({User, Task});
      assert.strictEqual(schema.Task.columns.createdById.type, DataTypes.UUID);
      assert.strictEqual(schema.Task.columns.createdById.allowNull, true);
    });

    it('skips non-sequelize models', () => {
      const Cache = makeModel('Cache', {
        id: uuidPk(),
      });
      Cache.adapterName = 'redis';

      const schema = buildDesiredSchema({Cache});
      assert.strictEqual(schema.Cache, undefined);
    });
  });

  describe('buildCurrentSchema', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swj-schema-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, {recursive: true, force: true});
    });

    function writeMigration(name, content) {
      fs.writeFileSync(path.join(tmpDir, name), content);
    }

    it('parses createTable migrations', async () => {
      writeMigration('001-create-user.js', `
        module.exports = {
          async up(queryInterface, Sequelize) {
            await queryInterface.createTable('User', {
              id: {type: Sequelize.UUID, primaryKey: true},
              name: {type: Sequelize.STRING, allowNull: false},
            });
          }
        };
      `);

      const current = await buildCurrentSchema(tmpDir);
      assert.ok(current.User, 'User table parsed');
      assert.ok(current.User.columns.name, 'name column parsed');
      assert.strictEqual(current.User.columns.name.type, DataTypes.STRING);
    });

    it('replays addColumn and removeColumn', async () => {
      writeMigration('001-create-user.js', `
        module.exports = {
          async up(queryInterface, Sequelize) {
            await queryInterface.createTable('User', {
              id: {type: Sequelize.UUID, primaryKey: true},
              name: {type: Sequelize.STRING},
            });
          }
        };
      `);
      writeMigration('002-add-email.js', `
        module.exports = {
          async up(queryInterface, Sequelize) {
            await queryInterface.addColumn('User', 'email', {type: Sequelize.STRING});
          }
        };
      `);
      writeMigration('003-remove-name.js', `
        module.exports = {
          async up(queryInterface, Sequelize) {
            await queryInterface.removeColumn('User', 'name');
          }
        };
      `);

      const current = await buildCurrentSchema(tmpDir);
      assert.ok(current.User.columns.email, 'email added');
      assert.strictEqual(current.User.columns.name, undefined, 'name removed');
    });

    it('handles dropTable', async () => {
      writeMigration('001-create-and-drop.js', `
        module.exports = {
          async up(queryInterface, Sequelize) {
            await queryInterface.createTable('Temp', {id: Sequelize.INTEGER});
            await queryInterface.dropTable('Temp');
          }
        };
      `);

      const current = await buildCurrentSchema(tmpDir);
      assert.strictEqual(current.Temp, undefined);
    });

    it('handles multi-table migrations', async () => {
      writeMigration('001-init.js', `
        module.exports = {
          async up(queryInterface, Sequelize) {
            await queryInterface.createTable('User', {id: Sequelize.UUID});
            await queryInterface.createTable('Task', {id: Sequelize.UUID, title: Sequelize.STRING});
          }
        };
      `);

      const current = await buildCurrentSchema(tmpDir);
      assert.ok(current.User);
      assert.ok(current.Task);
    });
  });

  describe('diffSchemas', () => {
    it('detects new tables', () => {
      const current = {};
      const desired = {Task: {columns: {id: {type: DataTypes.UUID}}}};
      const diff = diffSchemas(current, desired);
      assert.strictEqual(diff.create.length, 1);
      assert.strictEqual(diff.create[0].tableName, 'Task');
      assert.strictEqual(diff.update.length, 0);
    });

    it('detects added and removed columns', () => {
      const current = {
        Task: {columns: {id: {type: DataTypes.UUID}, oldCol: {type: DataTypes.STRING}}},
      };
      const desired = {
        Task: {columns: {id: {type: DataTypes.UUID}, newCol: {type: DataTypes.BOOLEAN}}},
      };
      const diff = diffSchemas(current, desired);
      assert.strictEqual(diff.create.length, 0);
      assert.strictEqual(diff.update.length, 1);
      assert.strictEqual(diff.update[0].added[0].name, 'newCol');
      assert.strictEqual(diff.update[0].removed[0].name, 'oldCol');
    });

    it('reports no changes when schemas match', () => {
      const current = {Task: {columns: {id: {type: DataTypes.UUID}}}};
      const desired = {Task: {columns: {id: {type: DataTypes.UUID}}}};
      const diff = diffSchemas(current, desired);
      assert.strictEqual(diff.create.length, 0);
      assert.strictEqual(diff.update.length, 0);
    });
  });

  describe('formatColumnAttrToString', () => {
    it('emits Sequelize.DataType names', () => {
      const out = formatColumnAttrToString({
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
      });
      assert.match(out, /type: Sequelize\.UUID/);
      assert.match(out, /defaultValue: Sequelize\.UUIDV4/);
      assert.match(out, /allowNull: false/);
    });

    it('emits primitive values correctly', () => {
      const out = formatColumnAttrToString({
        allowNull: true,
        defaultValue: false,
        unique: true,
      });
      assert.match(out, /allowNull: true/);
      assert.match(out, /defaultValue: false/);
      assert.match(out, /unique: true/);
    });

    it('stringifies reference objects', () => {
      const out = formatColumnAttrToString({
        references: {model: 'User', key: 'id'},
      });
      assert.match(out, /references: {"model":"User","key":"id"}/);
    });
  });
});
