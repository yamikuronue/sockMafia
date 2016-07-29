'use strict';

/**
 * sockMafia Mod controller
 * @module sockmafia.MafiaModController
 * @author Yamikuronue
 * @license MIT
 */

const view = require('./view');
const Promise = require('bluebird');
const debug = require('debug')('sockbot:mafia:modController');
const Utils = require('./utils');


exports.internals = {};
let eventLogger;

exports.init = function (forum) {
	eventLogger = forum;
};

/**
 * Valid properties for a player to hold
 * @type {Array}
 */

/**
 * Log an error that was recovered from
 * @param  {Error} error The error to log
 */
function logRecoveredError(error) {
	debug(error);
	if (eventLogger && eventLogger.emit) {
		eventLogger.emit('logExtended', 3, error);
	}
}

/**
 * Log a debug statement
 * @param  {String} statement The statement to log
 */
function logDebug(statement) {
	debug(statement);
	if (eventLogger && eventLogger.emit) {
		eventLogger.emit('logExtended', 5, statement);
	}
}

/**
 * Advance the day.
 * @returns Promise that resolves when the action is complete
 */
function advance(game, type, endTime, command) {
	const advFunc = type.toLowerCase() === 'day' ? game.newDay : game.nextPhase;
	const currDay = game.day;
	const currPhase = game.phase;

	const data = {};

	return advFunc.bind(game)().then(() => {

			debug('Went from ' + currDay + ' ' + currPhase + ' to ' + game.day + ' ' + game.phase);
			if (endTime) {
				data.phaseEnd = endTime;
				data.showPhaseEnd = true;
				return game.setValue('phaseEnd', endTime);
			} else {
				data.showPhaseEnd = false;
				return Promise.resolve();
			}
		})
		.then(() => {
			if (game.day > currDay) {

				const numPlayers = game.livePlayers.length;
				data.day = game.day;
				data.toExecute = Math.ceil(numPlayers / 2);

				data.numPlayers = game.livePlayers.length;

				data.names = game.livePlayers.map((player) => {
					return player.username;
				});

				logDebug('Moved to new day in  ' + game.name);
				return view.respondWithTemplate('/templates/newDayTemplate.handlebars', data, command);
			} else {
				let text = 'It is now ' + game.phase;
				if (data.showPhaseEnd) {
					text += '. The phase will end ' + data.phaseEnd;
				}
				return view.respond(command, text);
			}

		});
}

/**
 * isNumeric
 * @returns true if the input is a number, false if not
 */
function isNumeric(input) {
	return /^\d+$/.test(input);
};

/**
 * The controller class for Mafiabot
 */
class MafiaModController {

	/**
	 * The constructor
	 * @param  {sockmafia.src.dao.MafiaDao} d      The dao to use to persist the data
	 */
	constructor(d) {
		this.dao = d;
	}

	/**
	 * Activate the controller
	 * @param  {Forum} forum The forum to activate for
	 */
	activate(forum) {
		this.forum = forum;
		//Register commandss
		forum.Commands.add('set', 'Assign a player a role (mod only)', this.setHandler.bind(this));
		forum.Commands.add('kill', 'kill a player (mod only)', this.killHandler.bind(this));
		forum.Commands.add('new-day', 'move on to a new day (mod only)', this.dayHandler.bind(this));
		forum.Commands.add('next-phase', 'move on to the next phase (mod only)', this.phaseHandler.bind(this));
		forum.Commands.add('list-night-actions', 'List night actions submitted (mod only)', this.listNAHandler.bind(this));
		forum.Commands.add('add', 'Add a thread or chat to the game (mod only)', this.addHandler.bind(this));
		forum.Commands.add('setValue', 'Set a Game Option', (command) => this.setValue(command));
		forum.Commands.addAlias('option', (command) => this.setValue(command));
		forum.Commands.add('send-rolecard', 'Send a rolecard to a user', (command) => this.sendRoleCard(command));
	}


