'use strict';

const fields = require('./fields');

class BaseModel {
  static fields = {};
  static display = {};
  static permissions = {};
  static exposedMethods = [];
  // Default rows-per-page for paginated list endpoints / the generated UI.
  static pageSize = 20;
  static orm = null;
  static backingModel = null;
  static tableName = null;
  static adapterName = 'sequelize';

  static fieldInstances = {};
  static relationships = [];
  static primaryKey = null;

  static _register() {
    this.fieldInstances = {};
    this.relationships = [];
    this.primaryKey = null;

    for (const [name, options] of Object.entries(this.fields)) {
      const field = fields.create(name, options);
      this.fieldInstances[name] = field;
      if (field.primaryKey) this.primaryKey = field;
      if (field.isRelationship) this.relationships.push(field);

      // HasManyField guesses its remote foreign-key column from the *remote*
      // model's own name by default, which is never right (that column lives
      // on the remote model's table and points back to *this* model). Fix
      // the guess up to reference this model's name once it's known.
      if (field.type === 'hasMany' && !field.remoteKey) {
        field.foreignKey = `${this.name.toLowerCase()}Id`;
      }
    }

    if (!this.primaryKey) {
      const idField = fields.create('id', {type: 'int', primaryKey: true, autoIncrement: true});
      this.fieldInstances.id = idField;
      this.primaryKey = idField;
    }
  }

  constructor(backingInstance) {
    this._backing = backingInstance;
    this.primaryKey = backingInstance[this.constructor.primaryKey.name];

    for (const [name, field] of Object.entries(this.constructor.fieldInstances)) {
      let value = backingInstance[name];
      let propName = name;

      if (field.isRelationship && field.foreignKey) {
        value = backingInstance[field.foreignKey];
        propName = field.foreignKey;
      }

      if (field.isPrivate) {
        Object.defineProperty(this, propName, {
          value,
          enumerable: false,
          writable: true,
          configurable: true,
        });
      } else {
        this[propName] = value;
      }

      if (field.injectMethods) {
        const methods = field.injectMethods(name);
        for (const [methodName, method] of Object.entries(methods)) {
          Object.defineProperty(this, methodName, {
            value: method.bind(this),
            enumerable: false,
            writable: true,
            configurable: true,
          });
        }
      }
    }
  }

  toJSON() {
    const out = {};
    const backing = this._backing;
    for (const [name, field] of Object.entries(this.constructor.fieldInstances)) {
      if (field.isPrivate) continue;
      if (field.isRelationship && field.foreignKey) {
        const value = backing[field.foreignKey];
        if (value !== undefined) out[field.foreignKey] = value;
      } else {
        const value = backing[name];
        if (value !== undefined) out[name] = value;
      }
    }
    return out;
  }

  static async preSave(data, partial) {
    const out = {};
    for (const [name, field] of Object.entries(this.fieldInstances)) {
      if (field.isRelationship && field.foreignKey) {
        if (partial && !(field.foreignKey in data) && !(name in data)) continue;
        const value = data[field.foreignKey] !== undefined ? data[field.foreignKey] : data[name];
        if (value !== undefined) out[field.foreignKey] = value;
        continue;
      }
      if (field.isRelationship) continue;
      if (partial && !(name in data)) continue;
      let value = data[name];
      if (field.preSave) {
        value = await field.preSave(value, data);
      }
      if (value !== undefined) out[name] = value;
    }
    return out;
  }

  static async list(args) {
    return this.orm.adapter(this).list(this, args);
  }

  // Total number of rows matching `args.where` (ignoring limit/offset), for
  // pagination. Delegates to the adapter, which may implement a native count
  // or fall back to counting a filtered list.
  static async count(args) {
    return this.orm.adapter(this).count(this, args);
  }

  static async create(data) {
    data = await this.preSave(data, false);
    const instance = await this.orm.adapter(this).create(this, data);
    this.orm._publish('create', this.name, instance.primaryKey, instance);
    return instance;
  }

  static async get(pk) {
    return this.orm.adapter(this).get(this, pk);
  }

  async update(data) {
    const persisted = await this.constructor.preSave(data, true);
    await this.constructor.orm.adapter(this).update(this, persisted);
    // Reflect the persisted values back onto this wrapper so `this.field` isn't
    // stale after an update (the adapter writes to the backing store, not to
    // these properties). Every field property already exists from the
    // constructor, so plain assignment updates the value while preserving a
    // private field's non-enumerable descriptor. `persisted` is partial and
    // uses column/foreign-key names, which is exactly how the properties are
    // keyed. Adapter-agnostic: it does not read the backing instance, whose
    // shape varies (Sequelize row vs. Redis table handle vs. LDAP entry).
    for (const [key, value] of Object.entries(persisted)) {
      this[key] = value;
    }
    this.constructor.orm._publish('update', this.constructor.name, this.primaryKey, this);
    return this;
  }

