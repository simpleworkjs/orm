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
| `date` | Date/time | — |
| `uuid` | UUID, defaults to `UUIDV4` | `primaryKey` |
| `email` | String with email validation | — |
| `password-bcrypt` | String hashed with bcrypt, private | `saltRounds` |
| `hasOne` | Foreign-key relationship | `model`, `remoteKey`, `isRequired` |
| `hasMany` | Reverse relationship | `model`, `remoteKey` |

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
      ldap: { url: 'ldap://localhost', bindDN: '...', bindCredentials: '...' },
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

## Migrations

When used with `@simpleworkjs/backend`, the CLI can diff your model definitions against existing migration files and generate Sequelize-compatible migrations. See the backend CLI documentation for the migration workflow.

## Tests

```bash
npm test
```

## License

MIT
