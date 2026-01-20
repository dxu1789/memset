const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let gameState = {
    fullDeck: [],
    currentCards: [],
    flippedIndices: [],
    scores: { p1: 0, p2: 0 },
    currentPlayer: 'p1',
    matchedIndices: []
};

const colors = ['#df0101', '#62019c', '#00a31b']; // Authentic Red, Purple, Green
const shapes = ['oval', 'diamond', 'squiggle'];
const fillings = ['solid', 'striped', 'open'];
const numbers = [1, 2, 3];

function initGame() {
    let deck = [];
    for (let color of colors) 
        for (let shape of shapes) 
            for (let filling of fillings) 
                for (let number of numbers) 
                    deck.push({ color, shape, filling, number });
    
    deck.sort(() => Math.random() - 0.5);
    gameState.fullDeck = deck;
    gameState.currentCards = deck.slice(0, 16); 
    gameState.matchedIndices = [];
    gameState.flippedIndices = [];
    gameState.scores = { p1: 0, p2: 0 };
    gameState.currentPlayer = 'p1';
}

initGame();

io.on('connection', (socket) => {
    socket.emit('init', gameState);

    socket.on('cardClicked', (index) => {
        if (gameState.flippedIndices.includes(index) || gameState.matchedIndices.includes(index) || gameState.flippedIndices.length >= 3) return;
        
        gameState.flippedIndices.push(index);
        io.emit('syncFlip', gameState.flippedIndices);

        if (gameState.flippedIndices.length === 3) {
            const isSet = checkSetLogic(gameState.flippedIndices.map(i => gameState.currentCards[i]));
            
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
            }, 1200);
        }
    });

    socket.on('requestHint', () => {
        const remaining = gameState.currentCards.map((_, i) => i).filter(i => !gameState.matchedIndices.includes(i));
        for (let i = 0; i < remaining.length; i++) {
            for (let j = i + 1; j < remaining.length; j++) {
                for (let k = j + 1; k < remaining.length; k++) {
                    if (checkSetLogic([gameState.currentCards[remaining[i]], gameState.currentCards[remaining[j]], gameState.currentCards[remaining[k]]])) {
                        socket.emit('hintResult', [remaining[i], remaining[j], remaining[k]]);
                        return;
                    }
                }
            }
        }
        socket.emit('hintResult', null);
    });

    socket.on('resetGame', () => { initGame(); io.emit('init', gameState); });
});

function checkSetLogic(cards) {
    const props = ['color', 'shape', 'filling', 'number'];
    return props.every(prop => {
        const vals = new Set(cards.map(c => c[prop]));
        return vals.size === 1 || vals.size === 3;
    });
}

http.listen(3000, '0.0.0.0');