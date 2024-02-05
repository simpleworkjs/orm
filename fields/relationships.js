'use strict';

const { DataTypes } = require('sequelize');
const { Field } = require('./base');
const FieldString = require('./strings').string;
const FieldInteger = require('./numbers').int;
const lowerize = s => s && s[0].toLowerCase() + s.slice(1);


class FieldRelationship extends Field{
	static isRelation = true;

	errors = {
		...this.errors,
		FieldRealtionNameUsed: (newFieldName)=>{
			const error = new Error('FieldRealtionNameUsed');
			error.model = this.Model;
			error.key = this.name;
			error.message = `Failed to build relationship for field (${this.name}) on (${this.Model}) model, auto field name (${newFieldName}) taken.`;
			
			return error
		},
		FieldRealtionRemoteNull: (remoteKeyName, remoteModelName)=>{
			const error = new Error('FieldRealtionRemoteNull');
			error.model = this.Model.name || this.Model;
			error.key = this.name;
			error.message = `Failed to build relationship for field (${this.name}) on (${this.Model}) model, remote (${remoteKeyName}) field on (${remoteModelName}) does not exist`;
			
			return error
		},
		FieldRealtionRemoteType: (remoteKeyName, remoteModelName)=>{
			const error = new Error('FieldRealtionRemoteType');
			error.model = this.Model;
			error.key = this.name;
			error.message = `Failed to build relationship for field (${this.name}) on (${this.Model}) model, remote (${remoteKeyName}) field on (${remoteModelName}) must be (inclusing subclass) of string or int type`;
			
			return error
		},
	}

	constructor(args){
		super(args)
		if(!args.model && !args.remoteModel) throw this.errors.fieldOptionError(
			'requiredOptionMissing',
			'The "model" option is required for the all relationships'
		)
		this.remoteModel = args.model || args.remoteModel;
		this.remoteKey = args.remoteKey;
		// console.log('FieldRelationship constructor', this)
	}

	getRemoteReverseField(){
		let exactMatch;
		let generalMatch;
		for(const [remoteFieldName, remoteField] of Object.entries(this.remoteModel.fieldInstancesRelationships)){
			if(this.remoteModel.name !== remoteField.Model.name) continue;
			if(this.name === remoteField.remoteKey || this.remoteKey === remoteField.name){
				console.log(`exact match: ${remoteField.Model.name}.${remoteField.name} ${remoteField.type} ${remoteField.remoteModel.name}.${remoteField.remoteKey}`)
				if(exactMatch) throw new Error('should not be here');
				remoteField.isExactMatch = true;
				exactMatch = remoteField;
				// delete this.remoteModel.fieldInstancesRelationships[remoteFieldName]
			}else{
				console.log(`general match: ${remoteField.Model.name}.${remoteField.name} ${remoteField.type} ${this.remoteModel.name}.${this.remoteKey}`)
				if(generalMatch) throw new Error('should not be here');
				generalMatch = remoteField
				// delete this.remoteModel.fieldInstancesRelationships[remoteFieldName]
			}
		}

		return exactMatch || generalMatch;
	}

	makeRelation(){
		if(this.relationBuilt) return true;
		this.relationBuilt = true;
	}

	toSequilze(){
		throw new Error('This should not happen. This a bug that should be reported, or you messed up bad!')
		return undefined
	}
}


class HasOne extends FieldRelationship{
	remoteToMatches = {
		hasMany: ()=>{
			console.log('calling remote field')
			if(this.remoteReverseField.relationBuilt) return;
			this.remoteReverseField.remoteModel = this.Model;
			this.remoteReverseField.remoteKey = this.remoteReverseField.remoteKey || this.name;
			this.remoteReverseField.makeRelation({remoteReverseField: this});
		},
		hasOne: ()=>{
			console.log(`set local FK to unique`);
		},
		none: ()=>{
			console.log('build remote hasMany');
			this.remoteReverseField = new HasMany({
				name: this.Model.name,
				type: 'hasMany',
				Model: this.remoteModel,
				remoteModel: this.Model,
				remoteKey: this.name
			});

			this.remoteModel.fieldInstancesRelationships[this.remoteReverseField.name] = this.remoteReverseField;
			this.remoteModel.fieldInstancesRelationships[this.remoteReverseField.name].makeRelation({remoteReverseField: this});
		},
	}

