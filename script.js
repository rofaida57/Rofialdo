// ========= SETUP AND LIBRARIES =========
const Engine = Matter.Engine,
      Render = Matter.Render,
      World = Matter.World,
      Bodies = Matter.Bodies,
      Body = Matter.Body,
      Events = Matter.Events,
      Vector = Matter.Vector;

// Game Settings
const TABLE_WIDTH = 1000;
const TABLE_HEIGHT = 500;
const BALL_RADIUS = 15;
const POCKET_RADIUS = 25;
const FRICTION = 0.005;
const RESTITUTION = 0.95;
const MAX_POWER = 0.15;

// Create physics engine
const engine = Engine.create();
engine.world.gravity.y = 0; // No gravity in pool

// Create renderer
const render = Render.create({
    canvas: document.getElementById('game-canvas'),
    engine: engine,
    options: {
        width: TABLE_WIDTH,
        height: TABLE_HEIGHT,
        wireframes: false, // Important for solid colors/textures
        background: 'transparent' // We'll draw the background manually
    }
});

// Ball definitions (color and number)
const ballDefinitions = {
    1: { color: '#FFFF00', number: '1', stripe: false },
    2: { color: '#0000FF', number: '2', stripe: false },
    3: { color: '#FF0000', number: '3', stripe: false },
    4: { color: '#800080', number: '4', stripe: false },
    5: { color: '#FFA500', number: '5', stripe: false },
    6: { color: '#008000', number: '6', stripe: false },
    7: { color: '#8B4513', number: '7', stripe: false },
    8: { color: '#000000', number: '8', stripe: false },
    9: { color: '#FFFF00', number: '9', stripe: true },
    10: { color: '#0000FF', number: '10', stripe: true },
    11: { color: '#FF0000', number: '11', stripe: true },
    12: { color: '#800080', number: '12', stripe: true },
    13: { color: '#FFA500', number: '13', stripe: true },
    14: { color: '#008000', number: '14', stripe: true },
    15: { color: '#8B4513', number: '15', stripe: true },
    cue: { color: '#FFFFFF', number: '', stripe: false }
};

// Game state variables
let gameState = {
    currentPlayer: 1,
    player1Type: null, // 'solids' or 'stripes'
    player2Type: null,
    player1Score: 0,
    player2Score: 0,
    isAiming: false,
    isMoving: false,
    cueBall: null,
    balls: [],
    aimLine: { start: null, end: null },
    power: 0,
    firstHit: null, // To track the first ball hit in a turn
    gameOver: false,
    consecutiveFouls: 0
};

// ========= SOUNDS =========
const sounds = {
    hit: new Howl({ src: ['https://assets.mixkit.co/sfx/preview/mixkit-ball-hitting-the-pocket-2091.mp3'], volume: 0.5 }),
    cueHit: new Howl({ src: ['https://assets.mixkit.co/sfx/preview/mixkit-billiards-ball-hit-2076.mp3'], volume: 0.7 }),
    pocket: new Howl({ src: ['https://assets.mixkit.co/sfx/preview/mixkit-coin-win-notification-2018.mp3'], volume: 0.6 }),
    foul: new Howl({ src: ['https://assets.mixkit.co/sfx/preview/mixkit-wrong-answer-fail-notification-946.mp3'], volume: 0.8 }),
    win: new Howl({ src: ['https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-2015.mp3'], volume: 0.9 })
};

// ========= TABLE AND BALLS CREATION =========
function createTable() {
    const wallThickness = 50;
    const walls = [
        Bodies.rectangle(TABLE_WIDTH / 2, TABLE_HEIGHT / 2 + wallThickness / 2, TABLE_WIDTH, wallThickness, { isStatic: true, render: { visible: false } }),
        Bodies.rectangle(TABLE_WIDTH / 2, -wallThickness / 2, TABLE_WIDTH, wallThickness, { isStatic: true, render: { visible: false } }),
        Bodies.rectangle(-wallThickness / 2, TABLE_HEIGHT / 2, wallThickness, TABLE_HEIGHT, { isStatic: true, render: { visible: false } }),
        Bodies.rectangle(TABLE_WIDTH + wallThickness / 2, TABLE_HEIGHT / 2, wallThickness, TABLE_HEIGHT, { isStatic: true, render: { visible: false } })
    ];
    World.add(engine.world, walls);
}

