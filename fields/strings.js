'use strict';

// Importing Sequelize's DataTypes for defining field types
const { DataTypes } = require('sequelize');

// Importing the base Field class
const { Field } = require('./base');

// Importing the bcrypt library for password hashing
const bcrypt = require('bcrypt');

// Subclass for string fields with additional validations
class FieldString extends Field {
	// Constructor for the FieldString class
	constructor(args) {
		// Calling the constructor of the base Field class
		super(args);
		// Minimum and maximum length properties for the string
		this.min = args.min;
		this.length = args.max || 255;
	}


	// Validation method for string fields with additional length checks
	typeOfJs = 'string';
	
	validate(value) {
		// Calling the validation method of the base Field class
		super.validate(value);
		// Checking for minimum and maximum length constraints
		if (this.min && value.length < this.min)
			throw this.errors.fieldValidationError('toShort', `Field must be longer than ${this.min} characters.`);
		if (this.max && value.length > this.max)
			throw this.errors.fieldValidationError('toLong', `Field can not have more ${this.max} characters.`);
	}
	// Type information for JavaScript and Sequelize
	sequelizeType = DataTypes.STRING;

	// Method to convert field properties to Sequelize format with additional length property
	toSequilze() {
		return {
			...super.toSequilze(),
			length: this.length,
		};
	}
}

// Subclass for UUIDv4 fields, inheriting from FieldString
class FieldUUIDv4 extends FieldString {
	// Validation method for UUIDv4 fields with length constraints
	validate(value) {
		args.min = 36;
		args.max = 36;
		this.super(value);
		// Checking if the value is a valid UUIDv4 using a utility function
		if (!utils.uuidValidate(value, 4))
			throw this.errors.fieldValidationError('type', `Field must be a valid UUIDV4`);
	}

	// Type information for JavaScript and Sequelize
	typeOfJs = 'string';
	sequelizeType = DataTypes.UUIDV4;
}

class Fieldbcrypt extends FieldString{
	constructor(args){
		super(args)
		this.isPrivate = true;
		this.saltRounds = args.saltRounds || 10;
	}
	// Method for pre-saving password fields by hashing the value with bcrypt
	async preSave(value) {
		return await bcrypt.hash(value, this.saltRounds);
	}

	methodToInject(fieldName){
		return {
			name: `${fieldName}Compare`,
			method: async function(value){
				return await bcrypt.compare(value, this[fieldName])
			}
		}
	}
}

// Subclass for password fields, inheriting from Fieldbcrypt
class FieldPassword extends Fieldbcrypt {
	// Constructor for the FieldPassword class
	constructor(args) {
		// Calling the constructor of the base FieldString class
		super(args);
		// Additional properties for password fields
		this.min = 6;

		// Handling complexity functions and checks for password fields
		if (args.complexityFunctions) {
			this.complexity = { ...this.complexity, ...args.complexityFunctions };
		}
		this.complexityChecks = ['upper', 'lower', 'digit', 'special'];
	}

	// Validation method for password fields
	validate(value) {
		// Calling the validation method of the base FieldString class
		super.validate(value);
		let errors = []
		for(let check of this.complexityChecks){
			try{
				this.complexity[check](value)
			}catch(error){
				errors.push(error.message)
			}
		}
		if(errors.length) throw this.errors.fieldValidationError(
			'passwordComplexity',
			errors.join(', ')+'.'
		);

	}

	// Complexity functions for password validation
	complexity = {
		upper: (value) => {
			if (!/[A-Z]/.test(value))throw this.errors.fieldValidationError(
				'passwordComplexity',
				`Password must contain at least one uppercase letter`
			);
		},
		lower: (value) => {
			if (!/[a-z]/.test(value))
				throw this.errors.fieldValidationError('passwordComplexity', `Password must contain at least one lowercase letter`);
		},
		digit: (value) => {
			if (!/\d/.test(value))
				throw this.errors.fieldValidationError('passwordComplexity', `Password must contain at least one digit`);
		},
		special: (value) => {
			if (!/[!@#$%^&*]/.test(value))
				throw this.errors.fieldValidationError(
					'passwordComplexity',
					`Password must contain at least one special character (e.g., !@#$%^&*)`
				);
		},
	};
}

// Subclass for email fields, inheriting from FieldString
class FieldEmail extends FieldString {
	validate(value){
		super.validate(value);
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

		if (!emailRegex.test(value)) throw this.errors.fieldValidationError(
			'emailFormat',
			`Field must be a valid email address format.`
		);
	}
}

// Exporting subclasses for string, UUIDv4, password, and email fields
module.exports = {
	string: FieldString,
	uuidv4: FieldUUIDv4,
	bcrypt: Fieldbcrypt,
	password: FieldPassword,
	email: FieldEmail,
};
