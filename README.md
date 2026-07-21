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

- `sequelize` — default, uses Sequelize with SQLite/Postgres/MySQL.
- `redis` — uses `model-redis`.
- `ldap` — uses `ldapts`.

## License

MIT