  async delete() {
    const pk = this.primaryKey;
    await this.constructor.orm.adapter(this).delete(this);
    this.constructor.orm._publish('delete', this.constructor.name, pk, null);
  }

  async getRelated(relationName) {
    const Model = this.constructor;
    const field = Model.fieldInstances[relationName];
    if (!field || !field.isRelationship) {
      throw new Error(`${Model.name} has no relationship "${relationName}"`);
    }

    const RemoteModel = Model.orm.models[field.model];
    if (!RemoteModel) {
      throw new Error(`Unknown related model: ${field.model}`);
    }

    if (field.type === 'hasOne') {
      const fk = this[field.foreignKey];
      if (fk === undefined || fk === null) return null;
      return await RemoteModel.get(fk);
    }

    if (field.type === 'hasMany') {
      const remoteKey = field.remoteKey || field.foreignKey;
      return await RemoteModel.list({where: {[remoteKey]: this.primaryKey}});
    }

    throw new Error(`Unsupported relationship type: ${field.type}`);
  }

  static toSchema() {
    const fieldSchemas = {};
    for (const [name, field] of Object.entries(this.fieldInstances)) {
      let schema = field.toSchema();
      if (field.isRelationship) {
        const remoteModel = this.orm.models[field.model];
        schema = field.toSchema(remoteModel);
      }
      fieldSchemas[name] = schema;
    }

    return {
      name: this.name,
      pk: this.primaryKey.name,
      display: {
        name: this.display.name || this.name,
        titleField: this.display.titleField || this.primaryKey.name,
        // Default rows-per-page for the generated collection UI; override with
        // `static pageSize` on the model.
        pageSize: this.pageSize,
        ...this.display,
      },
      fields: fieldSchemas,
      permissions: this.permissionsSchema(),
      // The tiered access grants ({owner,group,everyone}×{crud}) the permission
      // editor reads/writes. Comes from the DB-backed policy when present, else
      // translated from the code-declared `static permissions`.
      access: this.accessSchema(),
    };
  }

  // The tiered access grants for this model. Sourced from the runtime,
  // DB-backed policy (`orm._accessPolicy`, built by @simpleworkjs/orm-identity
  // from the entity grants on active Roles) when one exists, otherwise
  // translated from the code-declared `static permissions` so a fresh app still
  // has sensible, editable defaults. Shape:
  //   {owner:{create,read,update,delete}, group:{…}, everyone:{…}}  (booleans)
  static accessSchema() {
    const policy = this.orm && this.orm._accessPolicy && this.orm._accessPolicy[this.name];
    return policy || this._staticAccessDefaults();
  }

  // Translate the token-based `static permissions` into tiered grants: `public`
  // and `user` map to the `everyone` tier, `owner` to the `owner` tier, and
  // `admin` is left to the isAdmin bypass (no explicit tier). Used to seed the
  // DB policy and as the fallback when no policy exists yet.
  static _staticAccessDefaults() {
    const tiers = {owner: {}, group: {}, everyone: {}};
    for (const action of ['read', 'create', 'update', 'delete']) {
      for (const tier of ['owner', 'group', 'everyone']) tiers[tier][action] = false;
      const tokens = this.permissionsFor(action);
      if (tokens.includes('public') || tokens.includes('user')) tiers.everyone[action] = true;
      if (tokens.includes('owner')) tiers.owner[action] = true;
    }
    return tiers;
  }

  // A per-action token summary derived from the tiered grants, for display in
  // the API docs / debug views (keeps the historical `{read:[…],…}` shape).
  static permissionsSchema() {
    const access = this.accessSchema();
    const out = {};
    for (const action of ['read', 'create', 'update', 'delete']) {
      const tokens = [];
      if (access.everyone && access.everyone[action]) tokens.push('user');
      if (access.owner && access.owner[action]) tokens.push('owner');
      if (!tokens.length) tokens.push('admin'); // only the isAdmin bypass grants it
      out[action] = tokens;
    }
    return out;
  }

  static toPaths() {
    return {
      base: [
        {method: 'get', path: `/${this.name}`, description: `List ${this.name}`},
        {method: 'post', path: `/${this.name}`, description: `Create ${this.name}`},
        {method: 'get', path: `/${this.name}/:${this.primaryKey.name}`, description: `Get one ${this.name}`},
        {method: 'put', path: `/${this.name}/:${this.primaryKey.name}`, description: `Update ${this.name}`},
        {method: 'delete', path: `/${this.name}/:${this.primaryKey.name}`, description: `Delete ${this.name}`},
      ],
      // Custom domain methods (instance + static) a model opts into exposing as
      // REST endpoints via `static exposedMethods`. Mounted by the backend; the
      // `path` here is the URL template a client can discover through OPTIONS.
      methods: this.getExposedMethods().map(m => ({
        method: m.method,
        route: m.route,
        verb: m.verb,
        kind: m.kind,
        args: m.args,
        permission: m.permission,
        description: m.description,
        path: `/${this.name}${m.routePath}`,
      })),
    };
  }

