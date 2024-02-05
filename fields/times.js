'use strict';

const { DataTypes } = require('sequelize');
const { Field } = require('./base');

class FieldTime extends Field {
	constructor(args) {
		super(args);
	}

	typeOfJs = Date; // Use Date type for JavaScript

	sequelizeType = DataTypes.TIME;

	validate(value) {
		super.validate(value);

		if (!(value instanceof Date) || isNaN(value.getTime())) {
			throw this.errors.fieldValidationError(
				'type',
				'Value must be a valid Date object or a time string.'
			);
		}
	}

	toSequilze() {
		return {
			type: this.sequelizeType,
		};
	}
}

class FieldPastTime extends FieldTime {
	constructor(args) {
		super(args);
	}

	validate(value) {
		super.validate(value);

		const currentTime = new Date();
		const currentDate = new Date(currentTime.toDateString());
		const timeToValidate = new Date(currentDate.toDateString() + ' ' + value);

		if (timeToValidate >= currentTime) {
			throw this.errors.fieldValidationError(
				'pastTime',
				'Value must be a past time.'
			);
		}
	}
}

class FieldFutureTime extends FieldTime {
	constructor(args) {
		super(args);
	}

	validate(value) {
		super.validate(value);

		const currentTime = new Date();
		const currentDate = new Date(currentTime.toDateString());
		const timeToValidate = new Date(currentDate.toDateString() + ' ' + value);

		if (timeToValidate <= currentTime) {
			throw this.errors.fieldValidationError(
				'futureTime',
				'Value must be a future time.'
			);
		}
	}
}

module.exports = {
	time: FieldTime,
	pastTime: FieldPastTime,
	futureTime: FieldFutureTime,
};
