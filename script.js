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
    gameOver: false
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
    // Table walls (invisible but solid)
    const walls = [
        Bodies.rectangle(TABLE_WIDTH / 2, TABLE_HEIGHT / 2 + wallThickness / 2, TABLE_WIDTH, wallThickness, { isStatic: true, render: { visible: false } }), // Bottom
        Bodies.rectangle(TABLE_WIDTH / 2, -wallThickness / 2, TABLE_WIDTH, wallThickness, { isStatic: true, render: { visible: false } }), // Top
        Bodies.rectangle(-wallThickness / 2, TABLE_HEIGHT / 2, wallThickness, TABLE_HEIGHT, { isStatic: true, render: { visible: false } }), // Left
        Bodies.rectangle(TABLE_WIDTH + wallThickness / 2, TABLE_HEIGHT / 2, wallThickness, TABLE_HEIGHT, { isStatic: true, render: { visible: false } }) // Right
    ];
    World.add(engine.world, walls);
}

function createBalls() {
    // Reset arrays
    gameState.balls = [];
    
    // Cue Ball
    gameState.cueBall = Bodies.circle(250, TABLE_HEIGHT / 2, BALL_RADIUS, {
        restitution: RESTITUTION,
        friction: FRICTION,
        frictionAir: 0.01,
        label: 'cue',
        render: { sprite: { texture: 'assets/cue_ball.png', xScale: 0.5, yScale: 0.5 } }
    });

    // Other balls (triangle formation)
    const ballSetup = [
        {label: 1, x: 0, y: 0}, {label: 2, x: 1, y: 0}, {label: 3, x: 2, y: 0},
        {label: 4, x: 0, y: 1}, {label: 5, x: 1, y: 1}, {label: 6, x: 2, y: 1},
        {label: 7, x: 0, y: 2}, {label: 8, x: 1, y: 2}, {label: 9, x: 2, y: 2},
        {label: 10, x: 0, y: 3}, {label: 11, x: 1, y: 3}, {label: 12, x: 2, y: 3},
        {label: 13, x: 0, y: 4}, {label: 14, x: 1, y: 4}, {label: 15, x: 2, y: 4}
    ];
    const startX = 700;
    const startY = TABLE_HEIGHT / 2;
    const spacing = BALL_RADIUS * 2.05; // Slight overlap for tight pack

    ballSetup.forEach(setup => {
        const x = startX + setup.x * spacing * 0.866; // 0.866 = cos(30°)
        const y = startY + (setup.y - 2) * spacing;
        const ball = Bodies.circle(x, y, BALL_RADIUS, {
            restitution: RESTITUTION,
            friction: FRICTION,
            frictionAir: 0.01,
            label: setup.label,
            render: { sprite: { texture: `assets/ball_${setup.label}.png`, xScale: 0.5, yScale: 0.5 } }
        });
        gameState.balls.push(ball);
    });

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
    gameState.firstHit = null; // Reset first hit for the new turn
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
    gameState.power = Math.min(distance / 200, 1); // Normalize power between 0 and 1
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
    
    // Check cue ball (scratch)
    for (const pocket of pockets) {
        if (Vector.magnitude(Vector.sub(gameState.cueBall.position, pocket)) < POCKET_RADIUS) {
            handleFoul("Foul! Scratch.");
            World.remove(engine.world, gameState.cueBall);
            // Respawn cue ball
            gameState.cueBall = Bodies.circle(250, TABLE_HEIGHT / 2, BALL_RADIUS, {
                restitution: RESTITUTION, friction: FRICTION, frictionAir: 0.01,
                label: 'cue', render: { sprite: { texture: 'assets/cue_ball.png', xScale: 0.5, yScale: 0.5 } }
            });
            World.add(engine.world, gameState.cueBall);
            return; // Stop checking other pockets this frame
        }
    }

    // Check other balls
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
                return; // Stop checking other pockets this frame
            }
        }
    }
}

