'use strict';

const { DataTypes } = require('sequelize');
const { Field } = require('./base');


class FieldNumber extends Field{
	constructor(args) {
		super(args)
		this.min = args.min;
		this.max = args.max;
	}

	validate(value) {
		if (isNaN(value)) throw this.errors.fieldValidationError(
			'type',
			'Value must be a number.'
		);

		if (this.min !== undefined && value < this.min) throw this.errors.fieldValidationError(
			'toShort',
			`Value must be greater than or equal to ${this.min}.`
		);

		if (this.max !== undefined && value > this.max) throw this.errors.fieldValidationError(
			'toLong',
			`Value must be less than or equal to ${this.max}.`
		);
	}
}

class FieldInteger extends FieldNumber{
	constructor(args){
		super(args)
		this.autoIncrement = args.autoIncrement ?? false;
	}
	sequelizeType = DataTypes.INTEGER;

	validate(value) {
		if(this.autoIncrement && value) throw this.errors.fieldValidationError(
			'violation',
			'Field is auto increment and may not be set.'
		);

		if (!Number.isInteger(value)) throw this.errors.fieldValidationError(
			'type',
			'Value must be an integer.'
		);

	}

	toSequilze() {
		return {
			...super.toSequilze(),
			autoIncrement: this.autoIncrement
		};
	}
}

class FieldId extends FieldInteger{
	primaryKey = true;
	autoIncrement = true;
}

class FieldFloat {
	sequelizeType = DataTypes.FLOAT;
}


module.exports = {
	int: FieldInteger,
	float: FieldFloat,
	id: FieldId,
};
