'use strict';

/**
 * Built-in `orm:` namespace commands for the SimpleWorkJS CLI.
 *
 * The namespace metadata is declared in package.json; this module only
 * registers commands within the `orm:` namespace.
 */

module.exports = function registerOrmCommands(cli) {
  cli
    .command('status', {
      description: 'Show the current schema vs model diff',
      usage: 'simpleworks orm:status',
      run: require('./lib/status'),
    })
    .command('migrate:make', {
      description: 'Generate a migration from model changes',
      usage: 'simpleworks orm:migrate:make [name]',
      run: require('./lib/migrate-make'),
    })
    .command('migrate', {
      description: 'Apply pending migrations',
      usage: 'simpleworks orm:migrate',
      run: require('./lib/migrate-run'),
    })
    .command('seed', {
      description: 'Run seed files',
      usage: 'simpleworks orm:seed',
      run: require('./lib/seed'),
    });

  cli.alias('migrate', 'orm:migrate');
  cli.alias('seed', 'orm:seed');
};
