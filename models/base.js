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
		ModelPrimaryKeyToMany: (modelName, fieldName, currnetPrimaryName)=>{
			const error = new Error('ModelPrimaryKeyToMany');
			error.modelName = modelName;
			error.message = `Model (${modelName}) can only have 1 primary key. Can not set (${fieldName}) over (${currnetPrimaryName})`;

			return error;
		},
		ModelPrimaryKeyRelation: (modelName, fieldName)=>{
			const error = new Error('ModelPrimaryKeyRelation');
			error.modelName = modelName;
			error.message = `Model (${modelName}) field (${fieldName}) relation can not be the primaryKey`

			return error;
		},
		ModelPrimaryKeyMissing: (modelName)=>{
			const error = new Error('ModelPrimaryKeyMissing');
			error.modelName = modelName;
			error.message = `Model (${modelName}) is missing the primaryKey`

			return error;
		},
		ModelRelationshipRemoteMissing: (modelName, fieldName, remoteModel)=>{
			const error = new Error('ModelRelationshipRemoteMissing');
			error.modelName = modelName;
			error.message = `Model (${modelName}) field (${fieldName}) can not find remote model (${remoteModel}).`

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
		this.fieldInstances = {};
		this.fieldInstancesRelationships = {};

		this.primaryKey = null;
		for(let [fieldName, options] of Object.entries(obj)){
			options = typeof options === "string" ? {type: options} : options;
			if(!fields[options.type]) throw new Error(
				`UnkownFieldType ${fieldName} ${options.type}`
			);

			let fieldInstance = new fields[options.type]({
				Model: this,
				name: fieldName,
				...options
			});

			if(fieldInstance instanceof fields.FieldRelationship){
				if(fieldInstance.primaryKey) throw this.errors.ModelPrimaryKeyRelation(this.name, fieldName);

				this.fieldInstancesRelationships[fieldInstance.name] = fieldInstance;
			}else{
				if(fieldInstance.primaryKey){
					if(this.primaryKey) throw this.errors.ModelPrimaryKeyToMany(
						this.name,
						fieldName,
						this.primaryKey.name
					);
					this.primaryKey = fieldInstance;
				}

				this.fieldInstances[fieldName] = fieldInstance;
			}

			if(!this.primaryKey) throw this.errors.ModelPrimaryKeyMissing(this.name);
		}
	}


	static parseRelationship(){
		// this.matchRelationships()
		for(const [fieldName, fieldInstance] of Object.entries(this.fieldInstancesRelationships)){
			fieldInstance.remoteModel = this.models[fieldInstance.remoteModel];
			if(!this.models[fieldInstance.remoteModel.name]) throw this.errors.ModelRelationshipRemoteMissing(
				this.name, fieldName, fieldInstance.remoteModel.name
			);

			// fieldInstance.checkAmbiguous();

			console.log(`\nparseRelationship: ${fieldInstance.Model.name}.${fieldInstance.name} ${fieldInstance.type} ${fieldInstance.remoteModel.name}.${fieldInstance.remoteKey}`)

			fieldInstance.makeRelation(this);
			// delete this.fieldInstancesRelationships[fieldName];

		}
	}

	static register(){
		this.modelName = this.name;
		if(this.models[this.name]) throw this.errors.ModelNotUnique(this.name);
		this.models[this.name] = this;

		this.parseFieldsBase(this.fields);
	}

	static async migrateAll(){
		for(let modelName in this.models){
			await this.models[modelName].migrate();
		}
	}

	static validate(fields, partial, values){
		let errors = {};
		let validated = {}
		values = values || fields

		for(const [name, fieldInstance] of Object.entries(this.fieldInstances)){
			// Skip if required field not part of a partial validate
			if(fieldInstance.isRequired && !fields[name] && partial) continue;
			if(!fieldInstance.isRequired && !fields[name]) continue;

			try{
				fieldInstance.validate(values[name]);
				validated[name] = fields[name];
			}catch(error){
				console.log('models base.js validate', error.stack)
				if(!errors[name]) errors[name] = error.message;
			}
		}

		if(Object.keys(errors).length) throw this.errors.ModelValidation(
			this.modelName, errors
		);
		return validated;
	}

	static async preSave(fields, partial){
		let toSave = {};
		for(const [name, fieldInstance] of Object.entries(this.fieldInstances)){
			let newValue = await fieldInstance.preSave(fields[name]);
			if(newValue) toSave[name] = newValue;
		}
		this.validate(fields, partial, toSave);

		return toSave;
	}

	static async build(fields){
		let instance = new this(this.backingModel.build(fields))

		return instance
	}

	constructor(backingInstance){
		if(!(backingInstance instanceof this.constructor.backingModel)) throw new Error('instance not accepted')
		setNonEnumerable(backingInstance, backingInstance, this);
		
		for(let [name, fieldOptions] of Object.entries(this.constructor.fieldInstances)){
			if(backingInstance.dataValues[name] === undefined) continue;
			if(fieldOptions.isPrivate) setNonEnumerable(name, backingInstance.dataValues[name], this);
			else this[name] = backingInstance.dataValues[name];
			if(fieldOptions.methodToInject) this.methodInject(fieldOptions.methodToInject(name, this));
		}

		setNonEnumerable('primaryKey', this[this.constructor.primaryKey.name], this);
	}

	methodInject({name, method}){
		console.log('injecting', name, 'into', this.constructor.name)
		setNonEnumerable(name, method, this);
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
