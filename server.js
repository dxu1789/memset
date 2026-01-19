const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static('public'));

let gameState = {
    deck: [],
    flippedIndices: [],
    scores: { p1: 0, p2: 0 },
    currentPlayer: 'p1',
    matchedIndices: []
};

// Generate and Shuffle Deck on Server Start
const colors = ['red', 'purple', 'green'], shapes = ['oval', 'diamond', 'squiggle'],
      fillings = ['solid', 'striped', 'open'], numbers = [1, 2, 3];

for (let c of colors) for (let s of shapes) for (let f of fillings) for (let n of numbers)
    gameState.deck.push({ color: c, shape: s, filling: f, number: n });
gameState.deck.sort(() => Math.random() - 0.5);

io.on('connection', (socket) => {
    socket.emit('init', gameState);

    socket.on('cardClicked', (index) => {
        if (gameState.flippedIndices.includes(index) || gameState.matchedIndices.includes(index) || gameState.flippedIndices.length >= 3) return;
        
        gameState.flippedIndices.push(index);
        io.emit('syncFlip', gameState.flippedIndices);

        if (gameState.flippedIndices.length === 3) {
            const isSet = checkSetLogic(gameState.flippedIndices.map(i => gameState.deck[i]));
            
            setTimeout(() => {
                if (isSet) {
                    gameState.matchedIndices.push(...gameState.flippedIndices);
                    gameState.scores[gameState.currentPlayer]++;
                    io.emit('matchFound', { matched: gameState.matchedIndices, scores: gameState.scores });
                } else {
                    gameState.currentPlayer = gameState.currentPlayer === 'p1' ? 'p2' : 'p1';
                    io.emit('turnEnd', { currentPlayer: gameState.currentPlayer });
                }
                gameState.flippedIndices = [];
            }, 1500);
        }
    });
});

function checkSetLogic(cards) {
    const props = ['color', 'shape', 'filling', 'number'];
    return props.every(prop => {
        const vals = new Set(cards.map(c => c[prop]));
        return vals.size === 1 || vals.size === 3;
    });
}

http.listen(3000, '0.0.0.0', () => console.log('Server running on port 3000'));
