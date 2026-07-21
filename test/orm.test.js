'use strict';

const {describe, it, before, after} = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {ORM, Model} = require('../index');

describe('ORM.load', () => {
  let dir;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orm-load-test-'));
  });

  after(() => {
    fs.rmSync(dir, {recursive: true, force: true});
  });

  it('loads a model file that exports a single Model class directly', async () => {
    // Regression test: `require('./task-model')` returning `class Task extends
    // Model {...}` directly (not `{Task}` or `[Task]`) used to fall through to
    // `Object.values(exported)`, which iterates the class's own static
    // properties instead of treating it as one model, silently loading nothing.
    const file = path.join(dir, 'single-export-model.js');
    fs.writeFileSync(
      file,
      `
      const {Model} = require(${JSON.stringify(path.join(__dirname, '..', 'index.js'))});
      class SingleExportTask extends Model {
        static fields = {
          id: {type: 'uuid', primaryKey: true},
          title: {type: 'string'},
        };
      }
      module.exports = SingleExportTask;
      `
    );

    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});
    await orm.load([file]);

    assert.ok(orm.models.SingleExportTask, 'model was registered');
    assert.strictEqual(orm.models.SingleExportTask.primaryKey.name, 'id');

    await orm.close();
  });

  it('still loads models exported as an object map or array', async () => {
    const file = path.join(dir, 'multi-export-model.js');
    fs.writeFileSync(
      file,
      `
      const {Model} = require(${JSON.stringify(path.join(__dirname, '..', 'index.js'))});
      class TagA extends Model {
        static fields = {id: {type: 'uuid', primaryKey: true}};
      }
      class TagB extends Model {
        static fields = {id: {type: 'uuid', primaryKey: true}};
      }
      module.exports = {TagA, TagB};
      `
    );

    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});
    await orm.load([file]);

    assert.ok(orm.models.TagA);
    assert.ok(orm.models.TagB);

    await orm.close();
  });
});