function createBalls() {
    gameState.balls = [];
    
    // Cue Ball
    gameState.cueBall = Bodies.circle(250, TABLE_HEIGHT / 2, BALL_RADIUS, {
        restitution: RESTITUTION,
        friction: FRICTION,
        frictionAir: 0.01,
        label: 'cue',
        render: { fillStyle: ballDefinitions.cue.color } // Base color
    });

    // Other balls (triangle formation)
    const ballLabels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const startX = 700;
    const startY = TABLE_HEIGHT / 2;
    const spacing = BALL_RADIUS * 2.05;
    let ballIndex = 0;

    for (let row = 0; row < 5; row++) {
        for (let col = 0; col <= row; col++) {
            const x = startX + row * spacing * 0.866;
            const y = startY + (col - row / 2) * spacing;
            const label = ballLabels[ballIndex];
            const ball = Bodies.circle(x, y, BALL_RADIUS, {
                restitution: RESTITUTION,
                friction: FRICTION,
                frictionAir: 0.01,
                label: label,
                render: { fillStyle: ballDefinitions[label].color } // Base color
            });
            gameState.balls.push(ball);
            ballIndex++;
        }
    }

    World.add(engine.world, [gameState.cueBall, ...gameState.balls]);
}

// ========= MOUSE CONTROL AND AIMING =========
const canvas = document.getElementById('game-canvas');
const powerMeter = document.getElementById('power-meter');
const powerBar = document.querySelector('.power-bar');

canvas.addEventListener('mousedown', startAiming);
canvas.addEventListener('mousemove', updateAim);
canvas.addEventListener('mouseup', shoot);

function startAiming(event) {
    if (gameState.isMoving || gameState.gameOver) return;
    gameState.isAiming = true;
    gameState.firstHit = null;
    powerMeter.classList.add('visible');
}

function updateAim(event) {
    if (!gameState.isAiming) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    gameState.aimLine.start = { x: gameState.cueBall.position.x, y: gameState.cueBall.position.y };
    gameState.aimLine.end = { x: mouseX, y: mouseY };

    const distance = Vector.magnitude(Vector.sub(gameState.aimLine.start, gameState.aimLine.end));
    gameState.power = Math.min(distance / 200, 1);
    powerBar.style.width = `${gameState.power * 100}%`;
}

function shoot() {
    if (!gameState.isAiming || gameState.gameOver) return;
    
    sounds.cueHit.play();
    gameState.isAiming = false;
    powerMeter.classList.remove('visible');
    powerBar.style.width = '0%';

    const force = Vector.mult(Vector.normalise(Vector.sub(gameState.aimLine.start, gameState.aimLine.end)), gameState.power * MAX_POWER);
    Body.applyForce(gameState.cueBall, gameState.cueBall.position, force);
    gameState.isMoving = true;
    gameState.aimLine = { start: null, end: null };
}

// ========= POCKET SYSTEM AND GAME LOGIC =========
const pockets = [
    {x: 0, y: 0}, {x: TABLE_WIDTH / 2, y: 0}, {x: TABLE_WIDTH, y: 0},
    {x: 0, y: TABLE_HEIGHT}, {x: TABLE_WIDTH / 2, y: TABLE_HEIGHT}, {x: TABLE_WIDTH, y: TABLE_HEIGHT}
];

function checkPockets() {
    if (!gameState.cueBall) return;
    
    // Check cue ball in pocket
    for (const pocket of pockets) {
        if (Vector.magnitude(Vector.sub(gameState.cueBall.position, pocket)) < POCKET_RADIUS) {
            handleFoul("Foul! Scratch.");
            World.remove(engine.world, gameState.cueBall);
            gameState.cueBall = Bodies.circle(250, TABLE_HEIGHT / 2, BALL_RADIUS, {
                restitution: RESTITUTION, friction: FRICTION, frictionAir: 0.01,
                label: 'cue', render: { fillStyle: ballDefinitions.cue.color }
            });
            World.add(engine.world, gameState.cueBall);
            return;
        }
    }

    // Check other balls in pocket
    for (let i = gameState.balls.length - 1; i >= 0; i--) {
        const ball = gameState.balls[i];
        if (!ball) continue;
        for (const pocket of pockets) {
            if (Vector.magnitude(Vector.sub(ball.position, pocket)) < POCKET_RADIUS) {
                const ballLabel = ball.label;
                World.remove(engine.world, ball);
                gameState.balls.splice(i, 1);
                sounds.pocket.play();
                handleBallPocketed(ballLabel);
                return;
            }
        }
    }
}

