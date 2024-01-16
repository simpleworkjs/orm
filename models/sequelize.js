'use strict';

const { Model, Sequelize } = require('sequelize');
const {BaseModel} = require('./base');

function setUp(config) {

	const sequelize = new Sequelize(config.database, config.username, config.password, config)

	class SqlModel extends BaseModel{
		static backingModelType = Model

		static parseFields(obj){
			let toSequilze = {}
			for(let [key, options] of Object.entries(obj)){
				let toSequilzeOptions = obj[key].toSequilze();
				if(toSequilzeOptions) toSequilze[key] = toSequilzeOptions;
			}
			return toSequilze;
		}

		static init(fields){
			super.init(fields);
			this.__sequelizeFeilds = this.parseFields(this.fields)
			this.backingModel = this.makeBackingModel(this.name, Model)
			this.backingModel.init(this.__sequelizeFeilds, {
				sequelize,
				modelName: this.name,
			});
		}

		static parseSaveError(error){
			if(['SequelizeValidationError', 'SequelizeUniqueConstraintError'].includes(error.name)){
				let keyErrors = {}
				for(let item of error.errors){
					if(item.path){
						keyErrors[item.path] = item.message;
					}
				}
				throw this.errors.ModelValidation(this.name, keyErrors)
			}

			throw error;
		}

		static async list(args){
			return await this.backingModel.findAll(args);
		}

		static async create(fields){
			try{
				fields = await this.preSave(fields)
				let instance = await this.backingModel.create(fields);
				return new this(instance);
			}catch(error){
				throw this.parseSaveError(error);
			}
		}

		static async get(pk){
			let instance = await this.backingModel.findByPk(pk);
			return new this(instance);
		}

		async update(fields){
			// if(!fields)

		}

		async delete(args){

		}

	}


	return SqlModel;
}

module.exports = {
	setUp
};
