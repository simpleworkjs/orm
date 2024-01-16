'use strict';

const fields = require('../fields');

function setNonEnumerable(key, value, obj){
	Object.defineProperty( obj, key, {
		value: value,
		writable: true,
		enumerable: false,
		configurable: true
	});
}

class BaseModel{
	// Hold all the models
	static models = {};

	static errors = {
		ModelNotUnique: (modelName)=>{
			const error = new Error('ModelNotUnique');
			error.modelName = modelName;
			error.message = `A model named ${modelName} is already in use.`;

			return error;
		},
		ModelValidation: (modelName, keyErrors)=>{
			const error = new Error('ModelValidation');
			error.modelName = modelName;
			error.message = 'The following fields failed validation.';
			error.keyErrors = keyErrors;

			return error;
		},
		ModelMethodNotImplemented: (modelName, methodName)=>{
			const error = new Error('ModelMethodNotImplemented');
			error.modelName = modelName;
			error.message = `Method ${methodName} is not implemented.`

			return error;
		},
	}

	static makeBackingModel(name, cls) {
		let model = ({
			[name] : class extends cls {}
		})[name];

		return model;
	}

	static parseFieldsBase(obj){
		for(let [key, options] of Object.entries(obj)){
			options = typeof options === "string" ? {type: options} : options;
			if(!fields[options.type]) throw new Error(`UnkownFieldType ${key} ${options.type}`);
			options.name = key
			obj[key] = new fields[options.type]({inModel: this.name, ...options})
		}

		return obj;
	}

	static init(fields){
		this.modelName = this.name;
		if(this.models[this.name]) throw this.errors.ModelNotUnique(this.name);

		this.models[this.name] = this;
		this.fields = this.parseFieldsBase(fields);
	}

	static validate(fields, partial){
		let errors = {};
		let validated = {}

		for(const [name, fieldInstance] of Object.entries(this.fields)){
			// Skip if required field not part of a partial validate
			if(fieldInstance.isRequired && !fields[name] && partial) continue;

			if(!fieldInstance.isRequired && !fields[name]){
				continue;
			}
			try{
				fieldInstance.validate(fields[name]);
				validated[name] = fields[name];
			}catch(error){
				if(!errors[name]) errors[name] = [];
				errors[name].push(error.message);
			}
		}

		if(Object.keys(errors).length) throw this.errors.ModelValidation(this.modelName, errors);
		return validated;
	}

	static async preSave(fields, partial){
		this.validate(fields, partial)
		let toSave = {};
		for(const [name, fieldInstance] of Object.entries(this.fields)){
			let newValue = await fieldInstance.preSave(fields[name]);
			if(newValue) toSave[name] = newValue
		}

		return toSave;
	}

	static async build(fields){
		let instance = new this(this.backingModel.build(fields))

		return instance
	}

	constructor(backingInstance){
		if(!(backingInstance instanceof this.constructor.backingModel)) throw new Error('instance not accepted')
		setNonEnumerable(backingInstance, backingInstance, this);
		
		for(let [name, fieldOptions] of Object.entries(this.constructor.fields)){
			if(backingInstance.dataValues[name] === undefined) continue;
			if(fieldOptions.isPrivate) setNonEnumerable(name, backingInstance.dataValues[name], this);
			else this[name] = backingInstance.dataValues[name];
			
			if(fieldOptions.methodToInject) this.methodInject(fieldOptions.methodToInject(name, this));
		}
	}

	methodInject({name, method}){
		setNonEnumerable(name, method.bind(this), this);
	}

	static list(args){
		
	}

	static async create(args){

	}

	static async get(args){

	}

	async update(args){

	}

	async delete(args){

	}
}


module.exports = {
	BaseModel,
	models: BaseModel.models,
};
