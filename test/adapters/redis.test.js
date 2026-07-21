'use strict';

const {describe, it} = require('node:test');
const assert = require('node:assert');
const {RedisAdapter} = require('../../lib/adapters/redis');

describe('RedisAdapter.list', () => {
  function makeFakeModel(rows) {
    class FakeModel {
      constructor(row) {
        Object.assign(this, row);
      }
    }
    FakeModel.backingModel = {
      calls: [],
      async list() {
        this.calls.push('list');
        return rows.map(r => r.id);
      },
      async listDetail() {
        this.calls.push('listDetail');
        return rows;
      },
    };
    return FakeModel;
  }

  it('uses listDetail (row data), not list (bare keys)', async () => {
    const rows = [{id: 1, ownerId: 5, name: 'a'}];
    const Model = makeFakeModel(rows);
    const adapter = Object.create(RedisAdapter.prototype);

    const result = await adapter.list(Model, {});

    assert.deepStrictEqual(Model.backingModel.calls, ['listDetail']);
    assert.strictEqual(result[0].name, 'a');
  });

  it('filters rows by args.where instead of ignoring it', async () => {
    // Regression test: previously `args` was never read, so a hasMany
    // relation lookup (`where: {ownerId: X}`) returned every row in the
    // table instead of only the caller's rows.
    const rows = [
      {id: 1, ownerId: 5, name: 'a'},
      {id: 2, ownerId: 6, name: 'b'},
      {id: 3, ownerId: 5, name: 'c'},
    ];
    const Model = makeFakeModel(rows);
    const adapter = Object.create(RedisAdapter.prototype);

    const result = await adapter.list(Model, {where: {ownerId: 5}});

    assert.strictEqual(result.length, 2);
    assert.ok(result.every(r => r.ownerId === 5));
  });

  it('matches on all provided where keys', async () => {
    const rows = [
      {id: 1, ownerId: 5, status: 'open'},
      {id: 2, ownerId: 5, status: 'closed'},
    ];
    const Model = makeFakeModel(rows);
    const adapter = Object.create(RedisAdapter.prototype);

    const result = await adapter.list(Model, {where: {ownerId: 5, status: 'open'}});

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 1);
  });

  it('returns all rows when no where clause is given', async () => {
    const rows = [{id: 1}, {id: 2}];
    const Model = makeFakeModel(rows);
    const adapter = Object.create(RedisAdapter.prototype);

    const result = await adapter.list(Model);
    assert.strictEqual(result.length, 2);
  });
});
