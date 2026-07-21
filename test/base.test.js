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

  it('_register defaults hasMany foreignKey to this model\'s name, not the remote model\'s', () => {
    // A User hasMany 'tasks' (model: 'Task') with no explicit remoteKey should
    // guess the FK column on Task as `userId` (belongsTo-style, referencing
    // the model that declares the hasMany), not `taskId` (the remote model's
    // own name, which would point Task at itself).
    class User extends BaseModel {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        tasks: {type: 'hasMany', model: 'Task'},
      };
    }

    User._register();
    const field = User.fieldInstances.tasks;
    assert.strictEqual(field.foreignKey, 'userId');
  });

  it('_register keeps an explicit hasMany remoteKey as the foreignKey', () => {
    class User extends BaseModel {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        tasks: {type: 'hasMany', model: 'Task', remoteKey: 'ownerId'},
      };
    }

    User._register();
    assert.strictEqual(User.fieldInstances.tasks.foreignKey, 'ownerId');
  });

  it('getRelated resolves hasMany using the corrected foreignKey', async () => {
    class Task extends BaseModel {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        userId: {type: 'uuid'},
      };
    }
    class User extends BaseModel {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        tasks: {type: 'hasMany', model: 'Task'},
      };
    }

    Task._register();
    User._register();

    let capturedArgs = null;
    Task.list = async (args) => {
      capturedArgs = args;
      return [];
    };

    const fakeOrm = {models: {Task, User}};
    Task.orm = fakeOrm;
    User.orm = fakeOrm;

    const user = Object.create(User.prototype);
    user.primaryKey = 'user-1';

    await user.getRelated('tasks');
    assert.deepStrictEqual(capturedArgs, {where: {userId: 'user-1'}});
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

describe('BaseModel.getExposedMethods', () => {
  class Thread extends BaseModel {
    static fields = {id: {type: 'uuid', primaryKey: true}};
    static exposedMethods = [
      {method: 'inviteUser', route: 'invite', verb: 'post', args: {from: 'body', names: ['username', 'role']}},
      {method: 'getParticipants', verb: 'get'},
      {method: 'removeUser', route: 'users', verb: 'delete', args: {from: 'params', names: ['username']}, permission: 'update'},
      {method: 'search', verb: 'get', args: {from: 'query', names: ['q']}, description: 'Search threads'},
    ];
    async inviteUser() {}
    async getParticipants() {}
    async removeUser() {}
    static async search() {}
  }
  Thread._register();

  const byName = Object.fromEntries(Thread.getExposedMethods().map(m => [m.method, m]));

  it('detects instance vs static methods', () => {
    assert.strictEqual(byName.inviteUser.kind, 'instance');
    assert.strictEqual(byName.search.kind, 'static');
  });

  it('mounts instance methods under the pk and static methods at the root', () => {
    assert.strictEqual(byName.inviteUser.routePath, '/:id/invite');
    assert.strictEqual(byName.search.routePath, '/search');
  });

  it('defaults route to the method name and permission from the verb', () => {
    assert.strictEqual(byName.getParticipants.routePath, '/:id/getParticipants');
    assert.strictEqual(byName.getParticipants.permission, 'read'); // get -> read
    assert.strictEqual(byName.inviteUser.permission, 'update');    // post -> update
    assert.strictEqual(byName.removeUser.permission, 'update');    // explicit override
  });

  it('turns params-sourced args into path segments', () => {
    assert.strictEqual(byName.removeUser.routePath, '/:id/users/:username');
  });

  it('carries the description through (empty string when absent)', () => {
    assert.strictEqual(byName.search.description, 'Search threads');
    assert.strictEqual(byName.inviteUser.description, '');
  });

  it('surfaces methods in toPaths with a full path template', () => {
    const paths = Thread.toPaths();
    const search = paths.methods.find(m => m.method === 'search');
    assert.strictEqual(search.path, '/Thread/search');
    assert.strictEqual(search.verb, 'get');
    assert.strictEqual(search.kind, 'static');
  });

  it('throws when a declared method exists as neither instance nor static', () => {
    class Bad extends BaseModel {
      static fields = {id: {type: 'uuid', primaryKey: true}};
      static exposedMethods = [{method: 'doesNotExist', verb: 'get'}];
    }
    Bad._register();
    assert.throws(() => Bad.getExposedMethods(), /neither an instance method/);
  });
});
