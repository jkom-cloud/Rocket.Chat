import _ from 'underscore';
import { HTTP } from 'meteor/http'

const logger = new Logger('precise.login', {});

RocketChat.API.v1.addRoute('user.precise.group', { authRequired: true }, {
    post() {
		let readOnly = false;
        let id;
        try {
            Meteor.runAsUser(this.userId, () => {
                id = Meteor.call('createPrivateGroup', this.bodyParams.name, this.bodyParams.members ? this.bodyParams.members : [], readOnly);
            });

            return RocketChat.API.v1.success({
                group: RocketChat.models.Rooms.findOneById(id.rid, { fields: RocketChat.API.v1.defaultFieldsToExclude })
            });
        } catch(e) {
            console.log('****', e);
        }
    }
});

RocketChat.API.v1.addRoute('user.precise.test', { authRequired: false }, {
    get() {
        const query = {
            status: "online", 
            "username": {
                "$regex": "^jkom.manager"
            }
        };

        const fields = {
            name: 1,
            email: 0,
            username: 1
        };

        
        const users = RocketChat.models.Users.find(query, {
			skip: 0,
			limit: 100,
			fields
        }).fetch();
        let user = null;
        if (users) {
            user = users[Math.floor(Math.random()*users.length)];
        }
        return RocketChat.API.v1.success({
			user
		});
    }
});

RocketChat.API.v1.addRoute('user.precise.find.group', { authRequired: false }, {
    get() {
        const roomQuery = {
            "name": "group-17705143392s"
        };

        const room = RocketChat.models.Rooms.findOne(roomQuery);
        // console.log('room:', room);
        return RocketChat.API.v1.success({
			room
		});
    }
});

RocketChat.API.v1.addRoute('user.precise.login', { authRequired: false }, {
    post() {   
        const preciseHost = process.env.PRECISE_HOST || 'http://precise.app.99jkom.com/su1/users/';
        logger.info('bodyParams', this.bodyParams);
        check(this.bodyParams, Match.ObjectIncluding({
            precise_uid: Match.Maybe(String),
            precise_token: Match.Maybe(String)
        }));

        const precise_uid = this.bodyParams.precise_uid;
        const precise_token = this.bodyParams.precise_token;
        const pUrl = preciseHost + precise_uid + '/profile/basic';
        const pToken = 'Bearer ' + precise_token;

        let preciseUser = null;
        try {
            const result = HTTP.call('GET', pUrl, {
                params: {Authorization: pToken}
            });
            preciseUser = result.data;
        } catch(error) {
            logger.error('error from precise', error);
            return RocketChat.API.v1.unauthorized();
        }

        // Look to see if user already exists
        let uid;

        let userQuery = {
            'services.precise.uid': precise_uid
        };

        logger.info('Querying user', userQuery);

        const user = Meteor.users.findOne(userQuery);

        logger.info(user);

        if (user) {
            logger.info('Logging user');
            uid = user._id;

        } else {
            logger.info('User does not exist, creating ', preciseUser.nickname);

            // Prepare data for new user
            const userObject = {
                username: preciseUser.nickname,
                password: '12345678',
                email: `${preciseUser.nickname}@jiukangyun.com`,
                profile: {
                    name: preciseUser.name
                }
            };

            // Create new user
            try {
                uid = Accounts.createUser(userObject);

                Meteor.users.update(uid, {
                    $push: {
                        'services.precise.uid': precise_uid
                    }
                })
            } catch (error) {
                logger.error('Error creating new user for precise user', error);
                return RocketChat.API.v1.failure(`Failed to create new user. `);
            }
        }

        const stampedToken = Accounts._generateStampedLoginToken();

        Meteor.users.update(uid, {
            $push: {
                'services.resume.loginTokens': Accounts._hashStampedToken(stampedToken)
            }
        });

        const groupName = `group-${preciseUser.mobile || preciseUser.userId}`;
        // 查询用户分组
        const roomQuery = {
            "name": groupName
        };

        const room = RocketChat.models.Rooms.findOne(roomQuery);
        // console.log('room', room);
        if (room) {
            // console.log(1);
            // 用户组已经存在
            return RocketChat.API.v1.success({
                userId: uid,
                token: stampedToken.token,
                groupId: room._id
            });
        } else {
            // console.log(2);
            // 用户组还不存在，准备创建

            // 获取在线管理员
            const query = {
                status: "online", 
                "name": {
                    "$regex": "^jkom.manager"
                }
            };
            const fields = {
                name: 1,
                email: 0,
                username: 1
            };
            const managers = RocketChat.models.Users.find(query, {
                skip: 0,
                limit: 100,
                fields
            }).fetch();
            let manager = null;
            if (managers && managers.length) {
                manager = managers[Math.floor(Math.random() * managers.length)];
            }
            
            // console.log('managers', managers);
            let readOnly = false;
            let newGroup;
            Meteor.runAsUser(uid, () => {
                const members = ['root'];
                if (manager) {
                  members.push(manager.username);  
                }
                newGroup = Meteor.call('createPrivateGroup', groupName, members, readOnly);
            });
            // console.log('newGroup', newGroup);
            return RocketChat.API.v1.success({
                userId: uid,
                token: stampedToken.token,
                groupId: newGroup.rid
            });
        }
     
    }
});
