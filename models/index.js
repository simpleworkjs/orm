'use strict';

const {BaseModel} = require('./base');
const bases = {
	sequelize: require('./sequelize').setUp,
	redis: require('./redis').setUp,
}


function getModels(conf) {
	let ready = {BaseModel};
	for(const [name, modelConf] of Object.entries(conf)){
		if(!bases[name]) continue;
			let cls = bases[name](modelConf);
			ready[cls.name] = cls;

	}
	return ready;
}

module.exports = {getModels}
