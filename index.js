'use strict';

/**
 * @simpleworkjs/orm
 *
 * Base model-first ORM with multi-backend adapters (Sequelize, Redis, LDAP).
 *
 * Public API:
 *   const orm = require('@simpleworkjs/orm');
 *   const {ORM, Model, fields, adapters, init} = orm;
 *
 * Factory:
 *   const models = init({conf, models: [require('./models/Task')]});
 */

const {ORM, Model} = require('./lib/orm');
const fields = require('./lib/fields');
const adapters = require('./lib/adapters');

/**
 * Initialize the ORM with app-specific models only.
 *
 * Options:
 *   conf     — configuration object with orm section.
 *   models   — array or object of app Model classes.
 *   pubsub   — optional pub/sub instance.
 */
function init(options) {
  options = options || {};
  const orm = new ORM(options.conf || {}, options.pubsub);
  const appModels = Array.isArray(options.models)
    ? options.models
    : Object.values(options.models || {});
  return orm.load(appModels);
}

module.exports = {
  ORM,
  Model,
  fields,
  adapters,
  init,
};
