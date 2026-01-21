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
        revealTime: 1500,
        ultraMode: false
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

function isUltraSet(cards) {
    if (cards.length !== 4) return false;
    
    // Try all possible pairings: (0,1)+(2,3), (0,2)+(1,3), (0,3)+(1,2)
    const pairings = [
        [[0, 1], [2, 3]],
        [[0, 2], [1, 3]],
        [[0, 3], [1, 2]]
    ];
    
    for (const [[i1, i2], [i3, i4]] of pairings) {
        // Find hypothetical 5th card that would complete both pairs
        const hypothetical = findHypotheticalCard(cards[i1], cards[i2]);
        if (!hypothetical) continue;
        
        // Check if the same hypothetical completes the second pair
        const hypothetical2 = findHypotheticalCard(cards[i3], cards[i4]);
        if (!hypothetical2) continue;
        
        // Check if both hypotheticals are the same
        if (cardsEqual(hypothetical, hypothetical2)) {
            return true;
        }
    }
    
    return false;
}

function findHypotheticalCard(card1, card2) {
    // For each feature, determine what the 3rd card needs to be
    const hypothetical = {};
    const features = ['s', 'c', 'n', 'f'];
    
    for (const feature of features) {
        const val1 = card1[feature];
        const val2 = card2[feature];
        
        if (val1 === val2) {
            // If same, third must be same
            hypothetical[feature] = val1;
        } else {
            // If different, third must be the remaining value (all different)
            const possibleValues = feature === 'n' ? [1, 2, 3] : [0, 1, 2];
            const remaining = possibleValues.find(v => v !== val1 && v !== val2);
            hypothetical[feature] = remaining;
        }
    }
    
    return hypothetical;
}

function cardsEqual(card1, card2) {
    return card1.s === card2.s && 
           card1.c === card2.c && 
           card1.n === card2.n && 
           card1.f === card2.f;
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

function findUltraSetOnBoard(board) {
    for (let i = 0; i < board.length; i++) {
        for (let j = i + 1; j < board.length; j++) {
            for (let k = j + 1; k < board.length; k++) {
                for (let l = k + 1; l < board.length; l++) {
                    if (isUltraSet([board[i], board[j], board[k], board[l]])) {
                        return [board[i].id, board[j].id, board[k].id, board[l].id];
                    }
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
        const maxCards = state.settings.ultraMode ? 4 : 3;
        const card = state.board.find(c => c.id === cardId);
        if (!card || state.selected.find(s => s.id === cardId) || state.selected.length >= maxCards) return;

        state.selected.push(card);
        io.emit('gameState', getMaskedState());

        if (state.selected.length === maxCards) {
            setTimeout(() => {
                const foundPattern = state.settings.ultraMode ? 
                    isUltraSet(state.selected) : 
                    isSet(state.selected);
                    
                if (foundPattern) {
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
        const hintIds = state.settings.ultraMode ? 
            findUltraSetOnBoard(state.board) : 
            findSet(state.board);
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
