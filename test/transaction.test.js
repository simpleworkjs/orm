'use strict';

const {describe, it} = require('node:test');
const assert = require('node:assert');
const {ORM, Model} = require('../index');

describe('transaction', () => {
  it('auto-managed transaction with callback', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class TxModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        name: {type: 'string'},
      };
    }

    await orm.load([TxModel]);

    let created = null;
    await orm.transaction(async ({transaction}) => {
      created = await TxModel.create({name: 'in-transaction'}, {transaction});
    });

    const found = await TxModel.get(created.id);
    assert.ok(found, 'record committed after transaction');

    await orm.close();
  });

  it('rollback on error', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class RollbackModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        name: {type: 'string'},
      };
    }

    await orm.load([RollbackModel]);

    let error;
    try {
      await orm.transaction(async ({transaction}) => {
        await RollbackModel.create({name: 'will-rollback'}, {transaction});
        throw new Error('rollback-trigger');
      });
    } catch (e) {
      error = e;
    }

    assert.ok(error, 'transaction threw error');
    const count = await RollbackModel.count();
    assert.strictEqual(count, 0, 'no records persisted after rollback');

    await orm.close();
  });

  it('manual transaction with commit', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class ManualTxModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        name: {type: 'string'},
      };
    }

    await orm.load([ManualTxModel]);

    const t = await orm.transaction();

    try {
      await ManualTxModel.create({name: 'pending'}, {transaction: t});
      await t.commit();

      const count = await ManualTxModel.count();
      assert.strictEqual(count, 1, 'record committed after manual commit');
    } catch (e) {
      await t.rollback();
      throw e;
    }

    await orm.close();
  });

  it('manual rollback', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class ManualRollbackModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        name: {type: 'string'},
      };
    }

    await orm.load([ManualRollbackModel]);

    const t = await orm.transaction();
    await ManualRollbackModel.create({name: 'will-rollback'}, {transaction: t});
    await t.rollback();

    const count = await ManualRollbackModel.count();
    assert.strictEqual(count, 0, 'no records after manual rollback');

    await orm.close();
  });

  it('throws without Sequelize adapter', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    // Transaction should throw if there's no sequelize adapter available
    let error;
    try {
      // Create ORM with only redis config (no sequelize)
      const redisOrm = new ORM({orm: {redis: {host: 'localhost', port: 6379}}});
      await redisOrm.transaction(async () => {});
    } catch (e) {
      error = e;
    }

    assert.ok(error, 'throws without Sequelize adapter');
    assert.ok(error.message.includes('only supported with the Sequelize adapter'));
  });

  it('multiple operations in single transaction', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class ParentModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        name: {type: 'string'},
      };
    }

    class ChildModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        parentId: {type: 'uuid'},
        name: {type: 'string'},
      };
    }

    await orm.load([ParentModel, ChildModel]);

    let parent, child;
    await orm.transaction(async ({transaction}) => {
      parent = await ParentModel.create({name: 'parent'}, {transaction});
      child = await ChildModel.create({name: 'child', parentId: parent.id}, {transaction});
    });

    const foundParent = await ParentModel.get(parent.id);
    const foundChild = await ChildModel.get(child.id);
    assert.ok(foundParent, 'parent committed');
    assert.ok(foundChild, 'child committed');

    await orm.close();
  });
});