  // Default action required per HTTP verb when an exposed method does not
  // declare its own `permission`. Mirrors the CRUD mapping.
  static _verbPermission(verb) {
    return {get: 'read', post: 'update', put: 'update', patch: 'update', delete: 'delete'}[verb] || 'update';
  }

  // Validate and normalize `static exposedMethods` into a canonical shape the
  // backend can mount directly. Auto-detects whether each entry names an
  // instance method (on the prototype) or a static/class method (on the class),
  // fills defaults (route, verb, permission), and computes the mounted URL
  // template. Throws if the named method exists as neither.
  static getExposedMethods() {
    return (this.exposedMethods || []).map(raw => {
      if (!raw || typeof raw.method !== 'string' || !raw.method) {
        throw new Error(`${this.name}.exposedMethods: each entry needs a string "method"`);
      }
      const name = raw.method;

      let kind = raw.kind;
      if (!kind) {
        if (typeof this.prototype[name] === 'function') kind = 'instance';
        else if (typeof this[name] === 'function') kind = 'static';
        else {
          throw new Error(
            `${this.name}.exposedMethods: "${name}" is neither an instance method ` +
            `(on the prototype) nor a static method (on the class)`
          );
        }
      }

      const verb = (raw.verb || 'post').toLowerCase();
      const route = raw.route || name;
      const args = raw.args || null;
      const permission = raw.permission || this._verbPermission(verb);
      const description = raw.description || '';

      // Param-sourced args become path segments (e.g. .../users/:username).
      let paramSegments = '';
      if (args && args.from === 'params' && Array.isArray(args.names)) {
        paramSegments = args.names.map(n => `/:${n}`).join('');
      }
      // Instance methods operate on one record, so they mount under the pk.
      const prefix = kind === 'instance' ? `/:${this.primaryKey.name}/` : '/';
      const routePath = `${prefix}${route}${paramSegments}`;

      return {method: name, kind, verb, route, args, permission, description, routePath};
    });
  }

  static permissionsFor(action) {
    const defaults = {
      read: ['user'],
      create: ['admin'],
      update: ['admin', 'owner'],
      delete: ['admin'],
    };
    const declared = this.permissions[action];
    if (declared === undefined) return defaults[action] || ['admin'];
    return Array.isArray(declared) ? declared : [declared];
  }

  hasPermission(user, action) {
    return this.constructor.canAccess(user, action, this);
  }

  static hasPermission(user, action) {
    return this.canAccess(user, action, null);
  }

  // Central access decision for (user, action, record). `record` may be a model
  // instance or a plain object (e.g. a WebSocket payload's `data`) — only its
  // owner fields are read. Uses the DB-backed tiered policy when the model has
  // one, otherwise the code-declared token rules.
  static canAccess(user, action, record) {
    const decided = this._accessCheck(user, action, record);
    if (decided !== null) return decided;
    return this._evaluatePermissions(this.permissionsFor(action), user, record);
  }

  // Reggy-style tiered access check against the runtime DB policy
  // (`orm._accessPolicy`, built by @simpleworkjs/orm-identity). Returns a
  // boolean when this model has a policy, or `null` to mean "no DB rules — fall
  // back to the token evaluation". The caller's relationship to the record picks
  // which tier(s) apply; grants cascade (an owner also gets group/everyone
  // grants). Anonymous requests use the token/public path.
  static _accessCheck(user, action, instance) {
    const policy = this.orm && this.orm._accessPolicy && this.orm._accessPolicy[this.name];
    if (!policy) return null;
    if (!user) return null;

    const perms = user.permissions || [];
    const isAdmin = Array.isArray(perms) ? perms.includes('admin') : (perms.has ? perms.has('admin') : false);
    if (isAdmin) return true;

    let tiers = ['everyone'];
    if (instance) {
      const ownerId = instance.createdById || instance.ownerId || instance.userId;
      if (ownerId && ownerId === user.id) tiers = ['owner', 'group', 'everyone'];
    }
    return tiers.some(function(t) { return policy[t] && policy[t][action] === true; });
  }

  static _evaluatePermissions(allowed, user, instance) {
    if (!allowed || !allowed.length) return false;
    if (allowed.includes('public')) return true;
    if (!user) return false;

    const userPermissions = user.permissions || [];
    const hasPerm = Array.isArray(userPermissions)
      ? p => userPermissions.includes(p)
      : p => userPermissions.has(p);

    if (allowed.includes('admin') && hasPerm('admin')) return true;
    if (allowed.includes('user')) return true;

    if (instance && allowed.includes('owner')) {
      const ownerId = instance.createdById || instance.ownerId || instance.userId;
      if (ownerId && ownerId === user.id) return true;
    }

    for (const perm of allowed) {
      if (hasPerm(perm)) return true;
    }

    return false;
  }
}

module.exports = {BaseModel};