function handleBallPocketed(ballLabel) {
    if (ballLabel === 8) {
        // Check win/lose conditions for the 8-ball
        const playerType = gameState.currentPlayer === 1 ? gameState.player1Type : gameState.player2Type;
        const playerScore = gameState.currentPlayer === 1 ? gameState.player1Score : gameState.player2Score;
        
        if (playerType && playerScore === 7) {
            endGame(`Player ${gameState.currentPlayer} Wins!`);
        } else {
            endGame(`Player ${gameState.currentPlayer === 1 ? 2 : 1} Wins! (Opponent sunk the 8-ball early)`);
        }
        return;
    }

    // Assign ball types if not already assigned
    if (!gameState.player1Type) {
        if (ballLabel <= 7) {
            gameState.player1Type = 'Solids';
            gameState.player2Type = 'Stripes';
        } else {
            gameState.player1Type = 'Stripes';
            gameState.player2Type = 'Solids';
        }
        updateUI();
    }

    // Check if the pocketed ball belongs to the current player
    const currentPlayerType = gameState.currentPlayer === 1 ? gameState.player1Type : gameState.player2Type;
    const isCorrectBall = (currentPlayerType === 'Solids' && ballLabel <= 7) || (currentPlayerType === 'Stripes' && ballLabel > 8);

    if (isCorrectBall) {
        // Correct ball, player scores and continues
        if (gameState.currentPlayer === 1) gameState.player1Score++;
        else gameState.player2Score++;
        updateUI();
        // Player continues, no switch
    } else {
        // Wrong ball, it's a foul
        handleFoul("Foul! Wrong ball pocketed.");
    }
}

function handleFoul(message) {
    sounds.foul.play();
    updateStatusMessage(message);
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
        // Play hit sound for any collision
        if (bodyA.label !== 'wall' && bodyB.label !== 'wall') {
            sounds.hit.play();
        }
        // Track first hit for foul detection
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
    const isAnyBallMoving = allBodies.some(body => body.speed > 0.2); // Threshold for "stopped"

    if (gameState.isMoving && !isAnyBallMoving) {
        gameState.isMoving = false;
        checkPockets(); // Check for pocketed balls after motion stops

        // Check for fouls based on the first ball hit
        if (gameState.firstHit === null) {
             handleFoul("Foul! No ball was hit.");
        } else {
            const currentPlayerType = gameState.currentPlayer === 1 ? gameState.player1Type : gameState.player2Type;
            if (currentPlayerType) { // Only check if types are assigned
                const isCorrectFirstHit = (currentPlayerType === 'Solids' && gameState.firstHit <= 7) || (currentPlayerType === 'Stripes' && gameState.firstHit > 8 && gameState.firstHit !== 8);
                if (!isCorrectFirstHit) {
                    handleFoul("Foul! Hit opponent's ball first.");
                }
            }
        }
    }
    requestAnimationFrame(gameLoop);
}

Events.on(render, 'afterRender', () => {
    const context = render.canvas.getContext('2d');
    
    // Draw table texture
    const tableImg = new Image();
    tableImg.src = 'assets/table_surface.jpg';
    context.globalAlpha = 0.7;
    context.drawImage(tableImg, 0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    context.globalAlpha = 1.0;

    // Draw pockets
    context.fillStyle = 'black';
    pockets.forEach(p => {
        context.beginPath();
        context.arc(p.x, p.y, POCKET_RADIUS, 0, 2 * Math.PI);
        context.fill();
    });

    // Draw aim line
    if (gameState.isAiming && gameState.aimLine.start && gameState.aimLine.end) {
        context.beginPath();
        context.moveTo(gameState.aimLine.start.x, gameState.aimLine.start.y);
        const direction = Vector.sub(gameState.aimLine.start, gameState.aimLine.end);
        const end = Vector.add(gameState.aimLine.start, Vector.mult(Vector.normalise(direction), 200)); // Extend line
        context.lineTo(end.x, end.y);
        context.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        context.lineWidth = 3;
        context.setLineDash([10, 10]);
        context.stroke();
        context.setLineDash([]); // Reset line dash
    }
});

// ========= UI MANAGEMENT =========
function updateUI() {
    document.querySelector('#player1-info .player-score').textContent = gameState.player1Score;
    document.querySelector('#player2-info .player-score').textContent = gameState.player2Score;
    document.querySelector('#player1-info .player-type').textContent = gameState.player1Type || '---';
    document.querySelector('#player2-info .player-type').textContent = gameState.player2Type || '---';

    document.getElementById('player1-info').classList.toggle('active', gameState.currentPlayer === 1);
    document.getElementById('player2-info').classList.toggle('active', gameState.currentPlayer === 2);
}

function updateStatusMessage(message) {
    document.getElementById('game-status-message').textContent = message;
}

function resetGame() {
    // Clear the world
    World.clear(engine.world);
    Engine.clear(engine);
    
    // Reset game state
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
        gameOver: false
    };
    
    // Recreate everything
    createTable();
    createBalls();
    updateUI();
    updateStatusMessage("Player 1's Turn");
    
    // Restart engine and renderer
    Engine.run(engine);
    Render.run(render);
}

document.getElementById('new-game-btn').addEventListener('click', resetGame);

// ========= INITIALIZE GAME =========
resetGame();
gameLoop();