	sendRoleCard(command) {
		const target = Utils.argParse(command.args, ['in']),
			gameName = command.args.join(' ');
		if (!target || !gameName) {
			command.reply('Invalid command: command format is `!send-rolecard TargetUsername in TargetGame`');
			return Promise.resolve();
		}
		return Promise.all([
				this.dao.getGame(gameName),
				command.getUser()
			])
			.then((data) => {
				const game = data[0],
					user = data[1],
					rolecard = command.parent.text,
					title = `Rolecard for ${game.name}`,
					targets = game.moderators;
				try {
					game.getModerator(user.username);
				} catch (moderr) {
					throw new Error(`You are not a moderator for ${game.name}`);
				}
				try {
					targets.push(game.getPlayer(target).username);
				} catch (moderr) {
					throw new Error(`${target} is not a living player in ${game.name}`);
				}
				return this.forum.Chat.create(targets, rolecard, title)
					.then((chatroom) => game.addChat(chatroom.id))
					.then(() => command.reply(`Sent rolecard to ${target} in ${game.name}`));
			}).catch((err) => {
				debug('Error occurred sending rolecard', err);
				command.reply(`Error sending rolecard: ${err}`);
			});
	}

	setValue(command) {
		if ('set' === (command.args[0] || '').toLowerCase()) {
			command.args.shift();
		}
		const option = Utils.argParse(command.args, ['to', 'equal', 'equals']),
			value = Utils.argParse(command.args, ['in']),
			gameName = Utils.argParse(command.args, []) || command.parent.ids.topic;
		return Promise.all([
				this.dao.getGame(gameName),
				command.getUser()
			])
			.then((data) => {
				const game = data[0],
					user = data[1];
				try {
					game.getModerator(user.username);
				} catch (_) {
					throw new Error('You are not a moderator!');
				}
				return game.setValue(option, value);
			})
			.then((oldValue) => {
				command.reply(`Set option ${option} to value "${value}" (Previous value was ${oldValue || 'unset'})`);
			}).catch((err) => {
				debug('Error ocurred setting game value', err);
				command.reply(`Error setting player property: ${err}`);
			});
	}

	addHandler(command) {
		const type = command.args[0];
		const num = command.args[1];
		const name = command.args[2].toLowerCase() === 'in' ? command.args[3] : command.args[2];

		let game;

		return this.dao.getGameByName(name).then((g) => {
				game = g;
				return command.getUser();
			}).then((user) => {
				logDebug('Received add request from ' + user.username + ' for ' + num + ' in game ' + name);
				try {
					game.getModerator(user.username);
				} catch (_) {
					throw new Error('You are not a moderator!');
				}
			}).then(() => {
				if (type.toLowerCase() === 'thread') {
					game.addTopic(num);
				} else if (type.toLowerCase() === 'chat') {
					game.addChat(num);
				} else if (type.toLowerCase() === 'this') {
					return command.getTopic().then((topic) => {
						if (topic.id === -1) {
							//Command came from a chat
							game.addChat(command.parent.ids[0]);
						} else {
							game.addTopic(topic.id);
						}
					});
				} else {
					throw new Error(`I don't know how to add a "${type}". Try a "thread" or a "chat"?`);
				}
			})
			.catch((err) => {
				logRecoveredError('Error when setting property: ' + err);
				view.reportError(command, 'Error setting player property: ', err);
			});
	}
    
    getGame (command) {
		//First check for 'in soandso' syntax
		for (let i = 0; i < command.args.length; i++) {
			if (command.args[i].toLowerCase() === 'in' && command.args[i + 1]) {
				const target = command.args.slice(i + 1, command.args.length).join(' ');
				if (isNumeric(target)) {
					return this.dao.getGameByTopicId(target);
				} else {
					return this.dao.getGameByName(target);
				}
			}
		}
		if (command.parent.ids.topic === -1) {
			//Command came from a chat
			return this.dao.getGameByChatId(command.parent.ids.chat);
		} else {
			return this.dao.getGameByTopicId(command.parent.ids.topic);
		}
	}
    
