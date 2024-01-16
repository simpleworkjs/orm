'use strict';

const {BaseModel} = require('./base')
const {setUpTable} = require('model-redis');

function setUp(conf) {

	const Table = setUpTable(conf);

	class RedisModel extends BaseModel{
		backingModelType = 'redis'
		/*	
		constructor(name, args){
		}*/

		static parseFields(obj){
			let _keymap = {}
			let primaryKeyFields = [];
			for(let [key, fieldInstance] of Object.entries(obj)){
				if(fieldInstance.primaryKey) primaryKeyFields.push()
				_keymap[key] = {
					type: fieldInstance.typeOfJs,
					isRequired: fieldInstance.isRequired,
					default: fieldInstance.default,
					// always: fieldInstancealways,
				};
			}

			if(primaryKeyFields.length !== 1 ) throw new Error('RedisModel must have exactly one primaryKey')

			return {_keymap, _key: primaryKeyFields.pop().name};
		}

		static init(fields){
			super.init(fields);
			let {__keyMap, __key} = this.parseFields(this.fields);
			this.backingModel = this.makeBackingModel(this.name, Table);
			this.backingModel._keymap = __keyMap;
			this.makeBackingModel._key = __key;
		}

		static async list(...args){
			return await this.backingModel.list(...args);
		}
	}

	return RedisModel;
}

module.exports = {
	setUp
};
