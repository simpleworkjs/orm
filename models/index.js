'use strict';

const {BaseModel} = require('./base');
const bases = {
	sequelize: require('./sequelize').setUp,
	redis: require('./redis').setUp,
}


// Set the the lib for the end user. This is the main entry point for the ORM.
function init(conf, ...modelFiles) {
	let availableBaseModels = {BaseModel};
	let models = []
	// Get add the DB backends to load from the colf file and set up the base models
	for(const [name, modelConf] of Object.entries(conf)){
		if(!bases[name]) continue;
		let cls = bases[name](modelConf);
		availableBaseModels[cls.name] = cls;
	}

	// Load the models from the model files
	for(let item of modelFiles){
		models.push(...Object.values(item(availableBaseModels, BaseModel.models)));
	}

	// once all the models are load, init them all. We must wait until all the
	// models are loaded so we can build the correct relationships.

	for(let Model of models){
		Model.register();
	}

	for(let Model of models){
		Model.parseRelationship();
	}

	for(let Model of models){
		Model.init();
	}

	return BaseModel.models;
}


// module.exports = {init}


const conf = {
	db:{
		sequelize: {
			"storage": "database_test.sqlite",
			"dialect": "sqlite",
			logging: false, //console.info,
		},
		redis:{
			prefix: 'auth_app',
		}
	}
}




let models = init(
	conf.db,
	require('../test')
);

(async function(){
	await BaseModel.migrateAll()
	// let user = await models.User.create({userName: 'william', password: 'Palm7!@#', isValid: true});
	// let user = await models.User.get('william4');
	// console.log('user name', user.userName, 'user instance', user,);
	// // console.log('user authToekns', await user.authTokensGet())
	// console.log('user authToekns create', await user.authTokensCreate())
	// console.log('user authToekns', await user.authTokensGet())

	let token = await models.AuthToken.get('cb0034f7-6125-4b6c-b6b6-7401269d0e3e')
	console.log('token', token)
	console.log('token user', await token.userGet());

})()
