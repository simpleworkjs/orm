'use strict';

const conf = {
	db:{
		sequelize: {
			"storage": "database_test.sqlite",
			"dialect": "sqlite",
			logging: console.info,
		},
		redis:{
			prefix: 'auth_app',
		}
	}
}

const {getModels} = require('./index')

const {SqlModel, RedisModel} = getModels(conf.db)

class User extends SqlModel{
	static {
		this.init({
			userName: {type: 'string', primaryKey: true},
			password: {type: 'password', isRequired: true},
			isValid: {type: 'boolean', default: true},
			other: 'date',
			// user: {type: 'hasOne', model: 'User'},
		});
	}
}

class AuthToken extends SqlModel{
	static {
		this.init({
			token: {type: 'uuidv4', primaryKey: true},
			expiresAt: 'date',
			isValid: {type: 'boolean', default: true},
			user: {type: 'hasOne', model: 'User'},
		});
	}
}

class Host extends RedisModel{
	static {
		this.init({
			'host': {type: 'string', primaryKey: true},
			'ip': {isRequired: true, type: 'string', min: 3, max: 500},
			'targetPort': {isRequired: true, type: 'int', min:0, max:65535},
			'forcessl': {isRequired: false, default: true, type: 'boolean'},
			'targetssl': {isRequired: false, default: false, type: 'boolean'},
			'is_cache': {default: false, isRequired: false, type: 'boolean',},
		})
	}
}

(async function(){
try{

	// await User.backingModel.sync({ force: true });

	// await User.create({
	// 	userName: 'william5',
	// 	password: 'Ha!2###########',
	// 	other: new Date()
	// });

	let user = await User.get('william5')

	console.log('valid?', user);
	console.log(await user.passwordCompare('Ha!2###########'))
}catch(error){
	console.log('IIFE error', error)
}

})();
