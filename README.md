# @simpleworkjs/orm

Base model-first ORM for [SimpleWorkJS](https://github.com/simpleworkjs). Supports multiple backends: Sequelize/SQL, Redis, and LDAP.

## Install

```bash
npm install @simpleworkjs/orm
```

## Usage

```js
const {init, Model} = require('@simpleworkjs/orm');

class Task extends Model {
  static fields = {
    id: {type: 'uuid', primaryKey: true},
    title: {type: 'string', isRequired: true},
    done: {type: 'boolean', default: false},
  };
}

(async function() {
  const models = await init({
    conf: {
      orm: {
        dialect: 'sqlite',
        storage: 'data.sqlite',
        logging: false,
      },
    },
    models: [Task],
  });

  const task = await models.Task.create({title: 'My first task'});
  console.log(task.toJSON());
})();
```

## Field types

| Type | Description | Options |
|------|-------------|---------|
| `string` | `VARCHAR` string | `min`, `max` length |
| `text` | Unlimited text | — |
| `int` / `integer` | Integer | `min`, `max` |
| `float` | Floating point | — |
| `boolean` | Boolean | `default` |
| `json` | JSON object | — |
| `date` | Date/time | — |
| `uuid` | UUID, defaults to `UUIDV4` | `primaryKey` |
| `email` | String with email validation | — |
| `password-bcrypt` | String hashed with bcrypt, private | `saltRounds` |
| `hasOne` | Foreign-key relationship | `model`, `remoteKey`, `isRequired` |
| `hasMany` | Reverse relationship | `model`, `remoteKey` |
| `belongsToMany` | Many-to-many through join model | `model`, `through`, `foreignKey`, `otherKey` |

### Common field options

All field types accept:

- `isRequired` — maps to `allowNull: false`.
- `default` — default value for the column.
- `primaryKey` — marks the field as the primary key.
- `unique` — adds a unique constraint.
- `isPrivate` — hidden from `toJSON()`.
- `display` — UI hints such as `searchable`, `titleField`, `name`.
- `form` — form rendering hints.
- `validate` — custom Sequelize validators.

### Example model

```js
class Task extends Model {
  static fields = {
    id: {type: 'uuid', primaryKey: true},
    title: {type: 'string', isRequired: true, max: 200, display: {searchable: true}},
    description: {type: 'text'},
    done: {type: 'boolean', default: false},
    createdBy: {type: 'hasOne', model: 'User'},
  };

  static display = {
    name: 'Task',
    titleField: 'title',
  };
}
```

## Relationships

A `hasOne` field creates a foreign-key column on the model. For example, `createdBy: {type: 'hasOne', model: 'User'}` creates a `createdById` UUID column. The referenced model must be loaded into the same ORM instance.

A `hasMany` field is used for the reverse side of a relationship and is handled by the Sequelize adapter during `associateModels()`.

## Multi-backend

Set `static adapterName` on a model to choose its backend:

```js
class CacheEntry extends Model {
  static adapterName = 'redis';
  static fields = { /* ... */ };
}

class DirectoryUser extends Model {
  static adapterName = 'ldap';
  static fields = { /* ... */ };
}
```

Adapters are created automatically when a model requests them.

## Adapters

- `sequelize` — default. Supports SQLite, Postgres, MySQL, etc.

  ```js
  conf: {
    orm: {
      dialect: 'sqlite',
      storage: 'data.sqlite',
      logging: false,
    },
  }
  ```

- `redis` — uses `model-redis`.

  ```js
  conf: {
    orm: {
      redis: { /* model-redis options */ },
    },
  }
  ```

- `ldap` — uses `ldapts`.

  ```js
  conf: {
    orm: {
      ldap: { url: 'ldap://localhost', bindDN: '...', bindPassword: '...', userBase: '...' },
    },
  }
  ```

## Model API

Models are classes that extend `@simpleworkjs/orm`. After `init()` resolves, each model class has static CRUD methods:

```js
const task = await models.Task.create({title: 'New task'});
const list = await models.Task.list({where: {done: false}});
const one = await models.Task.get(task.id);
await one.update({done: true});
await one.delete();
```

Instance data is accessed as normal properties. `toJSON()` returns a plain object without private fields.

### Hooks / lifecycle callbacks

Models can register hooks that run at various lifecycle points:

```js
class Task extends Model {
  static fields = { /* ... */ };
}

// Hook registration (all return the Model for chaining)
Task.beforeCreate((data, options) => { /* modify data before insert */ });
Task.afterCreate((instance, options) => { /* e.g. send notification */ });
Task.beforeUpdate((data, options, instance) => { /* modify data before update */ });
Task.afterUpdate((instance, options) => { /* e.g. invalidate cache */ });
Task.beforeDestroy((instance, options) => { /* e.g. check dependencies */ });
Task.afterDestroy((instance, options) => { /* e.g. cleanup related records */ });
Task.beforeValidate((data, options, instance) => { /* pre-validation transform */ });
Task.afterValidate((data, options, instance) => { /* post-validation check */ });
Task.beforeSave((data, options, type, instance) => { /* runs before create or update */ });
Task.afterSave((instance, options, type) => { /* runs after create or update */ });

// Alternative: addHook method
Task.addHook('beforeCreate', fn);
```

Hooks fire in order — multiple hooks of the same type all execute in registration order.

### Validation

Field-level and model-level validators run automatically before `create()` and `update()`:

```js
class Task extends Model {
  static fields = {
    title: {
      type: 'string',
      validate: {
        custom: (value) => {
          if (value.length < 3) throw new Error('title must be at least 3 chars');
        },
      },
    },
  };
}

// Model-level validator (e.g. cross-field validation)
Task.addValidator('dateOrder', (data) => {
  if (new Date(data.start) > new Date(data.end)) {
    throw new Error('start date must be before end date');
  }
});

// Async validators are supported (e.g. uniqueness check)
Task.addValidator('uniqueName', async (data) => {
  const existing = await Task.list({where: {name: data.name}});
  if (existing.length > 0) throw new Error('name already exists');
});
```

Validation errors throw an `Error` with a `validationErrors` array containing `{field, validator, message}` objects.

### Soft-delete (paranoid mode)

Models can enable paranoid mode to soft-delete records instead of removing them:

```js
class Task extends Model {
  static fields = {
    id: {type: 'uuid', primaryKey: true},
    name: {type: 'string'},
    is_deleted: {type: 'boolean', default: false},
  };
  static paranoid = true;        // Enable soft-delete
  static deletedField = 'is_deleted';  // Default field name
}

// Soft-delete a record (marks is_deleted = true)
await task.delete();  // or task.softDelete()

// Hard-delete (permanently remove)
await task.delete({force: true});

// Restore a soft-deleted record
await task.restore();

// list() and get() automatically filter out deleted records
const tasks = await Task.list();  // excludes deleted
const task = await Task.get(id);  // null if deleted

// Include deleted records
const task = await Task.get(id, {includeDeleted: true});
const all = await Task.list({where: {is_deleted: {ne: true}}});  // explicit filter
```

### Query operators

The `where` clause supports operators for advanced filtering:

```js
// Greater than / less than
Model.list({where: {value: {gt: 10}}});   // value > 10
Model.list({where: {value: {gte: 10}}});  // value >= 10
Model.list({where: {value: {lt: 10}}});   // value < 10
Model.list({where: {value: {lte: 10}}});  // value <= 10

// Not equal
Model.list({where: {status: {ne: 'deleted'}}});

// IN array
Model.list({where: {status: {in: ['active', 'pending']}}});

// LIKE pattern (SQL only)
Model.list({where: {name: {like: '%Doe%'}}});

// Combined operators
Model.list({
  where: {
    value: {gte: 10},
    status: 'active',
  },
});
```

### Transactions

Transactions are supported for the Sequelize adapter:

```js
// Auto-managed transaction (commits on success, rolls back on error)
await orm.transaction(async ({transaction}) => {
  const parent = await ParentModel.create({name: 'parent'}, {transaction});
  await ChildModel.create({parentId: parent.id, name: 'child'}, {transaction});
});

// Manual transaction control
const t = await orm.transaction();
try {
  await Model.create(data, {transaction: t});
  await t.commit();
} catch (e) {
  await t.rollback();
  throw e;
}
```

### belongsToMany (many-to-many) relationships

Many-to-many relationships through a join model:

```js
// Join model
class UserRole extends Model {
  static fields = {
    id: {type: 'uuid', primaryKey: true},
    userId: {type: 'uuid'},
    roleId: {type: 'uuid'},
  };
}

// Models with belongsToMany
class User extends Model {
  static fields = {
    id: {type: 'uuid', primaryKey: true},
    roles: {type: 'belongsToMany', model: 'Role', through: 'UserRole'},
  };
}

class Role extends Model {
  static fields = {
    id: {type: 'uuid', primaryKey: true},
    users: {type: 'belongsToMany', model: 'User', through: 'UserRole'},
  };
}
```

### listDetail()

For Redis adapter parity, `list()` accepts `{detail: true}` to explicitly return full objects:

```js
const results = await Model.list({detail: true});  // same as list() for SQL
```

### Exposing custom methods

A model can declare `static exposedMethods` to mark its own instance or
static methods for exposure (e.g. as REST endpoints by `@simpleworkjs/backend`).
`Model.getExposedMethods()` validates and normalizes the declaration
(auto-detecting instance vs. static, filling defaults, computing the route
template), and `Model.toPaths().methods` surfaces them for discovery:

```js
class Thread extends Model {
  static exposedMethods = [
    {method: 'inviteUser', route: 'invite', verb: 'post', args: {from: 'body', names: ['username', 'role']}},
    {method: 'search', verb: 'get', args: {from: 'query', names: ['q']}}, // static method
  ];
  async inviteUser(username, role) { /* ... */ }
  static async search(q) { /* ... */ }
}
```

See the [`@simpleworkjs/backend` README](https://github.com/simpleworkjs/backend#exposed-methods) for the full field reference and how they mount as routes.

## Migrations

When used with `@simpleworkjs/backend`, the CLI can diff your model definitions against existing migration files and generate Sequelize-compatible migrations. See the backend CLI documentation for the migration workflow.

## Tests

```bash
npm test
```

## Related packages

- [`@simpleworkjs/orm-identity`](https://github.com/simpleworkjs/orm-identity) — adds users, groups, roles, permissions, and token/session auth on top of this base ORM.
- [`@simpleworkjs/backend`](https://github.com/simpleworkjs/backend) — Express/Socket.IO framework that turns these models into a REST API, live-syncing UI, and CLI.

## License

MIT
