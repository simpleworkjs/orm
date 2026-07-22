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

  // Hooks: arrays of functions to call at lifecycle points
  static _hooks = null;

  // Soft-delete: enable paranoid mode to filter out deleted records
  static paranoid = false;
  static deletedField = 'is_deleted';

  // Composite primary key support
  static compositeKey = null; // array of field names if composite

  // Validation: custom validators registry
  static _validators = {};

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

    if (!this.primaryKey && !this.compositeKey) {
      const idField = fields.create('id', {type: 'int', primaryKey: true, autoIncrement: true});
      this.fieldInstances.id = idField;
      this.primaryKey = idField;
    }
  }

  // Hook registration: Model.addHook('beforeCreate', fn) or Model.beforeCreate(fn)
  static addHook(hookName, fn) {
    if (!this._hooks) this._hooks = {
      beforeCreate: [], afterCreate: [],
      beforeUpdate: [], afterUpdate: [],
      beforeDestroy: [], afterDestroy: [],
      beforeValidate: [], afterValidate: [],
      beforeSave: [], afterSave: [],
    };
    if (this._hooks[hookName]) {
      this._hooks[hookName].push(fn);
    }
    return this;
  }

  // Convenience methods for each hook type
  static beforeCreate(fn) { return this.addHook('beforeCreate', fn); }
  static afterCreate(fn) { return this.addHook('afterCreate', fn); }
  static beforeUpdate(fn) { return this.addHook('beforeUpdate', fn); }
  static afterUpdate(fn) { return this.addHook('afterUpdate', fn); }
  static beforeDestroy(fn) { return this.addHook('beforeDestroy', fn); }
  static afterDestroy(fn) { return this.addHook('afterDestroy', fn); }
  static beforeValidate(fn) { return this.addHook('beforeValidate', fn); }
  static afterValidate(fn) { return this.addHook('afterValidate', fn); }
  static beforeSave(fn) { return this.addHook('beforeSave', fn); }
  static afterSave(fn) { return this.addHook('afterSave', fn); }

  // Run hooks for a given type
  static async runHooks(hookName, ...args) {
    if (!this._hooks || !this._hooks[hookName]) return;
    for (const hook of this._hooks[hookName]) {
      await hook.apply(this, args);
    }
  }

  // Register a custom validator
  static addValidator(name, fn) {
    this._validators[name] = fn;
  }

  // Run all validators on data
  static async runValidators(data, existing) {
    const errors = [];
    const record = existing ? Object.assign({}, existing, data) : data;

    // Field-level validators
    for (const [name, field] of Object.entries(this.fieldInstances)) {
      if (field.validate) {
        for (const [vName, vConfig] of Object.entries(field.validate)) {
          const value = data[name];
          if (value === undefined) continue;
          if (vName === 'custom' && typeof vConfig === 'function') {
            try {
              await vConfig(value, record);
            } catch (e) {
              errors.push({field: name, validator: vName, message: e.message});
            }
          }
        }
      }
    }

    // Model-level custom validators
    for (const [name, fn] of Object.entries(this._validators)) {
      try {
        await fn(data, record);
      } catch (e) {
        errors.push({field: '*', validator: name, message: e.message});
      }
    }

    if (errors.length) {
      const err = new Error('Validation failed: ' + errors.map(e => e.message).join('; '));
      err.validationErrors = errors;
      throw err;
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
    args = args || {};
    // Apply soft-delete filter for paranoid models
    if (this.paranoid) {
      args.where = args.where || {};
      args.where[this.deletedField] = {ne: true};
    }
    // Support listDetail() for Redis adapter parity
    if (args.detail === true) {
      return this.orm.adapter(this).listDetail(this, args);
    }
    return this.orm.adapter(this).list(this, args);
  }

  // Total number of rows matching `args.where` (ignoring limit/offset), for
  // pagination. Delegates to the adapter, which may implement a native count
  // or fall back to counting a filtered list.
  static async count(args) {
    args = args || {};
    // Apply soft-delete filter for paranoid models
    if (this.paranoid) {
      args.where = args.where || {};
      args.where[this.deletedField] = {ne: true};
    }
    return this.orm.adapter(this).count(this, args);
  }

  static async create(data, options) {
    options = options || {};
    // Run validation
    await this.runHooks('beforeValidate', data, options);
    await this.runValidators(data, null);
    await this.runHooks('afterValidate', data, options);

    // Run beforeSave and beforeCreate hooks
    await this.runHooks('beforeSave', data, options, 'create');
    await this.runHooks('beforeCreate', data, options);

    data = await this.preSave(data, false);
    const instance = await this.orm.adapter(this).create(this, data, options);

    // Run afterCreate and afterSave hooks
    await this.runHooks('afterCreate', instance, options);
    await this.runHooks('afterSave', instance, options, 'create');

    this.orm._publish('create', this.name, instance.primaryKey, instance);
    return instance;
  }

  static async get(pk, options) {
    options = options || {};
    // Apply soft-delete filter for paranoid models
    if (this.paranoid && !options.includeDeleted) {
      const results = await this.list({where: {[this.primaryKey.name]: pk}});
      return results[0] || null;
    }
    return this.orm.adapter(this).get(this, pk);
  }

  async update(data, options) {
    options = options || {};
    const Model = this.constructor;

    // Run validation
    await Model.runHooks('beforeValidate', data, options, this);
    await Model.runValidators(data, this._backing);
    await Model.runHooks('afterValidate', data, options, this);

    // Run beforeSave and beforeUpdate hooks
    await Model.runHooks('beforeSave', data, options, 'update', this);
    await Model.runHooks('beforeUpdate', data, options, this);

    const persisted = await Model.preSave(data, true);
    await Model.orm.adapter(this).update(this, persisted);

    // Reflect the persisted values back onto this wrapper
    for (const [key, value] of Object.entries(persisted)) {
      this[key] = value;
    }

    // Run afterUpdate and afterSave hooks
    await Model.runHooks('afterUpdate', this, options);
    await Model.runHooks('afterSave', this, options, 'update');

    Model.orm._publish('update', Model.name, this.primaryKey, this);
    return this;
  }

  async delete(options) {
    options = options || {};
    const Model = this.constructor;
    const pk = this.primaryKey;

    // Soft-delete for paranoid models (unless force is specified)
    if (Model.paranoid && !options.force) {
      return this.softDelete(options);
    }

    // Run beforeDestroy hooks
    await Model.runHooks('beforeDestroy', this, options);

    await Model.orm.adapter(this).delete(this);

    // Run afterDestroy hooks
    await Model.runHooks('afterDestroy', this, options);

    Model.orm._publish('delete', Model.name, pk, null);
  }

  // Soft-delete: mark as deleted without removing from database
  async softDelete(options) {
    options = options || {};
    const Model = this.constructor;
    const deleteField = Model.deletedField || 'is_deleted';

    await Model.runHooks('beforeDestroy', this, options);

    const data = {[deleteField]: true};
    if (options.deletedAtField) {
      data[options.deletedAtField] = new Date().toISOString();
    }
    await Model.orm.adapter(this).update(this, data);
    this[deleteField] = true;

    await Model.runHooks('afterDestroy', this, options);
    Model.orm._publish('delete', Model.name, this.primaryKey, this);
  }

  // Restore a soft-deleted record
  async restore(options) {
    options = options || {};
    const Model = this.constructor;
    const deleteField = Model.deletedField || 'is_deleted';

    await Model.runHooks('beforeUpdate', {[deleteField]: false}, options, this);

    const data = {[deleteField]: false};
    if (options.deletedAtField) {
      data[options.deletedAtField] = null;
    }
    await Model.orm.adapter(this).update(this, data);
    this[deleteField] = false;

    await Model.runHooks('afterUpdate', this, options);
    Model.orm._publish('update', Model.name, this.primaryKey, this);
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
