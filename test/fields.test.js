'use strict';

const {describe, it} = require('node:test');
const assert = require('node:assert');
const {DataTypes} = require('sequelize');
const fields = require('../lib/fields');

describe('Field types', () => {
  it('string field produces STRING with optional length', () => {
    const f = fields.create('title', {type: 'string', max: 200});
    const def = f.toSequelize();
    assert.strictEqual(def.type.key, 'STRING');
    assert.strictEqual(def.type._length, 200);
    assert.strictEqual(def.allowNull, true);
  });

  it('required string disallows null', () => {
    const f = fields.create('title', {type: 'string', isRequired: true});
    assert.strictEqual(f.toSequelize().allowNull, false);
  });

  it('text field produces TEXT', () => {
    const f = fields.create('body', {type: 'text'});
    assert.strictEqual(f.toSequelize().type, DataTypes.TEXT);
  });

  it('integer field produces INTEGER with min/max validate', () => {
    const f = fields.create('count', {type: 'int', min: 0, max: 100});
    const def = f.toSequelize();
    assert.strictEqual(def.type, DataTypes.INTEGER);
    assert.strictEqual(def.validate.min, 0);
    assert.strictEqual(def.validate.max, 100);
  });

  it('integer field with only min set does not inject an undefined max', () => {
    const f = fields.create('count', {type: 'int', min: 0});
    const def = f.toSequelize();
    assert.strictEqual(def.validate.min, 0);
    assert.strictEqual('max' in def.validate, false);
  });

  it('integer field with only max set does not inject an undefined min', () => {
    const f = fields.create('count', {type: 'int', max: 100});
    const def = f.toSequelize();
    assert.strictEqual(def.validate.max, 100);
    assert.strictEqual('min' in def.validate, false);
  });

  it('float field produces FLOAT', () => {
    const f = fields.create('rating', {type: 'float'});
    assert.strictEqual(f.toSequelize().type, DataTypes.FLOAT);
  });

  it('boolean field produces BOOLEAN and preserves default', () => {
    const f = fields.create('done', {type: 'boolean', default: false});
    const def = f.toSequelize();
    assert.strictEqual(def.type, DataTypes.BOOLEAN);
    assert.strictEqual(def.defaultValue, false);
  });

  it('date field produces DATE', () => {
    const f = fields.create('expiresAt', {type: 'date'});
    assert.strictEqual(f.toSequelize().type, DataTypes.DATE);
  });

  it('uuid field produces UUID with UUIDV4 default', () => {
    const f = fields.create('id', {type: 'uuid', primaryKey: true});
    const def = f.toSequelize();
    assert.strictEqual(def.type, DataTypes.UUID);
    assert.strictEqual(def.defaultValue, DataTypes.UUIDV4);
    assert.strictEqual(def.primaryKey, true);
  });

  it('email field adds isEmail validate', () => {
    const f = fields.create('email', {type: 'email'});
    const def = f.toSequelize();
    assert.strictEqual(def.validate.isEmail, true);
  });

  it('password-bcrypt field is private, write-only, and hashes on preSave', async () => {
    const f = fields.create('password', {type: 'password-bcrypt'});
    assert.strictEqual(f.isPrivate, true);
    // Write-only: hidden from output, but still settable on input forms — so
    // the create/edit UI can render a password field. Exposed in the schema.
    assert.strictEqual(f.writeOnly, true);
    assert.strictEqual(f.toSchema().writeOnly, true);
    assert.strictEqual(f.htmlType, 'password');

    const hashed = await f.preSave('Secret1!');
    assert.notStrictEqual(hashed, 'Secret1!');
    assert.ok(hashed.startsWith('$2'), 'bcrypt hash prefix');
  });

  it('ordinary fields are not write-only', () => {
    assert.strictEqual(fields.create('title', {type: 'string'}).writeOnly, false);
    assert.strictEqual(fields.create('title', {type: 'string'}).toSchema().writeOnly, false);
  });

  it('json field passes objects through and parses JSON strings on preSave', async () => {
    const f = fields.create('meta', {type: 'json'});
    assert.strictEqual(f.type, 'json');
    const obj = {a: 1, nested: {b: true}};
    assert.strictEqual(await f.preSave(obj), obj, 'objects pass through unchanged');
    assert.deepStrictEqual(await f.preSave('{"a":1}'), {a: 1}, 'JSON string is parsed');
    assert.strictEqual(await f.preSave('not json'), 'not json', 'invalid JSON left as-is');
    assert.strictEqual(await f.preSave(''), '', 'empty string untouched');
  });

  it('hasOne relationship stores model and foreignKey', () => {
    const f = fields.create('owner', {type: 'hasOne', model: 'User'});
    assert.strictEqual(f.type, 'hasOne');
    assert.strictEqual(f.model, 'User');
    assert.strictEqual(f.foreignKey, 'ownerId');
    assert.strictEqual(f.isRelationship, true);
  });

  it('hasMany relationship stores model and remoteKey', () => {
    const f = fields.create('items', {type: 'hasMany', model: 'Item'});
    assert.strictEqual(f.type, 'hasMany');
    assert.strictEqual(f.model, 'Item');
    assert.strictEqual(f.foreignKey, 'itemId');
  });

  it('rejects unknown field types', () => {
    assert.throws(
      () => fields.create('x', {type: 'unknown'}),
      /Unknown field type/
    );
  });
});
