'use strict';

// const urllib = require('urllib'); // 网络请求
const axios = require('axios')
const user = module.parent.require('./user');

const meta = module.parent.require('./meta');
const db = module.parent.require('../src/database');
const passport = module.parent.require('passport');
const passportDingtalk = require('./passport-dingtalk').Strategy;
const nconf = module.parent.require('nconf');
// const async = module.parent.require('async');
const winston = module.parent.require('winston');
const authenticationController = module.parent.require(
	'./controllers/authentication'
);

// 配置管理界面的菜单信息
const constants = Object.freeze({
	name: '钉钉登录配置',
	admin: {
		icon: 'fa-users',
		route: '/plugins/dingtalk-login',
	},
});

const Dingtalk = {};

/**
 * 字段白名单，见钩子
 * @param {*} data
 * @param {*} callback
 */
Dingtalk.appendUserHashWhitelist = function (data, callback) {
	data.whitelist.push('unionid');
	data.whitelist.push('openid');
	return setImmediate(callback, null, data);
};

/**
 * passport策略初始化，见钩子
 * @param {*} strategies
 * @param {*} callback
 */
Dingtalk.getStrategy = function (strategies, callback) {
	meta.settings.get('dingtalk-login', function (err, settings) {
		if (!err && settings.id && settings.secret) {
			Dingtalk.settings = settings || {};
			passport.use(
				'dingtalk',
				new passportDingtalk(
					{
						clientID: settings.id,
						clientSecret: settings.secret,
						callbackURL: nconf.get('url') + '/auth/dingtalk/callback',
						scope: 'snsapi_login',
						passReqToCallback: true,
					},
					async function (req, accessToken, refreshToken, profile, done) {
						// profile : {
						// 	nick, // 钉钉名
						// 	unionid, // 某企业内唯一id
						// 		dingId,
						// 		openid
						// }
						// console.log('====>获取钉钉信息3,accessToken,refreshToken', accessToken, refreshToken, profile,done);
						// 如果uid大于0
						if (
							req.hasOwnProperty('user') &&
              req.user.hasOwnProperty('uid') &&
              req.user.uid > 0
						) {
							// 已有用户，如果用户想绑定一个以上的NodeBB用户，我们拒绝他/她。
							Dingtalk.hasDingTalkUnionid(profile.unionid, function (err, res) {
								if (err) {
									winston.error(err);
									return done(err);
								}
								if (res) {
									return done(
										new Error(
											'You have binded a Dingtalk account.If you want to bind another one ,please unbind your account.'
										),
										false
									);
								}
//
								winston.info(
									`[SSO-Dingtalk-web] ${req.user.uid} is binded.(openid is ${profile.openid} and nickname is ${profile.nick}`
								);
								return done(null, req.user);
							});
						} else {
							// 如果没有uid
							// 登录
							Dingtalk.login(
								profile.unionid,
								profile.openid,
								profile.nick,
								profile.dingId,
								accessToken,
								refreshToken,
								function (err, user) {
									// console.log('====>登录回调',err, user);
									if (err) {
										return done(err);
									}
									// 登录成功
									authenticationController.onSuccessfulLogin(
										req,
										user.uid,
										function (err) {
											if (err) {
												return done(err);
											}
											winston.info(
												'[sso-Dingtalk-web] user:' +
                            user.uid +
                            ' is logged via Dingtalk.(openid is ' +
                            profile.openid +
                            ' and nickname is ' +
                            profile.nick +
                            ')'
											);
											done(null, user);
										}
									);
								}
							);
						}
					}
				)
			);
		}
	});

	strategies.push({
		name: 'dingtalk',
		url: '/auth/dingtalk',
		callbackURL: '/auth/dingtalk/callback',
		icon: 'fa-users',
		scope: '',
	});

	callback(null, strategies);
};

/**
 *  初始化见钩子
 * @param {*} data
 * @param {*} callback
 */
Dingtalk.init = function (data, callback) {
	function renderAdmin(req, res) {
		res.render('admin/plugins/dingtalk-login', {
			callbackURL: nconf.get('url') + '/auth/dingtalk/callback',
		});
	}
	data.router.get(
		'/admin/plugins/dingtalk-login',
		data.middleware.admin.buildHeader,
		renderAdmin
	);
	data.router.get('/api/admin/plugins/dingtalk-login', renderAdmin);
	callback();
};

/**
 * 添加菜单项，见钩子
 * @param {*} header
 * @param {*} callback
 */
Dingtalk.addMenuItem = function (header, callback) {
	header.authentication.push({
		route: constants.admin.route,
		icon: constants.admin.icon,
		name: constants.name,
	});

	callback(null, header);
};



Dingtalk.getUserInfoByUnionid = async function (unionid) {
	try {
		console.log('====>通过settings 拿url',	Dingtalk.settings);
		const res = await axios.post(Dingtalk.settings.getUserInfoByUnionid, {unionid});
		if (res.status===200) {
			return res.data;
		}
	} catch (error) {
		console.log('====>error',error);
		throw error
	}
}


/**
 * 登录处理方法
 * @param {*} unionid
 * @param {*} openid
 * @param {*} nick
 * @param {*} accessToken
 * @param {*} refreshToken
 * @param {*} callback
 */