function handleBallPocketed(ballLabel) {
    if (ballLabel === 8) {
        const playerType = gameState.currentPlayer === 1 ? gameState.player1Type : gameState.player2Type;
        const playerScore = gameState.currentPlayer === 1 ? gameState.player1Score : gameState.player2Score;
        
        if (playerType && playerScore === 7) {
            endGame(`Player ${gameState.currentPlayer} Wins!`);
        } else {
            endGame(`Player ${gameState.currentPlayer === 1 ? 2 : 1} Wins! (Opponent sunk the 8-ball early)`);
        }
        return;
    }

    // First ball pocketed determines player types
    if (!gameState.player1Type) {
        if (ballLabel <= 7) {
            gameState.player1Type = 'Solids';
            gameState.player2Type = 'Stripes';
        } else {
            gameState.player1Type = 'Stripes';
            gameState.player2Type = 'Solids';
        }
        updateUI();
        updateStatusMessage(`Player ${gameState.currentPlayer} is ${gameState.currentPlayer === 1 ? gameState.player1Type : gameState.player2Type}`);
    }

    const currentPlayerType = gameState.currentPlayer === 1 ? gameState.player1Type : gameState.player2Type;
    const isCorrectBall = (currentPlayerType === 'Solids' && ballLabel <= 7) || (currentPlayerType === 'Stripes' && ballLabel > 8);

    if (isCorrectBall) {
        if (gameState.currentPlayer === 1) gameState.player1Score++;
        else gameState.player2Score++;
        updateUI();
        updateStatusMessage(`Player ${gameState.currentPlayer} pocketed a ball! Continue playing.`);
    } else {
        handleFoul("Foul! Wrong ball pocketed.");
    }
}

function handleFoul(message) {
    sounds.foul.play();
    updateStatusMessage(message);
    gameState.consecutiveFouls++;
    switchPlayer();
}

function switchPlayer() {
    gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
    updateUI();
    updateStatusMessage(`Player ${gameState.currentPlayer}'s Turn`);
}

function endGame(message) {
    sounds.win.play();
    gameState.gameOver = true;
    gameState.isMoving = false;
    updateStatusMessage(message);
}

// ========= UPDATES AND CUSTOM RENDERING =========
Events.on(engine, 'collisionStart', (event) => {
    const pairs = event.pairs;
    pairs.forEach(pair => {
        const { bodyA, bodyB } = pair;
        if (bodyA.label !== 'wall' && bodyB.label !== 'wall') {
            sounds.hit.play();
        }
        if (!gameState.firstHit && (bodyA.label === 'cue' || bodyB.label === 'cue')) {
            const otherBall = bodyA.label === 'cue' ? bodyB : bodyA;
            if (otherBall.label !== 'cue') {
                gameState.firstHit = otherBall.label;
            }
        }
    });
});

function gameLoop() {
    const allBodies = [...gameState.balls, gameState.cueBall].filter(b => b);
    const isAnyBallMoving = allBodies.some(body => body.speed > 0.2);

    if (gameState.isMoving && !isAnyBallMoving) {
        gameState.isMoving = false;
        checkPockets();
        
        // Check if any ball was hit
        if (gameState.firstHit === null) {
             handleFoul("Foul! No ball was hit.");
        } else {
            const currentPlayerType = gameState.currentPlayer === 1 ? gameState.player1Type : gameState.player2Type;
            if (currentPlayerType) {
                const isCorrectFirstHit = (currentPlayerType === 'Solids' && gameState.firstHit <= 7) || 
                                         (currentPlayerType === 'Stripes' && gameState.firstHit > 8 && gameState.firstHit !== 8);
                if (!isCorrectFirstHit) {
                    handleFoul("Foul! Hit opponent's ball first.");
                }
            }
        }
    }
    requestAnimationFrame(gameLoop);
}

