'use strict';

module.exports = ({SqlModel})=>{
	class User extends SqlModel{
		static fields = {
			userName: {type: 'string', min:3, primaryKey: true, unique: true},
			password: {type: 'password', isRequired: true, isPrivate: true},
			isValid: {type: 'boolean', default: true},
			other: 'date',
			authTokens: {type: 'hasMany', model: 'AuthToken', /*remoteKey: 'user'*/},
			// authTokens2: {type: 'hasMany', model: 'AuthToken'},
			// created: {type: 'hasMany', model: '*', key: 'createdBy'}
			// groups: {type: 'manyToMany', model: 'Group'},
			// AuthToken_createdBy_items: {type: hasMany }
		}
	}

	class AuthToken extends SqlModel{
		static fields = {
			token: {type: 'uuidv4', primaryKey: true},
			expiresAt: 'date',
			isValid: {type: 'boolean', default: true},
			user: {type: 'hasOne', model: 'User'},
			// user2: {type: 'hasOne', model: 'User'},
			// createdBy: {type: 'hasOne', model: 'User', key: 'created'},
			// updatedBy: {type: 'hasOne', model: 'User', key: 'updatedd'},
		}
	}

	// class User_Group extends SqlModel{
	// 	static fields = {
	// 		id: 'id',
	// 		User_userName = {'type: hasOne', model: 'User', key: 'userName'},
	// 		Group_name = {'type: hasOne', model: 'Group', key: 'name'},
	// 	}
	// }

	// class Group extends SqlModel{
	// 	static fields = {
	// 		name: {type: 'string', primaryKey: true},
	// 		members: {type: 'hasMany', model: 'User'},
	// 		createdBy: {type: 'hasOne', model: 'User'},
	// 		updatedBy: {type: 'hasOne', model: 'User'},
	// 	}
	// }

	// class Role extends SqlModel{
	// 	static fields = {
	// 		name: {type: 'string', primaryKey: true},
	// 		groups: {type: 'hasMany', model: 'Groups'},
	// 		users: {type: 'hasMany', model: 'User'},
	// 		createdBy: {type: 'hasOne', model: 'User'},
	// 		updatedBy: {type: 'hasOne', model: 'User'},
	// 	}
	// }


	return {
		AuthToken,
		User,
		// Group,
		// Role,
	}
};



// class Host extends RedisModel{
// 	static {
// 		this.init({
// 			'host': {type: 'string', primaryKey: true},
// 			'ip': {isRequired: true, type: 'string', min: 3, max: 500},
// 			'targetPort': {isRequired: true, type: 'int', min:0, max:65535},
// 			'forcessl': {isRequired: false, default: true, type: 'boolean'},
// 			'targetssl': {isRequired: false, default: false, type: 'boolean'},
// 			'is_cache': {default: false, isRequired: false, type: 'boolean',},
// 		})
// 	}
// }

/*
(async function(){
try{

	// await User.backingModel.sync({ force: true });

	await User.create({
		userName: '',
		password: '',
		other: new Date()
	});

	let user = await User.get('william5')

	console.log('valid?', user);
	console.log(await user.passwordCompare('Ha!2###########'))
}catch(error){
	console.log('IIFE error', error)
}

})();
*/