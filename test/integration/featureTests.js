'use strict';
/*globals describe, it*/

const chai = require('chai'),
	sinon = require('sinon');
	
//promise library plugins
require('sinon-as-promised');
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);

const rimraf = require('rimraf-promise');

chai.should();

const playerController = require('../../src/player_controller');
const modController = require('../../src/mod_controller');
const DAO = require('../../src/dao.js');
const Handlebars = require('handlebars');
const view = require('../../src/view.js');

const testConfig = {
	db: ':memory:',

};

describe('MafiaBot', function() {
	this.timeout(50000);
	let sandbox;

	before(() => {
		//Set up the database
		return rimraf('intTesting.db')
			.then(() => DAO.createDB(testConfig));
	});

	beforeEach(() => {
		sandbox = sinon.sandbox.create();

		//Stub view methods for output trapping
		sandbox.stub(view, 'respondInThread').resolves();
		sandbox.stub(view, 'reportError').resolves();
		sandbox.stub(view, 'respondWithTemplate').resolves();
		sandbox.stub(view, 'respond').resolves();
});

	afterEach(() => {
		sandbox.restore();
	});

	describe('Voting', function () {

		before(() => {
			//Set up the database
			return DAO.addGame(1, 'testGame')
				.then(() => DAO.addPlayerToGame(1, 'yamikuronue', DAO.playerStatus.alive))
				.then(() => DAO.addPlayerToGame(1, 'accalia', DAO.playerStatus.alive))
				.then(() => DAO.addPlayerToGame(1, 'dreikin', DAO.playerStatus.alive))
				.then(() => DAO.addMod(1, 'ModdyMcModerson'))
				.then(() => DAO.setGameStatus(1, DAO.gameStatus.running));
		});

		it('Should allow one player to vote for another', () => {
			const command = {
				post: {
					username: 'yamikuronue',
					'topic_id': 1,
					'post_number': 5
				},
				args: ['@accalia'],
				input: '!vote @accalia'
			};

			//Spies
			sandbox.spy(DAO, 'addActionWithTarget');
			return playerController.voteHandler(command).then(() => {
				view.reportError.called.should.equal(false);
				DAO.addActionWithTarget.called.should.equal(true);
				view.respondInThread.firstCall.args[1].should.include('@yamikuronue voted for @accalia');
			});
		});

		it('Should prevent invalid voters', () => {
			const command = {
				post: {
					username: 'banana',
					'topic_id': 1,
					'post_number': 6
				},
				args: ['@accalia'],
				input: '!vote @accalia'
			};

			//Spies
			sandbox.spy(DAO, 'addActionWithTarget');
			return playerController.voteHandler(command).then(() => {
				view.reportError.called.should.equal(true);
				DAO.addActionWithTarget.called.should.equal(false);
			});
		});

		it('Should prevent invalid targets', () => {
			const command = {
				post: {
					username: 'yamikuronue',
					'topic_id': 1,
					'post_number': 7
				},
				args: ['@banana'],
				input: '!vote @banana'
			};

			//Spies
			sandbox.spy(DAO, 'addActionWithTarget');
			return playerController.voteHandler(command).then(() => {
				//view.reportError.called.should.equal(true);  //TODO: semantically, reportError makes more sense here
				view.respondInThread.called.should.equal(true);
				DAO.addActionWithTarget.called.should.equal(false);
			});
		});

		it('Should allow changing targets', () => {
			const command = {
				post: {
					username: 'yamikuronue',
					'topic_id': 1,
					'post_number': 8
				},
				args: ['@dreikin'],
				input: '!vote @dreikin'
			};

			//Spies
			sandbox.spy(DAO, 'addActionWithTarget');
			return playerController.voteHandler(command).then(() => {
				view.reportError.called.should.equal(false);
				DAO.addActionWithTarget.called.should.equal(true);
				view.respondInThread.firstCall.args[1].should.include('@yamikuronue voted for @dreikin');
			});
		});

		it('Should allow unvoting', () => {
			const command = {
				post: {
					username: 'yamikuronue',
					'topic_id': 1,
					'post_number': 9
				},
				args: [],
				input: '!unvote'
			};

			//Spies
			sandbox.spy(DAO, 'revokeAction');
			return playerController.unvoteHandler(command).then(() => {
				view.reportError.called.should.equal(false);
				DAO.revokeAction.called.should.equal(true);
				view.respond.firstCall.args[1].should.include('@yamikuronue unvoted');
			});
		});

		it('Should allow revoting', () => {
			const command = {
				post: {
					username: 'yamikuronue',
					'topic_id': 1,
					'post_number': 5
				},
				args: ['@dreikin'],
				input: '!vote @dreikin'
			};

			//Spies
			sandbox.spy(DAO, 'addActionWithTarget');
			return playerController.voteHandler(command).then(() => {
				view.reportError.called.should.equal(false);
				DAO.addActionWithTarget.called.should.equal(true);
				view.respondInThread.firstCall.args[1].should.include('@yamikuronue voted for @dreikin');
			});
		});

		/*TODO: No-lynch*/

		it('Should auto-lynch', () => {
			const command = {
				post: {
					username: 'accalia',
					'topic_id': 1,
					'post_number': 5
				},
				args: ['@dreikin'],
				input: '!vote @dreikin'
			};

			//Spies
			sandbox.spy(DAO, 'addActionWithTarget');
			return playerController.voteHandler(command).then(() => {
				view.reportError.called.should.equal(false);
				DAO.addActionWithTarget.called.should.equal(true);
				view.respondInThread.firstCall.args[1].should.include('@accalia voted for @dreikin');
				DAO.isPlayerAlive(1, 'dreikin').should.eventually.equal(false);
			});
		});
	});


	describe('Vote history', () => {
		/*TODO: List-votes*/

		/*TODO: List-all-votes*/
	});

	describe('Game moderation', () => {

		it('Should allow game creation', () => {
			const command = {
				post: {
					username: 'ModdyMcModerson',
					'topic_id': 2,
					'post_number': 1
				},
				args: ['bushidoMafia'],
				input: '!prepare bushidoMafia'
			};
			sandbox.spy(DAO, 'addGame');

			return modController.prepHandler(command).then(() => {
				view.reportError.called.should.equal(false);
				DAO.addGame.called.should.equal(true);
				view.respond.firstCall.args[1].should.include('Game "bushidoMafia" created! The mod is @ModdyMcModerson');
			});
		});

		it('Should only allow game creation once', () => {
			const command = {
				post: {
					username: 'dreikin',
					'topic_id': 2,
					'post_number': 2
				},
				args: ['bushidoMafia'],
				input: '!prepare bushidoMafia'
			};

			sandbox.spy(DAO, 'addGame');

			return modController.prepHandler(command).then(() => {
				view.reportError.called.should.equal(true);
				DAO.addGame.called.should.equal(false);
			});
		});

		it('Should allow joining', () => {
			const command = {
				post: {
					username: 'yamikuronue',
					'topic_id': 2,
					'post_number': 3
				},
				args: [],
				input: '!join'
			};
			sandbox.spy(DAO, 'addPlayerToGame');

			return playerController.joinHandler(command).then(() => {
				view.reportError.called.should.equal(false);
				DAO.addPlayerToGame.called.should.equal(true);
				view.respond.firstCall.args[1].should.include('Welcome to the game, @yamikuronue');
			});
		});

		it('Should only allow joining once', () => {
			const command = {
				post: {
					username: 'yamikuronue',
					'topic_id': 2,
					'post_number': 4
				},
				args: [],
				input: '!join'
			};
			sandbox.spy(DAO, 'addPlayerToGame');

			return playerController.joinHandler(command).then(() => {
				view.reportError.called.should.equal(true);
				DAO.addPlayerToGame.called.should.equal(false);
			});
		});

		it('Should allow player properties to be set', () => {
			const command = {
				post: {
					username: 'ModdyMcModerson',
					'topic_id': 2,
					'post_number': 4
				},
				args: ['@yamikuronue', 'loved'],
				input: '!set @yamikuronue loved'
			};
			sandbox.spy(DAO, 'addPropertyToPlayer');

			return modController.setHandler(command).then(() => {
				view.reportError.called.should.equal(false);
				DAO.addPropertyToPlayer.called.should.equal(true);
				DAO.addPropertyToPlayer.firstCall.args[1].should.equal('yamikuronue');
				DAO.addPropertyToPlayer.firstCall.args[2].should.equal('loved');
				view.respondWithTemplate.called.should.equal(true);
			});
		});

		it('Should not allow player properties to be set on non-players', () => {
			const command = {
				post: {
					username: 'ModdyMcModerson',
					'topic_id': 2,
					'post_number': 5
				},
				args: ['@accalia', 'loved'],
				input: '!set @accalia loved'
			};
			sandbox.spy(DAO, 'addPropertyToPlayer');

			return modController.setHandler(command).then(() => {
				view.reportError.called.should.equal(true);
				DAO.addPropertyToPlayer.called.should.equal(false);
				view.respondWithTemplate.called.should.equal(false);
			});

		});

		it('Should not allow player properties to be set by non-mods', () => {
			const command = {
				post: {
					username: 'yamikuronue',
					'topic_id': 2,
					'post_number': 5
				},
				args: ['@yamikuronue', 'loved'],
				input: '!set @yamikuronue loved'
			};
			sandbox.spy(DAO, 'addPropertyToPlayer');

			return modController.setHandler(command).then(() => {
				view.reportError.called.should.equal(true);
				DAO.addPropertyToPlayer.called.should.equal(false);
				view.respondWithTemplate.called.should.equal(false);
			});

		});

		it('Should not allow the game to be started by non-mods', () => {
			const command = {
				post: {
					username: 'yamikuronue',
					'topic_id': 2,
					'post_number': 6
				},
				args: [],
				input: '!start'
			};
			sandbox.spy(DAO, 'setGameStatus');
			sandbox.spy(DAO, 'incrementDay');
			sandbox.spy(DAO, 'setCurrentTime');

			
			return modController.startHandler(command).then(() => {
				view.reportError.called.should.equal(true);
				DAO.setGameStatus.called.should.equal(false);
				DAO.incrementDay.called.should.equal(false);	
			});
		});
		
		it('Should allow the game to be started', () => {
			const command = {
				post: {
					username: 'ModdyMcModerson',
					'topic_id': 2,
					'post_number': 6
				},
				args: [],
				input: '!start'
			};
			sandbox.spy(DAO, 'setGameStatus');
			sandbox.spy(DAO, 'incrementDay');
			sandbox.spy(DAO, 'setCurrentTime');

			
			return DAO.addPlayerToGame(2, 'accalia').then(() => DAO.addPlayerToGame(2, 'dreikin'))
			.then(() => modController.startHandler(command))
			.then(() => {
				view.reportError.called.should.equal(false);
				DAO.setGameStatus.calledWith(2, 'running').should.equal(true);
				DAO.setCurrentTime.calledWith(2, DAO.gameTime.day).should.equal(true);
				DAO.incrementDay.called.should.equal(true);	
			});
		});

		/*TODO: List players*/

		it('Should change to night', () => {
			const command = {
				post: {
					username: 'ModdyMcModerson',
					'topic_id': 2,
					'post_number': 7
				},
				args: [],
				input: '!next-phase'
			};
			sandbox.spy(DAO, 'incrementDay');
			sandbox.spy(DAO, 'setCurrentTime');

			
			return modController.dayHandler(command).then(() => {
				view.reportError.called.should.equal(false);
				DAO.setCurrentTime.calledWith(2, DAO.gameTime.night).should.equal(true);
				DAO.incrementDay.called.should.equal(false);	
			});
		});

		it('Should change to day', () => {
			const command = {
				post: {
					username: 'ModdyMcModerson',
					'topic_id': 2,
					'post_number': 8
				},
				args: [],
				input: '!new-day'
			};
			sandbox.spy(DAO, 'incrementDay');
			sandbox.spy(DAO, 'setCurrentTime');

			
			return modController.dayHandler(command).then(() => {
				view.reportError.called.should.equal(false);
				DAO.setCurrentTime.calledWith(2, DAO.gameTime.day).should.equal(true);
				DAO.incrementDay.called.should.equal(true);	
			});
		});

		it('Should kill people', () => {
			const command = {
				post: {
					username: 'ModdyMcModerson',
					'topic_id': 2,
					'post_number': 9
				},
				args: ['@yamikuronue'],
				input: '!kill @yamikuronue'
			};
			sandbox.spy(DAO, 'killPlayer');
			sandbox.spy(DAO, 'incrementDay');
			sandbox.spy(DAO, 'setCurrentTime');

			
			return modController.killHandler(command).then(() => {
				view.reportError.called.should.equal(false);
				DAO.killPlayer.calledWith(2, 'yamikuronue').should.equal(true);
				DAO.incrementDay.called.should.equal(false);	
				DAO.setCurrentTime.called.should.equal(false);	
			});
		});

		it('Should end the game', () => {
			const command = {
				post: {
					username: 'ModdyMcModerson',
					'topic_id': 2,
					'post_number': 10
				},
				args: ['@yamikuronue'],
				input: '!kill @yamikuronue'
			};
			sandbox.spy(DAO, 'setGameStatus');
			sandbox.spy(playerController, 'listAllPlayersHandler');

			
			return modController.finishHandler(command).then(() => {
				view.reportError.called.should.equal(false);
				DAO.setGameStatus.calledWith(2, 'finished').should.equal(true);
				playerController.listAllPlayersHandler.called.should.equal(true);
			});
		});
	});

	describe('Special voting', () => {
		/*TODO: doublevoter*/

		/*TODO: bastard bars: loved*/

		/*TODO: bastard bars: hated*/

		/*TODO: open bars: loved*/

		/*TODO: open bars: hated*/
	});
});