# Changelog

## 0.2.0

### Changed

- **Updated dependencies to clear all known advisories.** `bcrypt` `^5.1.1` →
  `^6.0.0` (drops the vulnerable `@mapbox/node-pre-gyp` → `tar` chain in favour
  of `node-gyp-build`), `sqlite3` `^5.1.7` → `^6.0.1` (drops the vulnerable
  `node-gyp` → `tar` chain), `uuid` `^9.0.1` → `^11.1.1`, and `sequelize`
  `^6.35.2` → `^6.37.8`. Added an `overrides` entry pinning `uuid` to `^11.1.1`
  so Sequelize's bundled copy is forced up as well. `npm audit` is clean and all
  tests pass. Consumers on `^0.1.x` should bump to `^0.2.0`.

### Fixed

- **`npm test` was silently skipping root-level test files.** The script ran
  `node --test test/**/*.test.js`; without `bash` globstar enabled (the
  default), that pattern only matched files in subdirectories of `test/`
  (`test/adapters/*`, `test/cli/*`) and silently dropped `test/base.test.js`
  and `test/fields.test.js`. Changed to `node --test`, which lets Node's test
  runner auto-discover all test files under the project.
- **LDAP DN injection** (`lib/adapters/ldap.js`): the primary key was
  interpolated into the entry DN with no escaping on `create`/`update`/`delete`.
  A pk containing `,`, `+`, `"`, etc. could redirect a write/delete to an
  arbitrary DN. Added RFC 4514 DN escaping (`escapeDNValue`) and route all DN
  construction through it.
- **LDAP mass assignment** (`lib/adapters/ldap.js`): `create()` and `update()`
  wrote every key present in the caller's data object to the LDAP entry with
  no whitelist. Both now only write attributes explicitly declared on the
  model (mirroring the existing read-side filtering in `_entryToRow`).
- **Redis adapter ignored `list()` filters** (`lib/adapters/redis.js`):
  `list(Model, args)` never read `args`, so any `hasMany` relation backed by
  Redis returned every row in the table instead of the filtered set.
  Additionally, it called the backing table's `list()` (which returns bare
  keys, not row data) instead of `listDetail()`. Fixed to fetch full rows and
  filter by `args.where`.
- **`hasMany` default foreign-key guess was backwards** (`lib/base.js`): a
  field like `User.tasks = {type: 'hasMany', model: 'Task'}` with no
  `remoteKey` guessed the FK column as `taskId` (derived from the *remote*
  model's own name) instead of `userId` (the column that would actually exist
  on `Task`, referencing back to `User`). Fixed in `BaseModel._register()` to
  default to `${thisModel.name.toLowerCase()}Id`.
- **Sequelize reverse-association alias collisions**
  (`lib/adapters/sequelize.js`): two `hasOne` fields on the same model
  pointing at the same remote model (e.g. `Task.createdBy` and
  `Task.updatedBy`, both → `User`) generated the same fallback reverse alias
  (`${Model.name.toLowerCase()}s`), so the second `hasMany` association call
  would throw or silently overwrite the first. The fallback alias is now
  qualified by field name.
- **`ORM.load` couldn't load a model file exporting a single class directly**
  (`lib/orm.js`): a file with `module.exports = SomeModel` (rather than
  `{SomeModel}` or `[SomeModel]`) fell through to `Object.values(exported)`,
  which iterates the class's own static properties instead of treating it as
  one model — the model silently failed to load.
- **`IntegerField` validation set an explicit `undefined` bound**
  (`lib/fields.js`): specifying only `min` (or only `max`) still set the other
  key to `undefined` in the Sequelize `validate` object, which differs from
  omitting the key entirely.
