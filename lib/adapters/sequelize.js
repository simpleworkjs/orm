'use strict';

const {Sequelize, DataTypes, Op} = require('sequelize');

class SequelizeAdapter {
  constructor(config) {
    this.sequelize = new Sequelize(config);
    this.backingModels = {};
  }

  async connect() {
    await this.sequelize.authenticate();
  }

  // Expose Sequelize operators for advanced queries
  getOp() {
    return Op;
  }

  registerModel(Model) {
    const attributes = {};

    // Scalar fields become columns.
    for (const [name, field] of Object.entries(Model.fieldInstances)) {
      if (!field.isRelationship) {
        attributes[name] = field.toSequelize();
      }
    }

    // hasOne relationships become a foreign-key column.
    for (const field of Model.relationships) {
      if (field.type === 'hasOne') {
        const remoteModel = Model.orm.models[field.model];
        if (!remoteModel) throw new Error(`Unknown related model: ${field.model}`);
        const remotePk = remoteModel.primaryKey;
        const seqDef = remotePk.toSequelize ? remotePk.toSequelize() : {type: DataTypes.INTEGER};
        attributes[`${field.name}Id`] = {
          type: seqDef.type,
          allowNull: !field.isRequired,
        };
      }
    }

    const SM = this.sequelize.define(Model.name, attributes, {
      tableName: Model.tableName || Model.name,
      timestamps: true,
      underscored: false,
    });

    this.backingModels[Model.name] = SM;
    Model.backingModel = SM;
  }

  associateModels(models) {
    // Only process hasOne relationships. Each hasOne creates:
    //   - This model belongs to the remote model.
    //   - The remote model has many of this model.
    for (const Model of models) {
      const adapter = Model.orm.adapter(Model);
      if (adapter !== this) continue; // skip non-sequelize models

      for (const field of Model.relationships) {
        if (field.type !== 'hasOne') continue;

        const RemoteModel = Model.orm.models[field.model];
        if (!RemoteModel) continue;
        const remoteAdapter = Model.orm.adapter(RemoteModel);

        const SM = Model.backingModel;
        const RSM = RemoteModel.backingModel;

        if (remoteAdapter === this) {
          SM.belongsTo(RSM, {as: field.name, foreignKey: `${field.name}Id`});
          const reverseField = RemoteModel.relationships.find(
            r => r.type === 'hasMany' && r.model === Model.name && (r.remoteKey ? r.remoteKey === `${field.name}Id` : true)
          );
          // Falling back to `${Model.name.toLowerCase()}s` collides when two
          // hasOne fields on the same Model point at the same RemoteModel
          // (e.g. Task.createdBy and Task.updatedBy both -> User): both
          // reverse associations would register under the same alias.
          // Qualifying with the field name keeps them distinct.
          const reverseAlias = reverseField ? reverseField.name : `${field.name}${Model.name}s`;
          RSM.hasMany(SM, {as: reverseAlias, foreignKey: `${field.name}Id`});
        }
      }
    }
  }

  async sync(options) {
    await this.sequelize.sync(options);
  }

  // Transform where clauses to support operators
  _transformWhere(where, Model) {
    if (!where) return undefined;
    const transformed = {};
    for (const [key, value] of Object.entries(where)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Support operator syntax: {value: {gt: 5}}
        const opClause = {};
        let hasOps = false;
        for (const [op, val] of Object.entries(value)) {
          if (op === 'ne') {
            opClause[Op.ne] = val;
            hasOps = true;
          } else if (op === 'gt') {
            opClause[Op.gt] = val;
            hasOps = true;
          } else if (op === 'gte') {
            opClause[Op.gte] = val;
            hasOps = true;
          } else if (op === 'lt') {
            opClause[Op.lt] = val;
            hasOps = true;
          } else if (op === 'lte') {
            opClause[Op.lte] = val;
            hasOps = true;
          } else if (op === 'in') {
            opClause[Op.in] = val;
            hasOps = true;
          } else if (op === 'not') {
            opClause[Op.not] = val;
            hasOps = true;
          } else if (op === 'like') {
            opClause[Op.like] = val;
            hasOps = true;
          } else if (op === 'iLike') {
            opClause[Op.iLike] = val;
            hasOps = true;
          } else if (op === 'is') {
            opClause[Op.is] = val;
            hasOps = true;
          }
        }
        if (hasOps) {
          transformed[key] = opClause;
        }
      } else {
        transformed[key] = value;
      }
    }
    return Object.keys(transformed).length > 0 ? transformed : undefined;
  }

  async list(Model, args) {
    args = args || {};
    const options = {};
    if (args.where) {
      options.where = this._transformWhere(args.where, Model);
    }
    if (args.limit !== undefined) {
      options.limit = args.limit;
    }
    if (args.offset !== undefined) {
      options.offset = args.offset;
    }
    if (args.order) {
      options.order = args.order;
    }
    if (args.attributes) {
      options.attributes = args.attributes;
    }
    if (args.include) {
      options.include = args.include;
    }
    if (args.transaction) {
      options.transaction = args.transaction;
    }

    const rows = await Model.backingModel.findAll(options);
    return rows.map(row => new Model(row));
  }

  // listDetail - same as list but explicitly returns full objects (for Redis parity)
  async listDetail(Model, args) {
    return this.list(Model, args);
  }

  async count(Model, args) {
    args = args || {};
    const options = {};
    if (args.where) {
      options.where = this._transformWhere(args.where, Model);
    }
    return Model.backingModel.count(options);
  }

  async create(Model, data, options) {
    const opts = options || {};
    const row = await Model.backingModel.create(data, opts.transaction ? {transaction: opts.transaction} : {});
    return new Model(row);
  }

  async get(Model, pk, options) {
    const opts = options || {};
    const row = await Model.backingModel.findByPk(pk, opts.transaction ? {transaction: opts.transaction} : {});
    return row ? new Model(row) : null;
  }

  async update(instance, data, options) {
    const opts = options || {};
    await instance._backing.update(data, opts.transaction ? {transaction: opts.transaction} : {});
    return instance;
  }

  async delete(instance, options) {
    const opts = options || {};
    await instance._backing.destroy(opts.transaction ? {transaction: opts.transaction} : {});
  }
}

module.exports = {SequelizeAdapter};