    addHandler (command) {
		function notEnoughArgs() {
			const text = 'Incorrect syntax. Usage: !add [thread|chat] 123 testMafia or !add [thread|chat] 123 to testMafia or !add this to testMafia';
			logRecoveredError('Error when setting property: ' + text);
			view.reportError(command, 'Error setting player property: ', text);
			return Promise.resolve();
		}
	
		/*
		Terse mode:					Terse this mode:
		args = {					args = {
			'thread',					'this',
			'123',						'testMafia'
			'testMafia'				}
		}
		
		Verbose mode:				Verbose this mode:
		args = {					args = {
			'thread',					'this',
			'123',						'to',
			'to'						'testMafia'
			'testMafia'				}
		}
		*/
	
		let game;
		const thisMode = command.args[0].toLowerCase() === 'this';
		let itemId = thisMode ? '' : command.args[1];
		let gameId, user;
		let chat = false;

		if (thisMode) {
			if (command.args.length < 2) {
				return notEnoughArgs();
			}
			gameId = command.args[1];
			if (gameId.toLowerCase() === 'to') {
				gameId = command.args[2];
			}
		} else {
			if (command.args.length < 3) {
				return notEnoughArgs();
			}
			gameId = command.args[2];
			if (gameId.toLowerCase() === 'to') {
				gameId = command.args[3];
			}
		}
		
		return command.getUser().then((u) => {
			user = u;
			
			if (isNumeric(gameId)) {
				return this.dao.getGameByTopicId(gameId);
			} else {
				return this.dao.getGameByName(gameId);
			}
		}).then((g) => {
			game = g;
			
			try {
				game.getModerator(user.username);
			} catch (_) {
				return Promise.reject('You are not a moderator');
			}
			logDebug('Received add thread/chat request in ' + game.name + ' from ' + user.username);
			
		}).then(() => {
			if (thisMode) {
				const topicId = command.parent.ids.topic;
				if (topicId === -1) {
					//Command came from a chat
					chat = true;
					itemId = command.parent.ids.chat;
					return game.addChat(itemId);
				} else {
					itemId = topicId;
					return game.addTopic(itemId);
				}
			}
		
			const type = command.args[0];
			if ( type === 'thread') {
				return game.addTopic(itemId);
			} else if ( type === 'chat') {
				chat = true;
				return game.addChat(itemId);
			} else {
				throw new Error(`I don't know how to add a "${type}". Try a "thread" or a "chat"?`);
			}
		})
		.then(() => {
			view.respond(command, 'Sucess! That thread/chat is now part of the game.');
			if (chat) {
				view.respondInChat(itemId, 'This chat is now sanctioned as part of ' + game.name);
			} else {
				view.respondInThread(itemId, 'This thread is now sanctioned as part of ' + game.name);
			}
		})
		.catch((err) => {
			logRecoveredError('Error adding thread/chat: ' + err);
			view.reportError(command, 'Error adding thread/chat: ', err);
		});
	}

	/**
	 * Set: set a prperty for a player.
	 * No game rules; this sets up rules for voting
	 * @param {Sockbot.commands.command} command The command object
	 */
	setHandler(command) {
		const targetString = command.args[0] ? command.args[0].replace('@', '') : '';
		const property = command.args[1];
		let modName, game, mod, target;

		return command.getUser()
			.then((user) => {
				modName = user.username;
				logDebug('Received set property request from ' + modName + ' for ' + targetString);
				return this.getGame(command);
			})
			.then((g) => {
				game = g;
				return game.isActive ? Promise.resolve() : Promise.reject('Game not started. Try `!start`.');
			})
			.then(() => {
				try {
					mod = game.getModerator(modName);
				} catch (_) {
					return Promise.reject('You are not a moderator');
				}
				return mod.isModerator ? Promise.resolve() : Promise.reject('You are not a moderator');
			})
			.then(() => {
				if (command.args.length < 2) {
					throw new Error('Incorrect syntax. Usage: !set [playerName] [property] or !set [playername] [property] in testMafia');
				}
			
				if (!Utils.Enums.validProperties.contains(property.toLowerCase())) {
					return Promise.reject('Property not valid.\n Valid properties: ' + Utils.Enums.validProperties.join(', '));
				}

				try {
					target = game.getPlayer(targetString);
				} catch (_) {
					throw new Error('Target not in game');
				}
				return target.isAlive ? Promise.resolve() : Promise.reject('Target not alive');
			})
			.then(() => target.addProperty(property))
			.then(() => {
				logDebug('Player ' + target.username + ' is now ' + property + ' in ' + game);
				return view.respondWithTemplate('templates/modSuccess.handlebars', {
					command: 'Set property',
					results: 'Player ' + target.username + ' is now ' + property,
					game: game.name
				}, command);
			})
			.catch((err) => {
				logRecoveredError('Error when setting property: ' + err);
				debug(err.stack);
				view.reportError(command, 'Error setting player property: ', err);
			});
	}

