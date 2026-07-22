'use strict';

const {describe, it} = require('node:test');
const assert = require('node:assert');
const {ORM, Model} = require('../index');

describe('operators', () => {
  it('greater than (gt)', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class GtModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        value: {type: 'int'},
      };
    }

    await orm.load([GtModel]);
    await GtModel.create({value: 5});
    await GtModel.create({value: 10});
    await GtModel.create({value: 15});

    const results = await GtModel.list({where: {value: {gt: 7}}});
    assert.strictEqual(results.length, 2, 'returns values > 7');

    await orm.close();
  });

  it('less than (lt)', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class LtModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        value: {type: 'int'},
      };
    }

    await orm.load([LtModel]);
    await LtModel.create({value: 5});
    await LtModel.create({value: 10});
    await LtModel.create({value: 15});

    const results = await LtModel.list({where: {value: {lt: 10}}});
    assert.strictEqual(results.length, 1, 'returns values < 10');

    await orm.close();
  });

  it('greater than or equal (gte)', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class GteModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        value: {type: 'int'},
      };
    }

    await orm.load([GteModel]);
    await GteModel.create({value: 5});
    await GteModel.create({value: 10});
    await GteModel.create({value: 15});

    const results = await GteModel.list({where: {value: {gte: 10}}});
    assert.strictEqual(results.length, 2, 'returns values >= 10');

    await orm.close();
  });

  it('less than or equal (lte)', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class LteModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        value: {type: 'int'},
      };
    }

    await orm.load([LteModel]);
    await LteModel.create({value: 5});
    await LteModel.create({value: 10});
    await LteModel.create({value: 15});

    const results = await LteModel.list({where: {value: {lte: 10}}});
    assert.strictEqual(results.length, 2, 'returns values <= 10');

    await orm.close();
  });

  it('not equal (ne)', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class NeModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        status: {type: 'string'},
      };
    }

    await orm.load([NeModel]);
    await NeModel.create({status: 'active'});
    await NeModel.create({status: 'inactive'});
    await NeModel.create({status: 'active'});

    const results = await NeModel.list({where: {status: {ne: 'active'}}});
    assert.strictEqual(results.length, 1, 'returns non-active records');

    await orm.close();
  });

  it('in array', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class InModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        status: {type: 'string'},
      };
    }

    await orm.load([InModel]);
    await InModel.create({status: 'active'});
    await InModel.create({status: 'pending'});
    await InModel.create({status: 'deleted'});

    const results = await InModel.list({where: {status: {in: ['active', 'pending']}}});
    assert.strictEqual(results.length, 2, 'returns records with status in array');

    await orm.close();
  });

  it('like pattern', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class LikeModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        name: {type: 'string'},
      };
    }

    await orm.load([LikeModel]);
    await LikeModel.create({name: 'John Doe'});
    await LikeModel.create({name: 'Jane Doe'});
    await LikeModel.create({name: 'Bob Smith'});

    const results = await LikeModel.list({where: {name: {like: '%Doe%'}}});
    assert.strictEqual(results.length, 2, 'returns records matching LIKE pattern');

    await orm.close();
  });

  it('combined operators', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class CombinedModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        value: {type: 'int'},
        status: {type: 'string'},
      };
    }

    await orm.load([CombinedModel]);
    await CombinedModel.create({value: 5, status: 'active'});
    await CombinedModel.create({value: 10, status: 'active'});
    await CombinedModel.create({value: 15, status: 'inactive'});

    const results = await CombinedModel.list({
      where: {
        value: {gte: 10},
        status: 'active',
      },
    });
    assert.strictEqual(results.length, 1, 'returns records matching all conditions');

    await orm.close();
  });

  it('listDetail returns full objects', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class DetailModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        name: {type: 'string'},
      };
    }

    await orm.load([DetailModel]);
    await DetailModel.create({name: 'test1'});
    await DetailModel.create({name: 'test2'});

    const results = await DetailModel.list({detail: true});
    assert.strictEqual(results.length, 2, 'listDetail returns full objects');
    assert.ok(results[0].name, 'objects have properties');

    await orm.close();
  });
});
