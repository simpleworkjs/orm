'use strict';

const {describe, it} = require('node:test');
const assert = require('node:assert');
const {DataTypes} = require('sequelize');
const {SequelizeAdapter} = require('../../lib/adapters/sequelize');

describe('SequelizeAdapter', () => {

  function bindORM(models, adapter) {
    return {
      models,
      adapter() {
        return adapter;
      },
    };
  }

  function makeModel(name, fields, relationships) {
    return {
      name,
      tableName: name,
      adapterName: 'sequelize',
      fieldInstances: fields,
      relationships: relationships || [],
      primaryKey: fields.id,
    };
  }

  function uuidPk() {
    return {
      name: 'id',
      toSequelize() {
        return {type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true};
      },
    };
  }

  it('defines scalar columns from fieldInstances', () => {
    const adapter = new SequelizeAdapter({dialect: 'sqlite', storage: ':memory:', logging: false});
    const User = makeModel('User', {
      id: uuidPk(),
      name: {
        name: 'name',
        toSequelize() {
          return {type: DataTypes.STRING, allowNull: false};
        },
      },
    });
    User.orm = bindORM({User}, adapter);

    adapter.registerModel(User);
    assert.ok(User.backingModel);
    assert.ok(User.backingModel.rawAttributes.name);
  });

  it('adds foreign key column for hasOne relationships', () => {
    const adapter = new SequelizeAdapter({dialect: 'sqlite', storage: ':memory:', logging: false});
    const User = makeModel('User', {
      id: uuidPk(),
    });
    const Task = makeModel('Task', {
      id: uuidPk(),
      title: {
        name: 'title',
        toSequelize() {
          return {type: DataTypes.STRING};
        },
      },
    }, [
      {name: 'createdBy', type: 'hasOne', model: 'User', foreignKey: 'createdById', isRequired: false},
    ]);

    User.orm = Task.orm = bindORM({User, Task}, adapter);

    adapter.registerModel(User);
    adapter.registerModel(Task);

    assert.ok(Task.backingModel.rawAttributes.createdById, 'FK column exists');
    assert.strictEqual(Task.backingModel.rawAttributes.createdById.type.key, 'UUID');
    assert.strictEqual(Task.backingModel.rawAttributes.createdById.allowNull, true);
  });

  it('throws when hasOne references an unknown model', () => {
    const adapter = new SequelizeAdapter({dialect: 'sqlite', storage: ':memory:', logging: false});
    const Task = makeModel('Task', {
      id: uuidPk(),
    }, [
      {type: 'hasOne', model: 'Missing', foreignKey: 'missingId'},
    ]);
    Task.orm = bindORM({Task}, adapter);

    assert.throws(
      () => adapter.registerModel(Task),
      /Unknown related model/
    );
  });

  it('creates associations between related models', () => {
    const adapter = new SequelizeAdapter({dialect: 'sqlite', storage: ':memory:', logging: false});
    const User = makeModel('User', {
      id: uuidPk(),
    });
    const Task = makeModel('Task', {
      id: uuidPk(),
    }, [
      {name: 'createdBy', type: 'hasOne', model: 'User', foreignKey: 'createdById'},
    ]);

    User.orm = Task.orm = bindORM({User, Task}, adapter);

    adapter.registerModel(User);
    adapter.registerModel(Task);
    adapter.associateModels([User, Task]);

    assert.ok(User.backingModel.associations.createdByTasks, 'User hasMany reverse association');
    assert.ok(Task.backingModel.associations.createdBy, 'Task belongsTo User association');
  });

  it('does not collide reverse aliases when two hasOne fields target the same remote model', () => {
    const adapter = new SequelizeAdapter({dialect: 'sqlite', storage: ':memory:', logging: false});
    const User = makeModel('User', {
      id: uuidPk(),
    });
    const Task = makeModel('Task', {
      id: uuidPk(),
    }, [
      {name: 'createdBy', type: 'hasOne', model: 'User', foreignKey: 'createdById'},
      {name: 'updatedBy', type: 'hasOne', model: 'User', foreignKey: 'updatedById'},
    ]);

    User.orm = Task.orm = bindORM({User, Task}, adapter);

    adapter.registerModel(User);
    adapter.registerModel(Task);

    // Before the fix, both reverse associations fell back to the same
    // `${Model.name.toLowerCase()}s` alias ("tasks") and the second
    // `hasMany` call would throw or silently overwrite the first.
    assert.doesNotThrow(() => adapter.associateModels([User, Task]));
    assert.ok(User.backingModel.associations.createdByTasks);
    assert.ok(User.backingModel.associations.updatedByTasks);
  });
});