// Function to draw a single ball
function drawBall(context, body) {
    const { x, y } = body.position;
    const definition = ballDefinitions[body.label];
    if (!definition) return;

    // Draw main circle
    context.beginPath();
    context.arc(x, y, BALL_RADIUS, 0, 2 * Math.PI);
    context.fillStyle = definition.color;
    context.fill();
    context.strokeStyle = '#000000';
    context.lineWidth = 1;
    context.stroke();

    // Draw stripe for striped balls
    if (definition.stripe) {
        context.beginPath();
        context.arc(x, y, BALL_RADIUS * 0.6, 0, 2 * Math.PI);
        context.fillStyle = '#FFFFFF';
        context.fill();
    }

    // Draw number
    if (definition.number) {
        context.fillStyle = definition.stripe ? '#000000' : '#FFFFFF';
        context.font = 'bold 10px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(definition.number, x, y);
    }
}

Events.on(render, 'afterRender', () => {
    const context = render.canvas.getContext('2d');
    
    // Draw pockets
    context.fillStyle = 'black';
    pockets.forEach(p => {
        context.beginPath();
        context.arc(p.x, p.y, POCKET_RADIUS, 0, 2 * Math.PI);
        context.fill();
    });

    // Draw all balls manually
    const allBalls = [...gameState.balls, gameState.cueBall].filter(b => b);
    allBalls.forEach(ball => {
        drawBall(context, ball);
    });

    // Draw aim line
    if (gameState.isAiming && gameState.aimLine.start && gameState.aimLine.end) {
        context.beginPath();
        context.moveTo(gameState.aimLine.start.x, gameState.aimLine.start.y);
        const direction = Vector.sub(gameState.aimLine.start, gameState.aimLine.end);
        const end = Vector.add(gameState.aimLine.start, Vector.mult(Vector.normalise(direction), 200));
        context.lineTo(end.x, end.y);
        context.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        context.lineWidth = 3;
        context.setLineDash([10, 10]);
        context.stroke();
        context.setLineDash([]);
    }
});

// ========= UI MANAGEMENT =========
function updateUI() {
    document.querySelector('#player1-info .player-score').textContent = gameState.player1Score;
    document.querySelector('#player2-info .player-score').textContent = gameState.player2Score;
    document.querySelector('#player1-info .player-type').textContent = gameState.player1Type || 'Not Assigned';
    document.querySelector('#player2-info .player-type').textContent = gameState.player2Type || 'Not Assigned';

    document.getElementById('player1-info').classList.toggle('active', gameState.currentPlayer === 1);
    document.getElementById('player2-info').classList.toggle('active', gameState.currentPlayer === 2);
}

function updateStatusMessage(message) {
    document.getElementById('game-status-message').textContent = message;
}

function resetGame() {
    World.clear(engine.world);
    Engine.clear(engine);
    
    gameState = {
        currentPlayer: 1, 
        player1Type: null, 
        player2Type: null,
        player1Score: 0, 
        player2Score: 0, 
        isAiming: false, 
        isMoving: false,
        cueBall: null, 
        balls: [], 
        aimLine: { start: null, end: null },
        power: 0, 
        firstHit: null, 
        gameOver: false,
        consecutiveFouls: 0
    };
    
    createTable();
    createBalls();
    updateUI();
    updateStatusMessage("Player 1's Turn - Aim and shoot!");
    
    Engine.run(engine);
    Render.run(render);
}

// Instructions Modal
const modal = document.getElementById("instructions-modal");
const instructionsBtn = document.getElementById("instructions-btn");
const closeBtn = document.getElementsByClassName("close")[0];

instructionsBtn.onclick = function() {
    modal.style.display = "block";
}

closeBtn.onclick = function() {
    modal.style.display = "none";
}

window.onclick = function(event) {
    if (event.target == modal) {
        modal.style.display = "none";
    }
}

document.getElementById('new-game-btn').addEventListener('click', resetGame);

// ========= INITIALIZE GAME =========
window.addEventListener('load', () => {
    resetGame();
    gameLoop();
});
