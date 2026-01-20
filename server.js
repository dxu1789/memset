const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let state = {
    deck: [],
    currentCards: [],
    flippedIndices: [],
    matchedIndices: [],
    currentPlayer: 'p1',
    scores: { p1: 0, p2: 0 }
};

function createDeck() {
    // Red, Green, Proper Purple
    const colors = ['#ff4757', '#2ed573', '#8e44ad']; 
    const shapes = ['oval', 'diamond', 'squiggle'];
    const numbers = [1, 2, 3];
    const fillings = ['solid', 'striped', 'open'];
    const deck = [];
    for (let color of colors) {
        for (let shape of shapes) {
            for (let number of numbers) {
                for (let filling of fillings) {
                    deck.push({ color, shape, number, filling });
                }
            }
        }
    }
    return deck.sort(() => Math.random() - 0.5);
}

function isSet(cards) {
    if (cards.length !== 3) return false;
    const features = ['color', 'shape', 'number', 'filling'];
    return features.every(feature => {
        const values = cards.map(c => c[feature]);
        return (values[0] === values[1] && values[1] === values[2]) || 
               (values[0] !== values[1] && values[0] !== values[2] && values[1] !== values[2]);
    });
}

function findSet(cards, matchedIndices) {
    for (let i = 0; i < cards.length; i++) {
        if (matchedIndices.includes(i)) continue;
        for (let j = i + 1; j < cards.length; j++) {
            if (matchedIndices.includes(j)) continue;
            for (let k = j + 1; k < cards.length; k++) {
                if (matchedIndices.includes(k)) continue;
                if (isSet([cards[i], cards[j], cards[k]])) return [i, j, k];
            }
        }
    }
    return null;
}

function initGame() {
    const deck = createDeck();
    state = {
        deck: deck.slice(16),
        currentCards: deck.slice(0, 16),
        flippedIndices: [],
        matchedIndices: [],
        currentPlayer: 'p1',
        scores: { p1: 0, p2: 0 }
    };
}

initGame();

io.on('connection', (socket) => {
    socket.emit('init', state);

    socket.on('cardClicked', (index) => {
        if (state.flippedIndices.includes(index) || state.matchedIndices.includes(index) || state.flippedIndices.length >= 3) return;
        state.flippedIndices.push(index);
        io.emit('syncFlip', state.flippedIndices);
        
        if (state.flippedIndices.length === 3) {
            const selectedCards = state.flippedIndices.map(i => state.currentCards[i]);
            if (isSet(selectedCards)) {
                state.scores[state.currentPlayer]++;
                state.matchedIndices.push(...state.flippedIndices);
                io.emit('matchFound', { matched: state.flippedIndices, scores: state.scores });
                state.flippedIndices = [];
            } else {
                state.currentPlayer = state.currentPlayer === 'p1' ? 'p2' : 'p1';
                io.emit('turnEnd', { currentPlayer: state.currentPlayer });
                state.flippedIndices = [];
            }
        }
    });

    socket.on('requestHint', () => {
        const setIndices = findSet(state.currentCards, state.matchedIndices);
        socket.emit('hintResult', setIndices);
    });

    socket.on('resetGame', () => {
        initGame();
        io.emit('init', state);
    });
});

server.listen(3000, () => console.log('Server running on port 3000'));