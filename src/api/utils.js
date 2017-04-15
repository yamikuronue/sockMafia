exports.getGame = (gameId, dao) =>
    new Promise((resolve) => {
        if (!gameId) {
            throw new Error('E_MISSING_GAME_IDENTIFIER');
        }
        resolve();
    })
    .then(() => dao.getGameById(gameId));

exports.extractUsername = (user, forum) => Promise.resolve()
    .then(() => {
        if (typeof user === 'string' && user.length > 0) {
            return user;
        }
        if (user instanceof forum.User) {
            return user.username;
        }
        throw new Error('E_INVALID_USER');
    });

exports.getUser = (user, game, forum) => exports.extractUsername(user, forum)
    .then((username) => game.getPlayer(username));
