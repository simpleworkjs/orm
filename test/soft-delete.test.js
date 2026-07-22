'use strict';

const {describe, it} = require('node:test');
const assert = require('node:assert');
const {ORM, Model} = require('../index');

describe('soft-delete', () => {
  it('paranoid mode filters deleted records from list()', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class ParanoidModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        name: {type: 'string'},
        is_deleted: {type: 'boolean', default: false},
      };
      static paranoid = true;
    }

    await orm.load([ParanoidModel]);

    const rec1 = await ParanoidModel.create({name: 'active'});
    const rec2 = await ParanoidModel.create({name: 'to-delete'});

    await rec2.delete();

    const all = await ParanoidModel.list();
    assert.strictEqual(all.length, 1, 'only active record returned');
    assert.strictEqual(all[0].name, 'active');

    await orm.close();
  });

  it('paranoid mode filters deleted records from get()', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class GetParanoidModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        name: {type: 'string'},
        is_deleted: {type: 'boolean', default: false},
      };
      static paranoid = true;
    }

    await orm.load([GetParanoidModel]);
    const rec = await GetParanoidModel.create({name: 'test'});
    await rec.delete();

    const deleted = await GetParanoidModel.get(rec.id);
    assert.strictEqual(deleted, null, 'deleted record not returned by get()');

    await orm.close();
  });

  it('softDelete method marks record as deleted', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class SoftDeleteModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        name: {type: 'string'},
        is_deleted: {type: 'boolean', default: false},
      };
    }

    await orm.load([SoftDeleteModel]);
    const rec = await SoftDeleteModel.create({name: 'test'});

    await rec.softDelete();

    assert.strictEqual(rec.is_deleted, true, 'is_deleted set to true');

    const fresh = await orm.adapter(SoftDeleteModel).get(SoftDeleteModel, rec.id);
    assert.strictEqual(fresh.is_deleted, true, 'is_deleted persisted to DB');

    await orm.close();
  });

  it('restore method brings back deleted record', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class RestoreModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        name: {type: 'string'},
        is_deleted: {type: 'boolean', default: false},
      };
      static paranoid = true;
    }

    await orm.load([RestoreModel]);
    const rec = await RestoreModel.create({name: 'test'});

    await rec.softDelete();
    assert.strictEqual(rec.is_deleted, true);

    await rec.restore();
    assert.strictEqual(rec.is_deleted, false, 'is_deleted set to false after restore');

    const all = await RestoreModel.list();
    assert.strictEqual(all.length, 1, 'restored record appears in list');

    await orm.close();
  });

  it('force delete bypasses soft-delete', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class ForceDeleteModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        name: {type: 'string'},
        is_deleted: {type: 'boolean', default: false},
      };
      static paranoid = true;
    }

    await orm.load([ForceDeleteModel]);
    const rec = await ForceDeleteModel.create({name: 'test'});

    await rec.delete({force: true});

    const fresh = await orm.adapter(ForceDeleteModel).get(ForceDeleteModel, rec.id);
    assert.strictEqual(fresh, null, 'record hard deleted');

    await orm.close();
  });

  it('count respects paranoid filter', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class CountModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        name: {type: 'string'},
        is_deleted: {type: 'boolean', default: false},
      };
      static paranoid = true;
    }

    await orm.load([CountModel]);
    await CountModel.create({name: 'active1'});
    await CountModel.create({name: 'active2'});
    const toDelete = await CountModel.create({name: 'deleted'});
    await toDelete.softDelete();

    const count = await CountModel.count();
    assert.strictEqual(count, 2, 'count excludes deleted records');

    await orm.close();
  });

  it('custom deletedField name works', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class CustomFieldModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        name: {type: 'string'},
        deleted: {type: 'boolean', default: false},
      };
      static paranoid = true;
      static deletedField = 'deleted';
    }

    await orm.load([CustomFieldModel]);
    const rec = await CustomFieldModel.create({name: 'test'});
    await rec.softDelete();

    assert.strictEqual(rec.deleted, true, 'custom deleted field set');

    await orm.close();
  });
});
