'use strict';

/**
 * Schema introspection helpers for the SimpleWorkJS migration CLI.
 *
 * Builds a desired schema from SimpleWorkJS Model classes and parses
 * existing Sequelize migration files.
 */

const fs = require('fs');
const path = require('path');
const {DataTypes, Sequelize} = require('sequelize');

const migrationFieldAttrNames = [
  'type',
  'allowNull',
  'defaultValue',
  'primaryKey',
  'autoIncrement',
  'unique',
  'references',
  'onUpdate',
  'onDelete',
  'comment',
  'field',
  'collate',
  'charset',
];

function buildDesiredSchema(models) {
  const schema = {};
  for (const Model of Object.values(models)) {
    if (Model.adapterName !== 'sequelize') continue;
    const columns = {};

    for (const [name, field] of Object.entries(Model.fieldInstances)) {
      if (field.isRelationship) continue;
      columns[name] = field.toSequelize ? field.toSequelize() : {type: DataTypes.STRING};
    }

    for (const field of Model.relationships) {
      if (field.type === 'hasOne') {
        const remoteModel = models[field.model];
        if (!remoteModel) continue;
        const remotePk = remoteModel.primaryKey;
        const seqDef = remotePk.toSequelize ? remotePk.toSequelize() : {type: DataTypes.INTEGER};
        columns[field.foreignKey] = {
          type: seqDef.type,
          allowNull: !field.isRequired,
        };
      }
    }

    schema[Model.tableName || Model.name] = {
      modelName: Model.name,
      columns,
    };
  }
  return schema;
}

function loadMigrationFiles(migrationsPath) {
  if (!fs.existsSync(migrationsPath)) return [];
  return fs.readdirSync(migrationsPath)
    .filter(f => f.endsWith('.js'))
    .sort();
}

function parseMigrationFile(filePath) {
  let tableName = null;
  let columns = {};
  let removedColumns = [];

  const queryInterface = {
    createTable: (t, f) => {
      tableName = t;
      columns = f;
    },
    addColumn: (t, col, def) => {
      tableName = t;
      columns[col] = def;
    },
    removeColumn: (t, col) => {
      tableName = t;
      removedColumns.push(col);
    },
    dropTable: () => {},
    renameColumn: () => {},
    changeColumn: () => {},
    addConstraint: () => {},
    removeConstraint: () => {},
  };

  const migration = require(filePath);
  if (typeof migration.up === 'function') {
    migration.up(queryInterface, DataTypes);
  }

  for (const col of Object.keys(columns)) {
    columns[col].exists = true;
  }

  return {tableName, columns, removedColumns};
}

function buildCurrentSchema(migrationsPath) {
  const files = loadMigrationFiles(migrationsPath);
  const schema = {};

  for (const file of files) {
    const info = parseMigrationFile(path.join(migrationsPath, file));
    if (!info.tableName) continue;

    if (!schema[info.tableName]) {
      schema[info.tableName] = {columns: {}};
    }

    for (const [col, def] of Object.entries(info.columns)) {
      schema[info.tableName].columns[col] = def;
    }

    for (const col of info.removedColumns) {
      delete schema[info.tableName].columns[col];
    }
  }

  return schema;
}

function diffSchemas(current, desired) {
  const create = [];
  const update = [];

  for (const [tableName, desiredInfo] of Object.entries(desired)) {
    const currentInfo = current[tableName];
    if (!currentInfo) {
      create.push({tableName, modelName: desiredInfo.modelName, columns: desiredInfo.columns});
      continue;
    }

    const currentCols = Object.keys(currentInfo.columns);
    const desiredCols = Object.keys(desiredInfo.columns);
    const added = desiredCols.filter(c => !currentInfo.columns[c]);
    const removed = currentCols.filter(c => !desiredInfo.columns[c]);

    if (added.length || removed.length) {
      update.push({
        tableName,
        modelName: desiredInfo.modelName,
        added: added.map(c => ({name: c, def: desiredInfo.columns[c]})),
        removed: removed.map(c => ({name: c, def: currentInfo.columns[c]})),
      });
    }
  }

  return {create, update};
}

function formatColumnAttrToString(attributes) {
  const parts = [];
  for (const [key, value] of Object.entries(attributes)) {
    if (!migrationFieldAttrNames.includes(key)) continue;
    let out;
    if (isSequelizeDataType(value)) {
      out = `Sequelize.${value.key}`;
    } else if (key === 'references') {
      out = JSON.stringify(value);
    } else if (typeof value === 'string') {
      out = `"${value}"`;
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      out = String(value);
    } else if (Array.isArray(value)) {
      out = JSON.stringify(value);
    } else if (value && typeof value === 'object') {
      out = JSON.stringify(value);
    } else {
      out = String(value);
    }
    parts.push(`${key}: ${out}`);
  }
  return parts.length
    ? `\n\t\t\t\t${parts.join(',\n\t\t\t\t')}\n\t\t\t`
    : '';
}

const sequelizeDataTypeKeys = new Set(Object.keys(Sequelize.DataTypes));

function isSequelizeDataType(value) {
  return value && (typeof value === 'function' || typeof value === 'object')
    && value.key
    && sequelizeDataTypeKeys.has(value.key);
}

function formatColumnsToString(columns) {
  return Object.entries(columns)
    .map(([name, def]) => `${name}: {${formatColumnAttrToString(def)}}`)
    .join(',\n\t\t\t');
}

module.exports = {
  buildDesiredSchema,
  buildCurrentSchema,
  loadMigrationFiles,
  parseMigrationFile,
  diffSchemas,
  formatColumnsToString,
  formatColumnAttrToString,
};
