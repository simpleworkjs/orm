'use strict';

const {describe, it, before, after} = require('node:test');
const assert = require('node:assert');
const {ORM, Model} = require('../index');

describe('hooks', () => {
  it('beforeCreate and afterCreate hooks fire', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class TestModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        name: {type: 'string'},
        createdAtHook: {type: 'string'},
      };
    }

    let beforeCreateCalled = false;
    let afterCreateCalled = false;
    let hookData = null;

    TestModel.beforeCreate((data) => {
      beforeCreateCalled = true;
      data.createdAtHook = 'hooked';
      hookData = data;
    });

    TestModel.afterCreate((instance) => {
      afterCreateCalled = true;
    });

    await orm.load([TestModel]);
    await TestModel.create({name: 'test'});

    assert.ok(beforeCreateCalled, 'beforeCreate hook called');
    assert.ok(afterCreateCalled, 'afterCreate hook called');
    assert.strictEqual(hookData.name, 'test');

    await orm.close();
  });

  it('beforeUpdate and afterUpdate hooks fire', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class UpdateModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        name: {type: 'string'},
        updatedAtHook: {type: 'string'},
      };
    }

    let beforeUpdateCalled = false;
    let afterUpdateCalled = false;

    UpdateModel.beforeUpdate((data, options, instance) => {
      beforeUpdateCalled = true;
      data.updatedAtHook = 'updated';
    });

    UpdateModel.afterUpdate((instance) => {
      afterUpdateCalled = true;
    });

    await orm.load([UpdateModel]);
    const instance = await UpdateModel.create({name: 'test'});
    await instance.update({name: 'updated'});

    assert.ok(beforeUpdateCalled, 'beforeUpdate hook called');
    assert.ok(afterUpdateCalled, 'afterUpdate hook called');

    await orm.close();
  });

  it('beforeDestroy and afterDestroy hooks fire', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class DestroyModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        name: {type: 'string'},
      };
    }

    let beforeDestroyCalled = false;
    let afterDestroyCalled = false;
    let destroyedInstance = null;

    DestroyModel.beforeDestroy((instance) => {
      beforeDestroyCalled = true;
      destroyedInstance = instance;
    });

    DestroyModel.afterDestroy((instance) => {
      afterDestroyCalled = true;
    });

    await orm.load([DestroyModel]);
    const instance = await DestroyModel.create({name: 'test'});
    await instance.delete();

    assert.ok(beforeDestroyCalled, 'beforeDestroy hook called');
    assert.ok(afterDestroyCalled, 'afterDestroy hook called');

    await orm.close();
  });

  it('beforeSave and afterSave hooks fire (create)', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class SaveModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        name: {type: 'string'},
      };
    }

    let beforeSaveCalled = false;
    let afterSaveCalled = false;
    let saveType = null;

    SaveModel.beforeSave((data, options, type) => {
      beforeSaveCalled = true;
      saveType = type;
    });

    SaveModel.afterSave((instance, options, type) => {
      afterSaveCalled = true;
    });

    await orm.load([SaveModel]);
    await SaveModel.create({name: 'test'});

    assert.ok(beforeSaveCalled, 'beforeSave hook called');
    assert.ok(afterSaveCalled, 'afterSave hook called');
    assert.strictEqual(saveType, 'create');

    await orm.close();
  });

  it('beforeValidate and afterValidate hooks fire', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class ValidateModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        name: {type: 'string'},
      };
    }

    let beforeValidateCalled = false;
    let afterValidateCalled = false;

    ValidateModel.beforeValidate(() => {
      beforeValidateCalled = true;
    });

    ValidateModel.afterValidate(() => {
      afterValidateCalled = true;
    });

    await orm.load([ValidateModel]);
    await ValidateModel.create({name: 'test'});

    assert.ok(beforeValidateCalled, 'beforeValidate hook called');
    assert.ok(afterValidateCalled, 'afterValidate hook called');

    await orm.close();
  });

  it('multiple hooks fire in order', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class OrderModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        name: {type: 'string'},
      };
    }

    const callOrder = [];

    OrderModel.beforeCreate(() => callOrder.push('beforeCreate-1'));
    OrderModel.beforeCreate(() => callOrder.push('beforeCreate-2'));
    OrderModel.afterCreate(() => callOrder.push('afterCreate-1'));
    OrderModel.afterCreate(() => callOrder.push('afterCreate-2'));

    await orm.load([OrderModel]);
    await OrderModel.create({name: 'test'});

    assert.deepStrictEqual(callOrder, [
      'beforeCreate-1',
      'beforeCreate-2',
      'afterCreate-1',
      'afterCreate-2',
    ]);

    await orm.close();
  });

  it('addHook method registers hooks', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class HookModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        name: {type: 'string'},
      };
    }

    let hookCalled = false;

    HookModel.addHook('beforeCreate', () => {
      hookCalled = true;
    });

    await orm.load([HookModel]);
    await HookModel.create({name: 'test'});

    assert.ok(hookCalled, 'addHook registered hook was called');

    await orm.close();
  });
});