	/**
	* Next-phase: A mod function that moves to the next phase
	* Must be used in the game thread.
	*
	* Game rules:
	*  - A game can advance to night when it is in the day phase
	*  - A game can only be advanced by the mod
	*  - When the game is advanced to night, a new day does not start
	* 
	* @example !next-phase
	*
	* @param  {commands.command} command The command that was passed in.
	* @returns {Promise}        A promise that will resolve when the game is ready
	*/
	phaseHandler (command) {
		let modName, game, mod, endTime;
		
		if (command.args[0] === 'ends' && command.args[1]) {
			command.args.shift();
			endTime = command.args.join(' ');
		}

		return command.getUser().then((user) => {
				modName = user.username;
				logDebug('Received next phase request from ' + modName);
				return this.getGame(command);
			})
			.then((g) => {
				game = g;
				return game.isActive ? Promise.resolve() : Promise.reject('Game not started. Try `!start`.');
			})
			.then(() => {
				try {
					mod = game.getModerator(modName);
				} catch (_) {
					return Promise.reject('You are not a moderator');
				}
				return mod.isModerator ? Promise.resolve() : Promise.reject('You are not a moderator');
			})
			.then(() => advance(game, 'phase', endTime, command))
			.catch((err) => {

				debug(err.stack);
				logRecoveredError('Error incrementing phase: ' + err);
				view.reportError(command, 'Error incrementing phase: ', err);
			});
	}

	/**
	 * New-day: A mod function that starts a new day
	 * Must be used in the game thread.
	 *
	 * Game rules:
	 *  - A game can advance to day when it is in the night phase
	 *  - A game can advance to night when it is in the day phase
	 *  - A game can only be advanced by the mod
	 *  - When the game is advanced to day, a new day starts
	 *  - When the game is advanced to night, a new day does not start
	 *  - When a new day starts, the vote counts from the previous day are reset
	 *  - When a new day starts, the list of players is output for convenience
	 *  - When a new day starts, the "to-lynch" count is output for convenience
	 *
	 * @example !new-day
	 *
	 * @param  {commands.command} command The command that was passed in.
	 * @returns {Promise}        A promise that will resolve when the game is ready
	 */
	dayHandler(command) {
		const data = {
			numPlayers: 0,
			toExecute: 0,
			day: 0,
			names: []
		};
		let  modName, game, mod, endTime;
		
		if (command.args[0] === 'ends' && command.args[1]) {
			command.args.shift();
			endTime = command.args.join(' ');
		}

		return command.getUser().then((user) => {
				modName = user.username;
				logDebug('Received new day request from ' + modName);
				return this.getGame(command);
			})
			.then((g) => {
				game = g;
				return game.isActive ? Promise.resolve() : Promise.reject('Game not started. Try `!start`.');
			})
			.then(() => {
				try {
					mod = game.getModerator(modName);
				} catch (_) {
					return Promise.reject('You are not a moderator');
				}
				return mod.isModerator ? Promise.resolve() : Promise.reject('You are not a moderator');
			})
			.then(() => advance(game, 'day', endTime, command))
			.catch((err) => {
				logRecoveredError('Error incrementing day: ' + err);
				view.reportError(command, 'Error incrementing day: ', err);
			});
	}

