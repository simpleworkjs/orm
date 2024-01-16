'use strict';

const { DataTypes } = require('sequelize');

function returnOrCall(value){
	return typeof(value) === 'function' ? value() : value;
} 

// Base class for fields
class Field {
	// Error handling for field validation and options
	errors = {
		// Validation error for field values
		fieldValidationError: function (reason, message) {
			const error = new Error('KeyValidationError');
			error.reason = reason;
			error.model = this.belongsToModel;
			error.key = this.name;
			error.message = message || reason;
			return error
		},
		// Error for invalid field options
		fieldOptionError: function (reason, message) {
			const error = new Error('KeyOptionError');
			error.reason = reason;
			error.model = this.belongsToModel;
			error.key = this.name;
			error.message = message || reason;
			return error
		},
	};

	// Constructor for the Field class
	constructor(args) {
		// Field properties
		this.name = args.name;
		this.primaryKey = args.primaryKey ?? false;
		this.unique = (this.primaryKey || args.unique) ?? false;

		// Adjusted logic for isRequired to handle undefined case
		this.isRequired = (args.isRequired !== undefined ? args.isRequired : this.primaryKey) ?? false;
		this.isPrivate = args.isPrivate ?? false;
		this.isEditable = args.isEditable ?? true;

		this.default = args.default;
	}

	// Validate the field value based on requirements
	validate(value) {
		// Check if the field is required and has a value
		if (this.isRequired && value === undefined)	throw this.errors.fieldValidationError(
			'required',
			`Field has to have a value.`
		);

		// Check if the field value has the correct type
		if (this.typeOfJs && typeof value !== this.typeOfJs) throw new this.errors.fieldValidationError(
			'type',
			`Field must be type of ${this.typeOfJs}.`
		);
	}

	getDefault(){
		return returnOrCall(this.default);
	}

	preSave(value){
		if(!value && this.default) return this.getDefault();
		return value;
	}

	// Convert field properties to Sequelize format
	toSequilze() {
		return {
			type: this.sequelizeType,
			unique: this.unique,
			allowNull: !this.isRequired,
			primaryKey: this.primaryKey,
		};
	}
}

// Subclass for boolean fields
class FieldBoolean extends Field {
	// Specific type for boolean fields
	typeOfJs = 'boolean';
	sequelizeType = DataTypes.BOOLEAN;
}

// Export classes
module.exports = {
	Field,
	boolean: FieldBoolean,
};