Dingtalk.login = function (
	unionid,
	openid,
	nick,
	dingId,
	accessToken,
	refreshToken,
	callback
) {
	 Dingtalk.getUidByDingtalkUnionid (unionid, async function (err, uid) {
		if (err) {
			return callback(err);
		}

		try {
			let userInfo = await Dingtalk.getUserInfoByUnionid(unionid)
			// console.log('====>获取到企业用户信息', userInfo);
		
			if (userInfo.errcode) {
				return callback( new Error(JSON.stringify(userInfo)));
			}

				
				let _nickName = userInfo.extension ? JSON.parse(userInfo.extension)['花名'] : userInfo.name.split('（')[0]
				let userData  = {
					username: _nickName||userInfo.name||'',
					userslug: _nickName||userInfo.name||'',
					fullname: userInfo.name||'',
					email: userInfo.org_email || `${userInfo.unionid}@your_company.com`,
					picture: userInfo.avatar,
					location: userInfo.work_place,
					// signature: '',
					// aboutme: '',
					hired_date: userInfo.hired_date,
					job_number: userInfo.job_number,
					mobile: userInfo.mobile,
					remark: userInfo.remark,
					title: userInfo.title,
					unionid: userInfo.unionid,
					userid: userInfo.userid,
				}


 
		 if (uid !== null) {
			 // 老用户
			//  console.log('====>老用户NO.4-1',uid)
			 Dingtalk.storeTokens(uid, accessToken, refreshToken);
			 // 更新用户信息
			 user.setUserFields(uid, userData, function (err, user) {
				 if (err) {
					 throw err
				 }
			 })
			 callback(null, {	uid: uid,	});
		 } else {
			 // 新用户
			 const success = function (uid) {
				//  console.log('====>写入新用户uid信息NO.5', uid)
				 // 添加用户信息
				 user.setUserFields(uid, {
					 dingtalk_nick:nick,
					 dingtalk_dingId:dingId,
					 dingtalk_openid:openid,
					 ...userData
				 }, function (err, user) {
					 if (err) {
						 throw err
					 }
				 })
				 
				 db.setObjectField('unionid:uid', unionid, uid);
				 db.setObjectField('openid:uid', openid, uid);
					// 自动认证
				 const autoConfirm = 1;
				 user.setUserField(uid, 'email:confirmed', autoConfirm);
				 if (autoConfirm) {
					 db.sortedSetRemove('users:notvalidated', uid);
				 }
 
				 Dingtalk.storeTokens(uid, accessToken, refreshToken);
				 winston.info(
					 '[sso-dingtalk-web]uid:' +
						 uid +
						 'is created successfully.(unionid is ' +
						 unionid +
						 '(openid is ' +
						 openid +
						 ', nickname is ' +
						 nick +
						 ')'
				 );
				 callback(null, {
					 uid: uid,
				 });
			 };
 
 
			 // 邮箱不能为空
			 user.create(userData, function (err, uid) {
				//  console.log('====>新用户NO.4-2===>', uid,userData)
				 if (err) {
					 console.log('====>新用户创建失败NO.4-3',uid,err)
					 // 如果用户名是无效的
					 user.create({ username:  nick+userInfo.unionid, email: `${userInfo.unionid}@your_company.com`,...userData}, function (
						 err,
						 uid
					 ) {
						 if (err) {
							 return callback(err);
						 }
						 success(uid);
					 });
				 }
				 success(uid);
			 });
		 }
		} catch (error) {
			
		}
	});
	// 登录结束
};

/**
 * 是否存在openid
 * @param {*} openid
 * @param {*} callback
 */
// Dingtalk.hasDingTalkOpenId = function (openid, callback) {
// 	db.isObjectField('openid:uid', openid, function (err, res) {
// 		if (err) {
// 			return callback(err);
// 		}
// 		callback(null, res);
// 	});
// };


/**
 * 是否存在unionid
 * @param {*} unionid
 * @param {*} callback
 */
Dingtalk.hasDingTalkUnionid = function (unionid, callback) {
	db.isObjectField('unionid:uid', unionid, function (err, res) {
		if (err) {
			return callback(err);
		}
		callback(null, res);
	});
};

/**
 * openid获取uid
 * @param {*} openid
 * @param {*} callback
 */
// Dingtalk.getUidByDingtalkOpenId = async function (openid, callback) {
// 	db.getObjectField('openid:uid', openid, function (err, uid) {
// 		if (err) {
// 			callback(err);
// 		} else {
// 			callback(null, uid);
// 		}
// 	});
// };

/**
 * unionid获取uid
 * @param {*} unionid
 * @param {*} callback
 */
Dingtalk.getUidByDingtalkUnionid = async function (unionid, callback) {
	// 这种横向关联方式 可以继续优化
	db.getObjectField('unionid:uid', unionid, function (err, uid) {
		if (err) {
			callback(err);
		} else {
			callback(null, uid);
		}
	});
};

/**
 * 刷新token
 * @param {*} uid
 * @param {*} accessToken
 * @param {*} refreshToken
 */
Dingtalk.storeTokens = function (uid, accessToken, refreshToken) {
	// JG: 实际上是保存有用的东西
	winston.info(
		'Storing received Dingtalk access information for uid(' +
      uid +
      ') accessToken(' +
      accessToken +
      ') refreshToken(' +
      refreshToken +
      ')'
	);
	user.setUserField(uid, 'dingtalk_accessToken', accessToken);
	user.setUserField(uid, 'dingtalk_refreshToken', refreshToken);
};


module.exports = Dingtalk;