	/**
	 * Kill: A mod function that modkills or nightkills a player.
	 * Must be used in the game thread.
	 *
	 * Game rules:
	 *  - A player can only be killed if they are already in the game.
	 *  - A player can only be killed if they are alive.
	 *  - A player can only be !killed by the mod.
	 *
	 * @example !kill playerName
	 *
	 * @param  {commands.command} command The command that was passed in.
	 * @returns {Promise}        A promise that will resolve when the game is ready
	 */
	killHandler(command) {
		const targetString = command.args[0] ? command.args[0].replace('@', '') : '';

		let modName, game, mod, target;

			return command.getUser().then((user) => {
				modName = user.username;
				logDebug('Received kill request from ' + modName + 'for ' + target);
				return this.getGame(command);
			})
			.then((g) => {
				game = g;
				return game.isActive ? Promise.resolve() : Promise.reject('Game not started. Try `!start`.');
			})
			.then(() => {
				try {
					mod = game.getModerator(modName);
				} catch (_) {
					return Promise.reject('You are not a moderator');
				}
				return mod.isModerator ? Promise.resolve() : Promise.reject('You are not a moderator');
			})
			.then(() => {
				if (targetString === '') {
					throw new Error('Please select a target to kill');
				}
				
				try {
					target = game.getPlayer(targetString);
				} catch (_) {
					throw new Error('Target not in game');
				}
				return target.isAlive ? Promise.resolve() : Promise.reject('Target not alive');
			})
			.then(() => game.killPlayer(targetString))
			.then(() => {
				logDebug('Killing ' + target);
				return view.respondWithTemplate('templates/modSuccess.handlebars', {
					command: 'Kill',
					results: 'Killed @' + targetString,
					game: game.name
				}, command);
			})
			.catch((err) => {
				logRecoveredError('Error killing player: ' + err);
				view.reportError(command, 'Error killing player: ', err);
			});
	}


	/**
	 * List Night Actions: A mod function that lists the current night actions.
	 * Useful when the mod is ready to take action on them, or for shits and grins
	 * in club ded
	 *
	 * @example !list-night-actions testMafia
	 * @example !list-night-actions 123
	 *
	 * @param  {commands.command} command The command that was passed in.
	 * @returns {Promise}        A promise that will resolve when the game is ready
	 */
	listNAHandler(command) {
		let game, mod;
		const gameId = command.args[0];
		debug('Listing night actions for ' + gameId);

		return Promise.all([this.getGame(command), command.getUser()])
		.then((responses) => {
			game = responses[0];
			try {
				mod = game.getModerator(responses[1].username);
			} catch (_) {
				return Promise.reject('You are not a moderator');
			}
			return mod.isModerator ? Promise.resolve() : Promise.reject('You are not a moderator');
		}).then((a) => {
			const actions = game.getActions('target').filter((action) => {
				return action.isCurrent;
			});
			const data = {
				scum2: {
					show: false,
					actions: []
				},
				scum: {
					show: false,
					actions: []
				},
				other: {
					show: false,
					actions: []
				},
			};
			
			for (let i = 0; i < actions.length; i++) {
				if (actions[i].token === 'scum') {
					data.scum.actions.push(actions[i]);
					data.scum.show = true;
				} else if (actions[i].token === 'scum2') {
					data.scum2.actions.push(actions[i]);
					data.scum2.show = true;
				} else {
					data.other.actions.push(actions[i]);
					data.other.show = true;
				}
			}
			
			return view.respondWithTemplate('templates/listNightActions.hbs', data, command);
		}).catch((err) => {
			logRecoveredError('Error listing night actions: ' + err);
			view.reportError(command, 'Error listing night actions: ', err);
		});
	}
}

module.exports = MafiaModController;
