'use strict';

const {describe, it} = require('node:test');
const assert = require('node:assert');
const {ORM, Model} = require('../index');

describe('validation', () => {
  it('field-level custom validator', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class FieldValidateModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        name: {
          type: 'string',
          validate: {
            custom: (value) => {
              if (value.length < 3) {
                throw new Error('name must be at least 3 characters');
              }
            },
          },
        },
      };
    }

    await orm.load([FieldValidateModel]);

    let error;
    try {
      await FieldValidateModel.create({name: 'ab'});
    } catch (e) {
      error = e;
    }
    assert.ok(error, 'validation error thrown');
    assert.ok(error.message.includes('must be at least 3 characters'));

    const rec = await FieldValidateModel.create({name: 'valid'});
    assert.ok(rec.id, 'record created with valid data');

    await orm.close();
  });

  it('model-level custom validator', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class ModelValidateModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        start: {type: 'date'},
        end: {type: 'date'},
      };
    }

    ModelValidateModel.addValidator('dateOrder', (data) => {
      if (data.start && data.end && new Date(data.start) > new Date(data.end)) {
        throw new Error('start date must be before end date');
      }
    });

    await orm.load([ModelValidateModel]);

    let error;
    try {
      await ModelValidateModel.create({
        start: new Date('2025-01-01').toISOString(),
        end: new Date('2024-01-01').toISOString(),
      });
    } catch (e) {
      error = e;
    }
    assert.ok(error, 'validation error thrown');
    assert.ok(error.message.includes('start date must be before end date'));

    const rec = await ModelValidateModel.create({
      start: new Date('2024-01-01').toISOString(),
      end: new Date('2025-01-01').toISOString(),
    });
    assert.ok(rec.id, 'record created with valid data');

    await orm.close();
  });

  it('async validator', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class AsyncValidateModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        username: {type: 'string'},
      };
    }

    const takenUsernames = ['admin', 'root', 'system'];
    AsyncValidateModel.addValidator('uniqueUsername', async (data) => {
      await new Promise(resolve => setTimeout(resolve, 1));
      if (data.username && takenUsernames.includes(data.username)) {
        throw new Error('username is taken');
      }
    });

    await orm.load([AsyncValidateModel]);

    let error;
    try {
      await AsyncValidateModel.create({username: 'admin'});
    } catch (e) {
      error = e;
    }
    assert.ok(error, 'validation error thrown');
    assert.ok(error.message.includes('username is taken'));

    const rec = await AsyncValidateModel.create({username: 'uniqueuser'});
    assert.ok(rec.id, 'record created with valid username');

    await orm.close();
  });

  it('validationErrors array on error', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class MultiValidateModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        name: {
          type: 'string',
          validate: {
            custom: (value) => {
              if (!value) throw new Error('name is required');
            },
          },
        },
      };
    }

    await orm.load([MultiValidateModel]);

    let error;
    try {
      await MultiValidateModel.create({name: ''});
    } catch (e) {
      error = e;
    }
    assert.ok(error, 'validation error thrown');
    assert.ok(Array.isArray(error.validationErrors), 'validationErrors array exists');
    assert.ok(error.validationErrors.length > 0, 'validationErrors has entries');

    await orm.close();
  });

  it('hooks run before validation', async () => {
    const orm = new ORM({orm: {dialect: 'sqlite', storage: ':memory:', logging: false}});

    class HookValidateModel extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        name: {type: 'string'},
      };
    }

    let hookRunBeforeValidation = false;
    let validationRun = false;

    HookValidateModel.beforeValidate(() => {
      hookRunBeforeValidation = !validationRun;
    });

    HookValidateModel.addValidator('checkHook', () => {
      validationRun = true;
    });

    await orm.load([HookValidateModel]);
    await HookValidateModel.create({name: 'test'});

    assert.ok(hookRunBeforeValidation, 'beforeValidate hook runs before validators');

    await orm.close();
  });
});
