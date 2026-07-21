'use strict';

const {describe, it, before, after} = require('node:test');
const assert = require('node:assert');
const {ORM, Model} = require('../../index');

/**
 * In-memory Redis adapter used only for cross-adapter tests.
 * Implements the same CRUD interface as RedisAdapter without a real Redis server.
 */
class MemoryRedisAdapter {
  constructor() {
    this.store = new Map();
  }

  _nextId() {
    return String(Date.now()) + String(Math.random()).slice(2, 8);
  }

  registerModel(Model) {
    this.store.set(Model.name, new Map());
    Model.backingModel = this;
  }

  async sync() {}

  async list(Model) {
    const rows = Array.from(this.store.get(Model.name).values());
    return rows.map(row => new Model(row));
  }

  async create(Model, data) {
    const pk = data[Model.primaryKey.name] || this._nextId();
    const row = {...data, [Model.primaryKey.name]: pk};
    this.store.get(Model.name).set(pk, row);
    return new Model(row);
  }

  async get(Model, pk) {
    const row = this.store.get(Model.name).get(pk);
    if (!row) {
      const err = new Error('EntryNotFound');
      err.name = 'EntryNotFound';
      throw err;
    }
    return new Model(row);
  }

  async update(instance, data) {
    const Model = instance.constructor;
    const pk = instance.primaryKey;
    const row = this.store.get(Model.name).get(pk);
    Object.assign(row, data);
    return instance;
  }

  async delete(instance) {
    const Model = instance.constructor;
    this.store.get(Model.name).delete(instance.primaryKey);
  }
}

describe('Cross-adapter relationships', () => {
  let orm;

  before(async () => {
    orm = new ORM({
      orm: {
        dialect: 'sqlite',
        storage: ':memory:',
        logging: false,
      },
    });

    // Wire the in-memory adapter in for models that request adapterName = 'redis'.
    const memoryRedis = new MemoryRedisAdapter();
    orm._ensureAdapter = function(name) {
      if (name === 'redis') return memoryRedis;
      return Object.getPrototypeOf(this)._ensureAdapter.call(this, name);
    };

    class User extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        userName: {type: 'string', isRequired: true},
      };
    }

    class Session extends Model {
      static adapterName = 'redis';
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        token: {type: 'string', isRequired: true},
        user: {type: 'hasOne', model: 'User'},
      };
    }

    class Project extends Model {
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        name: {type: 'string', isRequired: true},
      };
    }

    class CacheEntry extends Model {
      static adapterName = 'redis';
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        key: {type: 'string', isRequired: true},
        project: {type: 'hasOne', model: 'Project'},
      };
    }

    await orm.load([User, Session, Project, CacheEntry]);
  });

  after(async () => {
    if (orm) await orm.close();
  });

  it('resolves hasOne from Redis-backed model to SQL-backed model', async () => {
    const {User, Session} = orm.models;

    const user = await User.create({userName: 'alice'});
    assert.ok(user.id, 'user created');

    const session = await Session.create({token: 'secret-token', userId: user.id});
    assert.strictEqual(session.userId, user.id, 'session stores userId');

    const relatedUser = await session.getRelated('user');
    assert.ok(relatedUser, 'related user resolved');
    assert.strictEqual(relatedUser.userName, 'alice');
  });

  it('returns null for unresolved hasOne foreign key', async () => {
    const {Session} = orm.models;
    const session = await Session.create({token: 'orphan-token'});
    const relatedUser = await session.getRelated('user');
    assert.strictEqual(relatedUser, null);
  });

  it('resolves hasOne from Redis cache entry to SQL project', async () => {
    const {Project, CacheEntry} = orm.models;

    const project = await Project.create({name: 'Alpha'});
    const entry = await CacheEntry.create({key: 'alpha-cache', projectId: project.id});

    const relatedProject = await entry.getRelated('project');
    assert.ok(relatedProject);
    assert.strictEqual(relatedProject.name, 'Alpha');
  });

  it('throws for unknown relationship name', async () => {
    const {Session} = orm.models;
    const session = await Session.create({token: 'token'});
    await assert.rejects(
      () => session.getRelated('nonexistent'),
      /has no relationship/
    );
  });

  it('throws when related model is not loaded', async () => {
    class Bookmark extends Model {
      static adapterName = 'redis';
      static fields = {
        id: {type: 'uuid', primaryKey: true},
        page: {type: 'hasOne', model: 'Page'},
      };
    }

    await orm.load([Bookmark]);
    const bookmark = await orm.models.Bookmark.create({pageId: 'does-not-exist'});
    await assert.rejects(
      () => bookmark.getRelated('page'),
      /Unknown related model/
    );
  });
});
