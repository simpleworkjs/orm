'use strict';

const {describe, it} = require('node:test');
const assert = require('node:assert');
const {DataTypes} = require('sequelize');
const {BaseModel} = require('../lib/base');

describe('BaseModel', () => {
  it('_register creates field instances from static fields', () => {
    class Task extends BaseModel {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        title: {type: 'string', isRequired: true},
      };
    }

    Task._register();
    assert.ok(Task.fieldInstances.id);
    assert.ok(Task.fieldInstances.title);
    assert.strictEqual(Task.primaryKey, Task.fieldInstances.id);
  });

  it('adds default auto-increment id when no primary key is defined', () => {
    class Tag extends BaseModel {
      static fields = {
        name: {type: 'string'},
      };
    }

    Tag._register();
    assert.ok(Tag.fieldInstances.id);
    assert.strictEqual(Tag.fieldInstances.id.type, 'int');
    assert.strictEqual(Tag.fieldInstances.id.primaryKey, true);
  });

  it('collects relationships separately', () => {
    class Task extends BaseModel {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        owner: {type: 'hasOne', model: 'User'},
        tags: {type: 'hasMany', model: 'Tag'},
      };
    }

    Task._register();
    assert.strictEqual(Task.relationships.length, 2);
    assert.ok(Task.relationships.find(r => r.type === 'hasOne'));
    assert.ok(Task.relationships.find(r => r.type === 'hasMany'));
  });

  it('toSchema exposes model metadata', () => {
    class Task extends BaseModel {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        title: {type: 'string'},
      };
      static display = {name: 'Task', titleField: 'title'};
    }

    Task._register();
    const schema = Task.toSchema();
    assert.strictEqual(schema.name, 'Task');
    assert.strictEqual(schema.pk, 'id');
    assert.ok(schema.fields.title);
    assert.strictEqual(schema.display.titleField, 'title');
  });
});
