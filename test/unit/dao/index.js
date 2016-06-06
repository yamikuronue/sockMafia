'use strict';

const chai = require('chai'),
    sinon = require('sinon');

//promise library plugins
require('sinon-as-promised');
chai.use(require('chai-as-promised'));

chai.should();

const fs = require('fs');

const MafiaDao = require('../../../src/dao'),
    MafiaGame = require('../../../src/dao/mafiaGame');

describe('nouveau dao', () => {
    it('should export a function', () => {
        MafiaDao.should.be.a('function');
    });
    it('should be a constructor', () => {
        const obj = new MafiaDao();
        obj.should.be.an.instanceOf(MafiaDao);
    });
    it('should store connection string', () => {
        const connection = `connection${Math.random()}`;
        const obj = new MafiaDao(connection);
        obj.connection.should.equal(connection);
    });
    it('should default data to null', () => {
        const obj = new MafiaDao();
        chai.expect(obj._data).to.equal(null);
    });
    describe('load()', () => {
        let sandbox = null;
        beforeEach(() => {
            sandbox = sinon.sandbox.create();
            sandbox.stub(fs, 'readFile').yields();
        });
        afterEach(() => sandbox.restore());
        it('should load data via fs.readFile', () => {
            const connection = `connection${Math.random()}`;
            const obj = new MafiaDao(connection);
            return obj.load().then(() => {
                fs.readFile.calledWith(connection, 'utf8').should.be.true;
            });
        });
        it('should load default data on ENOENT', () => {
            const obj = new MafiaDao();
            fs.readFile.yields({
                code: 'ENOENT'
            });
            return obj.load().then((data) => {
                data.should.eql([]);
            });
        });
        it('should reject on read error that is not ENOENT', () => {
            const obj = new MafiaDao();
            const err = new Error('E_BAD_DATA');
            fs.readFile.yields(err);
            return obj.load().should.be.rejectedWith(err);
        });
        it('should load default data on empty file', () => {
            const obj = new MafiaDao();
            fs.readFile.yields(null, '');
            return obj.load().then((data) => {
                data.should.eql([]);
            });
        });
        it('should reject on invalid json in file', () => {
            const obj = new MafiaDao();
            fs.readFile.yields(null, '"i am bad JSON');
            return obj.load().should.be.rejected;
        });
        it('should parse serialized data', () => {
            const obj = new MafiaDao();
            fs.readFile.yields(null, '{"a":42}');
            return obj.load().then((data) => {
                data.should.eql({
                    a: 42
                });
            });
        });
        it('should cache result for later', () => {
            const obj = new MafiaDao();
            fs.readFile.yields(null, '{"a":42}');
            return obj.load().then(() => {
                obj._data.should.eql({
                    a: 42
                });
            });
        });
        it('should return cached data after intial load', () => {
            const data = `SOME_DATA${Math.random()}`;
            const obj = new MafiaDao();
            obj._data = data;
            return obj.load().should.become(data);
        });
        it('should not read from filesystem after intial load', () => {
            const data = `SOME_DATA${Math.random()}`;
            const obj = new MafiaDao();
            obj._data = data;
            return obj.load().then(() => {
                fs.readFile.called.should.be.false;
            });
        });
    });
    describe('save()', () => {
        let sandbox = null;
        beforeEach(() => {
            sandbox = sinon.sandbox.create();
            sandbox.stub(fs, 'writeFile').yields();
        });
        afterEach(() => sandbox.restore());
        it('should write via fs.writeFile', () => {
            const connection = `connection${Math.random()}`;
            const obj = new MafiaDao(connection);
            return obj.save().then(() => {
                fs.writeFile.called.should.be.true;
            });
        });
        it('should not write to destination `:memory:`', () => {
            const connection = ':memory:';
            const obj = new MafiaDao(connection);
            return obj.save().then(() => {
                fs.writeFile.called.should.be.false;
            });
        });
        it('should write to connection string destination', () => {
            const connection = `connection${Math.random()}`;
            const obj = new MafiaDao(connection);
            return obj.save().then(() => {
                const args = fs.writeFile.firstCall.args;
                args[0].should.equal(connection);
            });
        });
        it('should write self data to destination', () => {
            const data = `datadatadata${Math.random()}`;
            const obj = new MafiaDao();
            obj._data = data;
            return obj.save().then(() => {
                const args = fs.writeFile.firstCall.args;
                args[1].should.equal(JSON.stringify(data));
            });
        });
        it('should pretty print serialized data', () => {
            const data = [{
                foobar: `datadatadata${Math.random()}`
            }];
            const obj = new MafiaDao();
            obj._data = data;
            return obj.save().then(() => {
                const args = fs.writeFile.firstCall.args;
                args[1].should.equal(JSON.stringify(data, null, '\t'));
            });
        });
        it('should write data with expected encoding', () => {
            const data = `datadatadata${Math.random()}`;
            const obj = new MafiaDao();
            obj._data = data;
            return obj.save().then(() => {
                const args = fs.writeFile.firstCall.args;
                args[2].should.equal('utf8');
            });
        });
        it('should resolve to self', () => {
            const data = `datadatadata${Math.random()}`;
            const obj = new MafiaDao();
            obj._data = data;
            return obj.save().should.become(obj);
        });
        it('should reject when write fails', () => {
            const obj = new MafiaDao();
            const err = new Error('E_BAD_DATA');
            fs.writeFile.yields(err);
            return obj.save().should.be.rejectedWith(err);
        });
    });
    describe('createGame()', () => {
        let sandbox = null,
            dao = null;
        beforeEach(() => {
            dao = new MafiaDao();
            dao._data = [];
            sandbox = sinon.sandbox.create();
            sandbox.stub(dao, 'load').resolves(dao._data);
            sandbox.stub(dao, 'save').resolves(dao);
        });
        afterEach(() => sandbox.restore());
        it('should load from disk', () => {
            return dao.createGame(42, 'foobar').then(() => {
                dao.load.called.should.be.true;
            });
        });
        it('should save to disk', () => {
            return dao.createGame(42, 'foobar').then(() => {
                dao.save.called.should.be.true;
            });
        });
        it('should load before save', () => {
            return dao.createGame(42, 'foobar').then(() => {
                dao.load.calledBefore(dao.save);
            });
        });
        it('should resolve to newly created game', () => {
            return dao.createGame(42, 'foobar').then((game) => {
                game.should.be.an.instanceOf(MafiaGame);
            });
        });
        it('should store raw data internally', () => {
            return dao.createGame(42, 'foobar').then((game) => {
                dao._data.should.have.length(1);
                dao._data[0].should.not.equal(game);
                game.topicId.should.equal(dao._data[0].topicId);
            });
        });
        it('should reject when topic id is already a game', () => {
            const topicId = Math.random();
            dao._data.push({
                topicId: topicId
            });
            return dao.createGame(topicId, 'foobar').should.be.rejectedWith('E_GAME_EXISTS');
        });
        it('should reject when name is already a game', () => {
            const name = `namename${Math.random()}`;
            dao._data.push({
                name: name
            });
            return dao.createGame(42, name).should.be.rejectedWith('E_GAME_EXISTS');
        });
    });
    describe('getGameByTopicId()', () => {
        let dao = null;
        beforeEach(() => {
            dao = new MafiaDao();
            dao._data = [];
        });
        it('should reject when there are no games', () => {
            return dao.getGameByTopicId(42).should.be.rejectedWith('E_NO_GAME');
        });
        it('should reject when there are no matching games', () => {
            dao._data.push({
                topicId: 45
            });
            return dao.getGameByTopicId(42).should.be.rejectedWith('E_NO_GAME');
        });
        it('should resolve when there is a matching game', () => {
            const id = Math.random();
            dao._data.push({
                topicId: id
            });
            return dao.getGameByTopicId(id).should.be.fulfilled;
        });
        it('should resolve to first matching game', () => {
            const id = Math.random();
            dao._data.push({
                topicId: id,
                id: 0
            });
            dao._data.push({
                topicId: id,
                id: 1
            });
            return dao.getGameByTopicId(id).then((game) => {
                game._data.id.should.equal(0);
            });
        });
        it('should resolve to an instance of MafiaGame', () => {
            const id = Math.random();
            dao._data.push({
                topicId: id
            });
            return dao.getGameByTopicId(id).then((game) => {
                game.should.be.an.instanceOf(MafiaGame);
            });
        });
        it('should bind result to this dao', () => {
            const id = Math.random();
            dao._data.push({
                topicId: id
            });
            return dao.getGameByTopicId(id).then((game) => {
                game._dao.should.equal(dao);
            });
        });
    });
    describe('getGameByName()', () => {
        let dao = null;
        beforeEach(() => {
            dao = new MafiaDao();
            dao._data = [];
        });
        it('should reject when there are no games', () => {
            return dao.getGameByName('foobar').should.be.rejectedWith('E_NO_GAME');
        });
        it('should reject when there are no matching games', () => {
            dao._data.push({
                name: 'quux'
            });
            return dao.getGameByName('foobar').should.be.rejectedWith('E_NO_GAME');
        });
        it('should resolve when there is a matching game', () => {
            const name = `name name ${Math.random()}`;
            dao._data.push({
                name: name
            });
            return dao.getGameByName(name).should.be.fulfilled;
        });
        it('should resolve to first matching game', () => {
            const name = `name name ${Math.random()}`;
            dao._data.push({
                name: name,
                id: 0
            });
            dao._data.push({
                name: name,
                id: 1
            });
            return dao.getGameByName(name).then((game) => {
                game._data.id.should.equal(0);
            });
        });
        it('should resolve to an instance of MafiaGame', () => {
            const name = `name name ${Math.random()}`;
            dao._data.push({
                name: name
            });
            return dao.getGameByName(name).then((game) => {
                game.should.be.an.instanceOf(MafiaGame);
            });
        });
        it('should bind result to this dao', () => {
            const name = `name name ${Math.random()}`;
            dao._data.push({
                name: name
            });
            return dao.getGameByName(name).then((game) => {
                game._dao.should.equal(dao);
            });
        });
    });
    describe('toJSON()', () => {
        it('should produce clone of data', () => {
            const obj = {
                a: Math.random(),
                b: Math.random(),
                c: Math.random(),
            };
            const dao = new MafiaDao();
            dao._data = obj;
            const json = dao.toJSON();
            json.should.eql(obj);
            json.should.not.equal(obj);
        });
    });
});
