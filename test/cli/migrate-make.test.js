'use strict';

const {describe, it, beforeEach, afterEach} = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {DataTypes} = require('sequelize');
const migrateMake = require('../../cli/lib/migrate-make');

describe('migrate-make', () => {
  let tmpDir;

  function makeCtx(models, name) {
    return {
      models,
      paths: {migrations: path.join(tmpDir, 'migrations')},
      args: name ? [name] : [],
      log() {},
    };
  }

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

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swj-migrate-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, {recursive: true, force: true});
  });

  it('creates a single migration for all new tables', async () => {
    const Task = makeModel('Task', {
      id: uuidPk(),
      title: {
        name: 'title',
        toSequelize() {
          return {type: DataTypes.STRING, allowNull: false};
        },
      },
    });

    const ctx = makeCtx({Task}, 'init');
    await migrateMake(ctx);

    const files = fs.readdirSync(ctx.paths.migrations).sort();
    assert.strictEqual(files.length, 1, 'one migration file created');
    assert.match(files[0], /^\d+-init\.js$/);

    const content = fs.readFileSync(path.join(ctx.paths.migrations, files[0]), 'utf8');
    assert.match(content, /queryInterface\.createTable\("Task"/);
    assert.match(content, /queryInterface\.dropTable\("Task"/);
  });

  it('creates an update migration for added columns', async () => {
    fs.mkdirSync(path.join(tmpDir, 'migrations'), {recursive: true});
    fs.writeFileSync(path.join(tmpDir, 'migrations', '001-create-task.js'), `
      module.exports = {
        async up(queryInterface, Sequelize) {
          await queryInterface.createTable('Task', {
            id: {type: Sequelize.UUID, primaryKey: true},
          });
        },
        async down(queryInterface, Sequelize) {}
      };
    `);

    const Task = makeModel('Task', {
      id: uuidPk(),
      title: {
        name: 'title',
        toSequelize() {
          return {type: DataTypes.STRING, allowNull: false};
        },
      },
    });

    const ctx = makeCtx({Task}, 'add-title');
    await migrateMake(ctx);

    const files = fs.readdirSync(ctx.paths.migrations).sort();
    const updateFile = files.find(f => f.includes('add-title'));
    assert.ok(updateFile, 'update migration created');

    const content = fs.readFileSync(path.join(ctx.paths.migrations, updateFile), 'utf8');
    assert.match(content, /queryInterface\.addColumn\('Task', 'title'/);
    assert.match(content, /queryInterface\.removeColumn\('Task', 'title'\)/);
  });

  it('reports no changes when schema is up to date', async () => {
    fs.mkdirSync(path.join(tmpDir, 'migrations'), {recursive: true});
    fs.writeFileSync(path.join(tmpDir, 'migrations', '001-create-task.js'), `
      module.exports = {
        async up(queryInterface, Sequelize) {
          await queryInterface.createTable('Task', {
            id: {type: Sequelize.UUID, primaryKey: true},
            title: {type: Sequelize.STRING, allowNull: false},
          });
        },
        async down(queryInterface, Sequelize) {}
      };
    `);

    const Task = makeModel('Task', {
      id: uuidPk(),
      title: {
        name: 'title',
        toSequelize() {
          return {type: DataTypes.STRING, allowNull: false};
        },
      },
    });

    let output = '';
    const ctx = {
      models: {Task},
      paths: {migrations: path.join(tmpDir, 'migrations')},
      args: [],
      log(msg) {
        output += msg + '\n';
      },
    };

    await migrateMake(ctx);
    assert.match(output, /No schema changes to migrate/);

    const files = fs.readdirSync(ctx.paths.migrations);
    assert.strictEqual(files.length, 1, 'no new migration written');
  });
});
