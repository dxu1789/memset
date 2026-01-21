const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let state = {
    deck: [],
    board: [],
    selected: [],
    player1Sets: [],
    player2Sets: [],
    activePlayer: 'p1',
    settings: {
        revealTime: 1500
    }
};

function createDeck() {
    const deck = [];
    for (let s = 0; s < 3; s++) {
        for (let c = 0; c < 3; c++) {
            for (let n = 0; n < 3; n++) {
                for (let f = 0; f < 3; f++) {
                    deck.push({ s, c, n: n + 1, f, id: Math.random().toString(36).substr(2, 9) });
                }
            }
        }
    }
    return deck.sort(() => Math.random() - 0.5);
}

function isSet(cards) {
    if (cards.length !== 3) return false;
    const features = ['s', 'c', 'n', 'f'];
    return features.every(feature => {
        const values = cards.map(card => card[feature]);
        const uniqueValues = new Set(values).size;
        return uniqueValues === 1 || uniqueValues === 3;
    });
}

function findSet(board) {
    for (let i = 0; i < board.length; i++) {
        for (let j = i + 1; j < board.length; j++) {
            for (let k = j + 1; k < board.length; k++) {
                if (isSet([board[i], board[j], board[k]])) {
                    return [board[i].id, board[j].id, board[k].id];
                }
            }
        }
    }
    return null;
}

function fillBoard() {
    while (state.board.length < 16 && state.deck.length > 0) {
        state.board.push(state.deck.pop());
    }
}

function resetGame() {
    state.deck = createDeck();
    state.board = [];
    fillBoard();
    state.selected = [];
    state.player1Sets = [];
    state.player2Sets = [];
    state.activePlayer = 'p1';
}

io.on('connection', (socket) => {
    io.emit('playerCount', io.engine.clientsCount);

    const getMaskedState = () => ({
        ...state,
        deckCount: state.deck.length,
        board: state.board.map(c => state.selected.some(s => s.id === c.id) ? c : { id: c.id, hidden: true })
    });

    socket.emit('gameState', getMaskedState());

    socket.on('updateSettings', (newSettings) => {
        state.settings = { ...state.settings, ...newSettings };
        io.emit('gameState', getMaskedState());
    });

    socket.on('selectCard', ({ cardId }) => {
        const card = state.board.find(c => c.id === cardId);
        if (!card || state.selected.find(s => s.id === cardId) || state.selected.length >= 3) return;

        state.selected.push(card);
        io.emit('gameState', getMaskedState());

        if (state.selected.length === 3) {
            setTimeout(() => {
                const foundSet = isSet(state.selected);
                if (foundSet) {
                    const historyKey = state.activePlayer === 'p1' ? 'player1Sets' : 'player2Sets';
                    state[historyKey].push([...state.selected]);
                    state.selected.forEach(sel => {
                        const idx = state.board.findIndex(c => c.id === sel.id);
                        if (idx !== -1) state.board.splice(idx, 1);
                    });
                    fillBoard();
                    // BONUS TURN: activePlayer does not change
                } else {
                    state.activePlayer = state.activePlayer === 'p1' ? 'p2' : 'p1';
                }
                state.selected = [];
                io.emit('gameState', getMaskedState());
            }, state.settings.revealTime);
        }
    });

    socket.on('getHint', () => {
        const hintIds = findSet(state.board);
        socket.emit('hint', hintIds);
    });

    socket.on('reset', () => {
        resetGame();
        io.emit('gameState', getMaskedState());
    });

    socket.on('disconnect', () => {
        io.emit('playerCount', io.engine.clientsCount);
    });
});

resetGame();
http.listen(3000, () => console.log('Server running on port 3000'));
