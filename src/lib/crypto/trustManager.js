"use strict";

const Observer = require("asset/observer");
const SecuredData = require("asset/securedDataWithMetaData");
const Enum = require("asset/enum");
const errors = require("asset/errors");
const Bluebird = require("bluebird");
var database, loaded = false,
	trustManager;

var sortedTrustStates = ["BROKEN", "UNTRUSTED", "TIMETRUSTED", "WHISPEERVERIFIED", "NETWORKVERIFIED", "VERIFIED", "OWN"];

var trustStates = new Enum.default(sortedTrustStates);

sortedTrustStates = sortedTrustStates.map(function(trustLevel) {
	return trustStates.fromString("|" + trustLevel + "|");
});

function serializeTrust(trustLevel) {
	return trustStates.toString(trustLevel);
}

function unserializeTrust(trustLevel) {
	return trustStates.fromString(trustLevel);
}

function KeyTrustData(data) {
	var trustSymbol = unserializeTrust(data.trust);

	this.getAddedTime = function() {
		return data.added;
	};
	this.getKey = function() {
		return data.key;
	};
	this.getUserID = function() {
		return data.userid;
	};
	this.getNickname = function() {
		return data.nickname;
	};
	this.getTrust = function() {
		return trustSymbol;
	};


	this.isUntrusted = function() {
		return trustSymbol === trustStates.UNTRUSTED;
	};
	this.isTimeTrusted = function() {
		return trustSymbol === trustStates.TIMETRUSTED;
	};
	this.isWhispeerVerified = function() {
		return trustSymbol === trustStates.WHISPEERVERIFIED;
	};
	this.isNetworkVerified = function() {
		return trustSymbol === trustStates.NETWORKVERIFIED;
	};
	this.isVerified = function() {
		return trustSymbol === trustStates.VERIFIED;
	};
	this.isOwn = function() {
		return trustSymbol === trustStates.OWN;
	};

	this.setTrust = function(trustLevel) {
		trustManager.setKeyTrustLevel(data.key, trustLevel);
	};
}

function userToDataSet({ key, userid, nickname }, trustLevel) {
	var content = {
		added: new Date().getTime(),
		trust: serializeTrust(trustLevel || trustStates.UNTRUSTED),
		key,
		userid,
		nickname
	};

	return content;
}

var fakeKeyExistence = 0,
	ownKey, specialKeys = ["me", "nicknames", "ids"];

trustManager = {
	allow: function(count) {
		if (!loaded) {
			fakeKeyExistence = count;
		}
	},
	disallow: function() {
		fakeKeyExistence = 0;
	},
	trustStates: trustStates,
	isLoaded: function() {
		return loaded;
	},
	createDatabase: function({ key, userid, nickname }) {
		var data = {};

		data.nicknames = {}
		data.ids = {}

		data[key] = userToDataSet({ key, userid, nickname }, trustStates.OWN)

		data.nicknames[nickname] = key
		data.ids[userid] = key
		data.me =  key

		database = SecuredData.load(undefined, data, {
			type: "trustManager"
		});

		loaded = true;
	},
	setOwnSignKey: function(_ownKey) {
		ownKey = _ownKey;
	},
	addDataSet: function(dataSet) {
		var signKey = dataSet.key;

		var idKey = database.metaAttr(["ids", dataSet.userid]);
		var nicknameKey = database.metaAttr(["nicknames", dataSet.nickname]);

		if (idKey && idKey !== signKey) {
			throw new errors.SecurityError("we already have got a key for this users id");
		}

		if (nicknameKey && nicknameKey !== signKey) {
			throw new errors.SecurityError("we already have got a key for this users nickname");
		}

		database.metaAdd([signKey], dataSet);

		if (dataSet.nickname) {
			database.metaAdd(["nicknames", dataSet.nickname], signKey);
		}

		database.metaAdd(["ids", dataSet.userid], signKey);
	},
	updateDatabase: function(data, cb) {
		if (!loaded || data._signature === database.metaAttr("_signature")) {
			return Bluebird.resolve().nodeify(cb);
		}

		var givenDatabase = SecuredData.load(undefined, data, {
			type: "trustManager"
		});
		return Bluebird.try(function() {
			if (data.me === ownKey) {
				return givenDatabase.verifyAsync(ownKey, "user");
			}

			throw new errors.SecurityError("not my trust database");
		}).then(function() {
			var newKeys = givenDatabase.metaKeys().filter(function(key) {
				return !database.metaHasAttr(key);
			});

			var oldKeys = givenDatabase.metaKeys().filter(function(key) {
				return database.metaHasAttr(key);
			}).filter(function(key) {
				return specialKeys.indexOf(key) === -1;
			});

			var changed = false;

			newKeys.forEach(function(signKey) {
				changed = true;

				var userDataSet = givenDatabase.metaAttr(signKey);

				trustManager.addDataSet(userDataSet);
			});

			oldKeys.forEach(function(signKey) {
				var oldValue = database.metaAttr(signKey);
				var newValue = givenDatabase.metaAttr(signKey);

				var oldTrust = unserializeTrust(oldValue.trust);
				var newTrust = unserializeTrust(newValue.trust);

				if (sortedTrustStates.indexOf(oldTrust) < sortedTrustStates.indexOf(newTrust)) {
					changed = true;
					database.metaAdd([signKey, "trust"], newValue.trust);
				}
			});

			if (changed) {
				trustManager.notify("", "updated");
			}

			return changed;
		}).nodeify(cb);
	},
	loadDatabase: function(data, cb) {
		if (loaded) {
			return;
		}

		if (data.me !== ownKey) {
			throw new errors.SecurityError("not my trust database");
		}

		var givenDatabase = SecuredData.load(undefined, data, {
			type: "trustManager"
		});
		return Bluebird.try(function() {
			return givenDatabase.verifyAsync(ownKey, "user");
		}).then(function() {
			trustManager.disallow();
			database = givenDatabase;
			loaded = true;

			trustManager.notify("", "loaded");
		}).nodeify(cb);
	},
	hasKeyData: function(keyid) {
		if (!loaded) {
			if (keyid === ownKey) {
				return true;
			} else if (fakeKeyExistence > 0) {
				fakeKeyExistence -= 1;
				return true;
			} else {
				throw new Error("trust manager not yet loaded");
			}
		}
		return database.metaHasAttr(keyid);
	},
	getKeyData: function(keyid) {
		var keyData = database.metaAttr(keyid);

		if (keyData) {
			return new KeyTrustData(keyData);
		}

		return false;
	},
	addUser: function(userInfo) {
		trustManager.addDataSet(userToDataSet(userInfo));
	},
	setKeyTrustLevel: function(signKey, trustLevel) {
		if (trustLevel === trustStates.OWN) {
			throw new Error("do not use setKeyTrustLevel for own keys.");
		}

		if (database.metaHasAttr(signKey)) {
			database.metaAdd([signKey, "trust"], serializeTrust(trustLevel));

			return true;
		}

		return false;
	},
	getUpdatedVersion: function(cb) {
		return database.sign(ownKey).nodeify(cb);
	}
};

Observer.extend(trustManager);

module.exports = trustManager;
