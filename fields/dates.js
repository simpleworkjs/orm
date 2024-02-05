'use strict';

const { DataTypes } = require('sequelize');
const { Field } = require('./base');

class FieldDate extends Field{
	typeOfJs = 'object'; // Use Date type for JavaScript
	sequelizeType = DataTypes.DATE;

	validate(value) {
		super.validate(value);
		if (!(value instanceof Date) || isNaN(value.getTime()))throw this.errors.fieldValidationError(
			'type',
			'Value must be a valid Date object or a date string.'
		);
	}
}

class FieldPastDate extends FieldDate{
	validate(value) {
		super.validate(value);
		if (value > new Date()) throw this.errors.fieldValidationError(
			'pastDate',
			'Value must be a past date.'
		);
	}
}

class FieldFutureDate extends FieldDate{
	validate(value) {
		super.validate(value);
		if (value < new Date()) throw this.errors.fieldValidationError(
			'futureDate',
			'Value must be a future date.'
		);
	}
}

class FieldDateNow extends FieldDate{
	defualt = ()=> new Date.now();

	validate(value){
		if(value) throw this.errors.fieldValidationError(
			'violation',
			'Field is auto now timestamp and may not be set.'
		);
	}
}

module.exports = {
	date: FieldDate,
	datePast: FieldPastDate,
	datefuture: FieldFutureDate,
	dateNow: FieldDateNow,
};
