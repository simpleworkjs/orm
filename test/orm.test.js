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

describe('instance.update', () => {
  it('reflects persisted values back onto the instance (no stale properties)', async () => {
    // Regression: update() wrote through to the backing store but left the
    // wrapper instance's own properties stale, so `this.field` read the old
    // value right after `await this.update(...)` — the trap for exposed
    // instance methods that do `await this.update({x}); return this.x`.
    const {Model} = require('../index');
    class Counter extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        count: {type: 'int', default: 0},
        label: {type: 'string'},
      };
    }

    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});
    await orm.load([Counter]);
    try {
      const row = await orm.models.Counter.create({count: 1, label: 'a'});
      await row.update({count: 5, label: 'b'});

      // The same instance now sees the new values...
      assert.strictEqual(row.count, 5);
      assert.strictEqual(row.label, 'b');
      // ...and a fresh read agrees (it really persisted).
      const fresh = await orm.models.Counter.get(row.id);
      assert.strictEqual(fresh.count, 5);
    } finally {
      await orm.close();
    }
  });
});