	makeRelation({remoteReverseField}){
		if(super.makeRelation()) return;

		// Execute the remote related field
		this.remoteReverseField = remoteReverseField || this.getRemoteReverseField() || {type: 'none'};
		this.remoteToMatches[this.remoteReverseField.type]();

		// get the correct field for the remote model and make sure the remote key exists
		this.relationTargetField = this.remoteKey ? this.remoteModel.fieldInstances[this.remoteKey] : this.remoteModel.primaryKey; 
		if(!this.relationTargetField) throw this.errors.FieldRealtionRemoteNull(
			this.remoteKey,
			this.remoteModel.name
		);
		console.log(`==hasOne (${this.name}) ${this.Model.name}.${this.name} ${this.type} ${this.remoteModel.name}.${this.relationTargetField.name} [${this.remoteModel.primaryKey.name}]========`)

		let NewFieldClass = this.relationTargetField instanceof FieldString ? FieldString : FieldInteger;
		if(this.name in this.Model.fieldInstances) throw this.errors.fieldValidationError('RelationKey', `relation key in use`);

		this.fkField = new NewFieldClass({name: this.name, Model: this.Model, type: this.relationTargetField.type});
		this.Model.fieldInstances[this.fkField.name] = this.fkField;

		this.Model.prototype.methodInject({
			name: `${this.name}Get`,
			method: (()=>{
				let fieldInstance = this;
				return async function(){
					return (await fieldInstance.remoteModel.list({[fieldInstance.relationTargetField.name]: this[fieldInstance.name]}))[0];
				}
			})()
		});

		delete this.Model.fieldInstancesRelationships[this.name];
	}
}

class HasMany extends FieldRelationship{
	remoteToMatches = {
		hasOne : ()=>{
			console.log('validate remote field matches')
			if(!this.remoteKey) this.remoteKey = this.remoteReverseField.name;
			this.remoteReverseField.makeRelation({remoteReverseField: this});
		},
		hasMany: ()=>{
			console.log('remote can not be hasMany')
		},
		manyToMany: ()=>{
			console.log('remote can not be manyToMany')
		},
		none: ()=>{
			this.remoteReverseField = new HasOne({
				name: this.remoteKey || this.Model.name,
				type: 'hasOne',
				Model: this.remoteModel,
				remoteModel: this.Model,
				remoteKey: this.remoteKey || this.Model.primaryKey.name,
			});

			this.remoteModel.fieldInstancesRelationships[this.remoteReverseField.name] = this.remoteReverseField;
			this.remoteModel.fieldInstancesRelationships[this.remoteReverseField.name].makeRelation({remoteReverseField: this});
		}
	}

	makeRelation({remoteReverseField}){
		if(super.makeRelation()) return;

		console.log(`==hasMany ${this.Model.name}.${this.name} to ${this.remoteModel.name}.${this.remoteKey}`)

		// Execute the remote related field
		this.remoteReverseField = remoteReverseField || this.getRemoteReverseField() || {type: 'none'};
		this.remoteToMatches[this.remoteReverseField.type]()

		// Remove this field from relations to be parsed
		delete this.Model.fieldInstancesRelationships[this.name];

		// inject the neded methods to this model to use the relationship
		this.Model.prototype.methodInject({
			name: `${this.name}Get`,
			method: (()=>{
				let fieldInstance = this;
				return async function(){
					return await fieldInstance.remoteModel.list({[fieldInstance.remoteKey]: this.primaryKey});
				}
			})()
		});

		this.Model.prototype.methodInject({
			name: `${this.name}Create`,
			method: ((values)=>{
				let fieldInstance = this;
				return async function(){
					return await fieldInstance.remoteModel.create({
						[fieldInstance.remoteKey]: this.primaryKey,
						...values
					});
				}
			})()
		});
	}
}

class ManyToMany extends FieldRelationship{
	validMatch = ['manyToMany']
}


module.exports = {
	FieldRelationship,
	hasOne: HasOne,
	hasMany: HasMany,
	manyToMany: ManyToMany,
};
