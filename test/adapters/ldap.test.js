'use strict';

const {describe, it} = require('node:test');
const assert = require('node:assert');
const {escapeDNValue, makeDN, dataToEntry} = require('../../lib/adapters/ldap');

describe('LDAP adapter helpers', () => {
  describe('escapeDNValue', () => {
    it('escapes RFC 4514 DN metacharacters', () => {
      assert.strictEqual(escapeDNValue('a,b'), 'a\\,b');
      assert.strictEqual(escapeDNValue('a+b'), 'a\\+b');
      assert.strictEqual(escapeDNValue('a"b'), 'a\\"b');
      assert.strictEqual(escapeDNValue('a<b>c'), 'a\\<b\\>c');
      assert.strictEqual(escapeDNValue('a;b'), 'a\\;b');
      assert.strictEqual(escapeDNValue('a=b'), 'a\\=b');
      assert.strictEqual(escapeDNValue('a\\b'), 'a\\\\b');
    });

    it('escapes a leading # and leading/trailing space', () => {
      assert.strictEqual(escapeDNValue('#ncname'), '\\#ncname');
      assert.strictEqual(escapeDNValue(' leading'), '\\ leading');
      assert.strictEqual(escapeDNValue('trailing '), 'trailing\\ ');
    });
  });

  describe('makeDN', () => {
    it('builds a plain DN with no special characters unchanged', () => {
      const cfg = {rdnAttribute: 'uid', base: 'ou=people,dc=example,dc=com'};
      assert.strictEqual(makeDN(cfg, 'bob'), 'uid=bob,ou=people,dc=example,dc=com');
    });

    it('escapes a malicious primary key so it cannot inject extra RDN components', () => {
      // Regression test: previously the pk was interpolated into the DN with
      // zero escaping, so a pk value containing a comma could redirect the
      // write/delete to an arbitrary DN (e.g. into a different OU).
      const cfg = {rdnAttribute: 'uid', base: 'ou=people,dc=example,dc=com'};
      const maliciousPk = 'bob,ou=admins,dc=example,dc=com';
      const dn = makeDN(cfg, maliciousPk);

      assert.strictEqual(
        dn,
        'uid=bob\\,ou\\=admins\\,dc\\=example\\,dc\\=com,ou=people,dc=example,dc=com'
      );
      // The escaped DN must still terminate in the configured base, not the
      // injected one.
      assert.ok(dn.endsWith(',ou=people,dc=example,dc=com'));
    });

    it('falls back to the adapter-level base when no per-model base is configured', () => {
      const cfg = {rdnAttribute: 'uid'};
      assert.strictEqual(
        makeDN(cfg, 'bob', 'ou=people,dc=example,dc=com'),
        'uid=bob,ou=people,dc=example,dc=com'
      );
    });
  });

  describe('dataToEntry', () => {
    function FakeModel(fieldInstances) {
      class M {}
      M.fieldInstances = fieldInstances;
      return M;
    }

    it('only writes attributes mapped on the model', () => {
      const Model = FakeModel({
        username: {isRelationship: false, ldapAttribute: 'uid'},
        email: {isRelationship: false},
      });

      const entry = dataToEntry(Model, {
        username: 'bob',
        email: 'bob@example.com',
        isAdmin: true,
        memberOf: 'cn=admins,ou=groups,dc=example,dc=com',
      }, {});

      assert.deepStrictEqual(entry, {uid: 'bob', email: 'bob@example.com'});
    });

    it('skips relationship fields and undefined values', () => {
      const Model = FakeModel({
        username: {isRelationship: false},
        group: {isRelationship: true},
      });

      const entry = dataToEntry(Model, {username: undefined, group: 'admins'}, {});
      assert.deepStrictEqual(entry, {});
    });

    it('includes objectClass from config when provided', () => {
      const Model = FakeModel({username: {isRelationship: false}});
      const entry = dataToEntry(Model, {username: 'bob'}, {objectClass: 'inetOrgPerson'});
      assert.deepStrictEqual(entry, {objectClass: ['inetOrgPerson'], username: 'bob'});
    });
  });
});
