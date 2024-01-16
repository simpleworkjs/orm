'use strict';

const {DataTypes} = require('sequelize');
const { Field } = require('./base');

class FieldRelationship extends Field{
	static isRelation = true;
	constructor(args){
		super(args)
		if(!args.model) throw this.errors.fieldOptionError(
			'requiredOptionMissing',
			'The "model" option is required for the "hasOne: type.'
		)
		this.remoteModel = args.model
	}

	toSequilze(){
		return undefined
	}
}

class HasOne extends FieldRelationship{
	constructor(args){
		super(args)
	}
}

class HasMany extends FieldRelationship{

}


module.exports = {
	hasOne: HasOne,
	hasMany: HasMany,
};
