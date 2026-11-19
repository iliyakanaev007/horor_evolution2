// Monster Evolution, Eldritch Horror Aesthetics & AI Engine

const MONSTER_STATES = {
    DORMANT: 'DORMANT',     // Level 1: Creepily watching, does nothing
    PATROL: 'PATROL',       // Level 2+: Wandering corridors with jittery steps
    CHASE: 'CHASE',         // Level 2+: Relentless pursuit
    SNIFFING: 'SNIFFING',   // Level 3+: Stopping to smell the air
    TRACKING: 'TRACKING',   // Level 3+: Following scent trail
    SEARCHING: 'SEARCHING', // Lost sight, looking around
    TRAP_INVESTIGATION: 'TRAP_INVESTIGATION',
    CHARGING: 'CHARGING',   // Level 4+: High speed rage rush
    TELEPORTING: 'TELEPORT' // Level 5+: Vanishing in shadows
};

class Monster {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 20;
        this.angle = 0;
        this.state = MONSTER_STATES.DORMANT;
        this.level = 1;

        // Speeds
        this.patrolSpeed = 88;
        this.chaseSpeed = 152;
        this.chargeSpeed = 275;
        this.currentSpeed = this.patrolSpeed;

        // Timers & AI cooldowns
        this.stateTimer = 0;
        this.path = [];
        this.lastPathCalc = 0;
        this.targetPos = null;
        this.lastKnownPlayerPos = null;
        this.trapQueue = [];
        this.trapTarget = null;
        this.trapPaused = false;
        this.pendingNoise = null;
        this.investigatingNoise = false;

        // Sniff ability (Level 3+)
        this.sniffCooldown = 6.0;
        this.isSniffing = false;

        // Charge ability (Level 4+)
        this.chargeCooldown = 8.5;
        this.chargeDuration = 2.2;

        // Teleport ability (Level 5+)
        this.teleportCooldown = 13.0;

        // Senses range (in pixels)
        this.sightDistance = 330;
        this.hearingDistance = 560;
        this.scentDetectDistance = 440;
        this.coalScentDetectDistance = 780;

        // Horror Animation Variables
        this.eyeColor = '#ff1100';
        this.wobblePhase = 0;
        this.pulsePhase = 0;
        this.jawOpen = 0; // 0 to 1
        this.jitterX = 0;
        this.jitterY = 0;
        this.tentaclePhases = [0, 1.2, 2.5, 3.8, 5.0, 0.7];
    }

    setLevel(level, spawnX, spawnY) {
        this.level = level;
        this.x = spawnX;
        this.y = spawnY;
        this.path = [];
        this.targetPos = null;
        this.lastKnownPlayerPos = null;
        this.stateTimer = 0;
        this.trapQueue = [];
        this.trapTarget = null;
        this.trapPaused = false;
        this.pendingNoise = null;
        this.investigatingNoise = false;

        if (this.level === 1) {
            this.state = MONSTER_STATES.DORMANT;
        } else {
            this.state = MONSTER_STATES.PATROL;
            this.currentSpeed = this.patrolSpeed + (this.level - 2) * 12;
        }
    }

    update(dt, player, maze, particleSystem, setWarning) {
        this.wobblePhase += dt * 5;
        this.pulsePhase += dt * 3;

        // Jittery unnatural twitching (Silent Hill style)
        if (Math.random() < 0.25) {
            this.jitterX = (Math.random() - 0.5) * (this.state === MONSTER_STATES.CHARGING ? 6 : 3);
            this.jitterY = (Math.random() - 0.5) * (this.state === MONSTER_STATES.CHARGING ? 6 : 3);
        } else {
            this.jitterX *= 0.7;
            this.jitterY *= 0.7;
        }

        // Animate slithering tentacles
        for (let i = 0; i < this.tentaclePhases.length; i++) {
            this.tentaclePhases[i] += dt * 4.5;
        }

        const hasPendingTrap = Boolean(this.trapTarget || this.trapQueue.length > 0);
        if (hasPendingTrap && !this.trapPaused) {
            const distToPlayer = Math.hypot(player.x - this.x, player.y - this.y);
            const hasLOS = maze.hasLineOfSight(this.x, this.y, player.x, player.y);
            const canSeePlayer = hasLOS && distToPlayer <= this.sightDistance;
            const canHearPlayer = this.level >= 4 && player.isSprinting && distToPlayer <= this.hearingDistance;

            if (canSeePlayer || canHearPlayer) {
                this.trapPaused = true;
                this.lastKnownPlayerPos = { x: player.x, y: player.y };
                this.targetPos = null;
                this.path = [];
                this.lastPathCalc = 0;

                if (canSeePlayer && this.level >= 4 &&
                    this.chargeCooldown <= 0 && this.state !== MONSTER_STATES.CHARGING) {
                    this.startCharge(setWarning);
                } else {
                    if (this.state !== MONSTER_STATES.CHASE && this.state !== MONSTER_STATES.CHARGING) {
                        window.soundEngine.playMonsterGrowl();
                        setWarning(
                            canSeePlayer ? "⚠️ МОНСТР ЗАМЕТИЛ ТЕБЯ И БРОСИЛСЯ В ПОГОНЮ!" : "⚠️ МОНСТР УСЛЫШАЛ ТОПОТ И БРОСИЛСЯ В ПОГОНЮ!",
                            2200
                        );
                    }
                    this.state = MONSTER_STATES.CHASE;
                }
            }
        }

        if (hasPendingTrap && !this.trapPaused) {
            if (!this.trapTarget) {
                this.trapTarget = this.trapQueue.shift();
                this.targetPos = { x: this.trapTarget.worldX, y: this.trapTarget.worldY };
                this.path = maze.findPath(this.x, this.y, this.targetPos.x, this.targetPos.y);
            }

            this.state = MONSTER_STATES.TRAP_INVESTIGATION;
            this.currentSpeed = this.patrolSpeed * 1.8;
            this.eyeColor = '#ff9900';
            this.followPath(dt, maze, () => {
                const trap = this.trapTarget;
                if (!trap) return;

                trap.claimProgress = 0;
                if (!trap.capturedByPlayer) {
                    trap.armed = true;
                    trap.owner = 'monster';
                    window.soundEngine.playTrapReset();
                    setWarning("МОНСТР ПЕРЕЗАРЯДИЛ ЛОВУШКУ И СДЕЛАЛ ЕЁ СВОЕЙ!", 2600);
                }
                trap.capturedByPlayer = false;
                this.trapTarget = null;
                this.targetPos = null;
                this.path = [];
                this.trapPaused = false;
                this.state = this.level === 1 ? MONSTER_STATES.DORMANT : MONSTER_STATES.PATROL;
                this.currentSpeed = this.level === 1 ? this.patrolSpeed : this.patrolSpeed + (this.level - 2) * 12;
            });
            return;
        }

        // Jaw unhinge when chasing or charging
        const targetJaw = (this.state === MONSTER_STATES.CHARGING || this.state === MONSTER_STATES.CHASE) ? 1 : 0.2;
        this.jawOpen = Math.max(0, Math.min(1, this.jawOpen + (targetJaw - this.jawOpen) * 6 * dt));

        // Level 1: Monster does nothing!
        if (this.level === 1 && !this.trapPaused) {
            this.state = MONSTER_STATES.DORMANT;
            this.eyeColor = '#ff2222';
            if (maze.hasLineOfSight(this.x, this.y, player.x, player.y)) {
                this.angle = Math.atan2(player.y - this.y, player.x - this.x);
            }
            return;
        }

        // Dark horror aura & blood particles
        const isAggressive = (this.state === MONSTER_STATES.CHASE || this.state === MONSTER_STATES.CHARGING);
        particleSystem.emitMonsterAura(this.x, this.y, isAggressive);

        // Distance to player
        const distToPlayer = Math.hypot(player.x - this.x, player.y - this.y);
        const hasLOS = maze.hasLineOfSight(this.x, this.y, player.x, player.y);

        const canSeePlayer = hasLOS && distToPlayer <= this.sightDistance;
        if (this.level >= 4 && this.pendingNoise) {
            const noise = this.pendingNoise;
            this.pendingNoise = null;
            const noiseDistance = Math.hypot(noise.x - this.x, noise.y - this.y);
            const canInvestigateNoise = [
                MONSTER_STATES.PATROL,
                MONSTER_STATES.SEARCHING,
                MONSTER_STATES.SNIFFING,
                MONSTER_STATES.TRACKING
            ].includes(this.state);

            if (canInvestigateNoise && !canSeePlayer && noiseDistance <= this.hearingDistance) {
                this.targetPos = { x: noise.x, y: noise.y };
                this.path = maze.findPath(this.x, this.y, noise.x, noise.y);
                this.state = MONSTER_STATES.TRACKING;
                this.investigatingNoise = true;
                window.soundEngine.playMonsterGrowl();
                setWarning(`МОНСТР УСЛЫШАЛ ${noise.source.toUpperCase()} И ИДЁТ ПРОВЕРИТЬ ЗВУК!`, 2200);
            }
        }

        if (player.isHiding && !canSeePlayer &&
            (this.state === MONSTER_STATES.CHASE || this.state === MONSTER_STATES.CHARGING)) {
            this.state = MONSTER_STATES.SEARCHING;
            this.stateTimer = 3.0;
            this.path = [];
            this.targetPos = null;
        }

        // --- SENSORY CHECKS ---
        // 1. Sight Check (Level 2+)
        if ((this.level >= 2 || this.trapPaused) && hasLOS && distToPlayer <= this.sightDistance) {
            this.lastKnownPlayerPos = { x: player.x, y: player.y };

            if (this.level >= 4 && this.chargeCooldown <= 0 && this.state !== MONSTER_STATES.CHARGING) {
                this.startCharge(setWarning);
            } else if (this.state !== MONSTER_STATES.CHARGING) {
                if (this.state !== MONSTER_STATES.CHASE) {
                    window.soundEngine.playMonsterGrowl();
                    setWarning("⚠️ МОНСТР УВИДЕЛ ТЕБЯ!", 2000);
                }
                this.state = MONSTER_STATES.CHASE;
            }
        }

        // 2. Hearing Check (Level 4+)
        if (this.level >= 4 && (this.state === MONSTER_STATES.PATROL || this.state === MONSTER_STATES.SEARCHING)) {
            if (player.isSprinting && distToPlayer <= this.hearingDistance) {
                this.lastKnownPlayerPos = { x: player.x, y: player.y };
                this.state = MONSTER_STATES.CHASE;
                setWarning("⚠️ МОНСТР УСЛЫШАЛ ТОПОТ БЕГА!", 2000);
            }
        }

        // 3. Scent Check (Level 3+)
        if (this.level >= 3) {
            // If player is actively hiding in shadows, monster loses current scent tracking immediately
            if (player.isHiding && !this.investigatingNoise &&
                (this.state === MONSTER_STATES.TRACKING || this.state === MONSTER_STATES.SNIFFING)) {
                this.state = MONSTER_STATES.SEARCHING;
                this.stateTimer = 2.5;
                this.targetPos = null;
                this.path = [];
                setWarning("🌫️ ТЫ СКРЫЛСЯ В ТЕНЯХ: МОНСТР ПОТЕРЯЛ ТВОЙ СЛЕД!", 2400);
            }

            this.sniffCooldown -= dt;
            if (this.sniffCooldown <= 0 && this.state === MONSTER_STATES.PATROL) {
                this.performSniff(player, maze, particleSystem, setWarning);
            }
        }

        // 4. Teleport Check (Level 5+)
        if (this.level >= 5) {
            this.teleportCooldown -= dt;
            if (this.teleportCooldown <= 0 && !hasLOS && distToPlayer > 280) {
                this.performTeleport(player, maze, setWarning);
            }
        }

        // --- STATE MACHINE EXECUTION ---
        switch (this.state) {
            case MONSTER_STATES.PATROL:
                this.eyeColor = '#ff6600'; // Creepy Amber
                this.updatePatrol(dt, maze);
                break;

            case MONSTER_STATES.CHASE:
                this.eyeColor = '#ff0000'; // Blazing Blood Red
                this.currentSpeed = this.chaseSpeed + (this.level - 2) * 14;
                this.updateChase(dt, player, maze);
                break;

            case MONSTER_STATES.CHARGING:
                this.eyeColor = '#ffff00'; // Demonic Burning Core
                this.stateTimer -= dt;
                this.currentSpeed = this.chargeSpeed;
                this.updateDirectCharge(dt, player, maze);
                if (this.stateTimer <= 0) {
                    this.state = MONSTER_STATES.CHASE;
                    this.chargeCooldown = 7.5;
                }
                break;

            case MONSTER_STATES.SNIFFING:
                this.eyeColor = '#c724e6'; // Toxic purple scent vision
                this.stateTimer -= dt;
                if (this.stateTimer <= 0) {
                    if (this.targetPos) {
                        this.state = MONSTER_STATES.TRACKING;
                    } else {
                        this.state = MONSTER_STATES.PATROL;
                    }
                }
                break;

            case MONSTER_STATES.TRACKING:
                this.eyeColor = '#9400d3';
                this.currentSpeed = this.patrolSpeed * 1.4;
                this.updateTracking(dt, maze);
                break;

            case MONSTER_STATES.SEARCHING:
                this.eyeColor = '#ff5500';
                this.stateTimer -= dt;
                if (this.stateTimer <= 0) {
                    if (this.trapPaused) {
                        this.trapPaused = false;
                        this.state = this.level === 1 ? MONSTER_STATES.DORMANT : MONSTER_STATES.PATROL;
                        this.targetPos = null;
                        this.path = [];
                    } else {
                        this.state = MONSTER_STATES.PATROL;
                    }
                }
                break;
        }

        if (this.chargeCooldown > 0) this.chargeCooldown -= dt;
    }

    investigateTrap(trap) {
        this.trapQueue.push(trap);
    }

    reportNoise(x, y, source) {
        if (this.level < 4) return;
        this.pendingNoise = { x, y, source };
    }

    // --- Handlers ---
    updatePatrol(dt, maze) {
        if (!this.targetPos || this.path.length === 0) {
            this.pickRandomPatrolPoint(maze);
        }
        this.followPath(dt, maze, () => {
            this.pickRandomPatrolPoint(maze);
        });
    }

    pickRandomPatrolPoint(maze) {
        let attempts = 0;
        while (attempts < 20) {
            const gx = Math.floor(1 + Math.random() * (maze.cols - 2));
            const gy = Math.floor(1 + Math.random() * (maze.rows - 2));
            if (!maze.isWall(gx, gy)) {
                this.targetPos = {
                    x: (gx + 0.5) * maze.tileSize,
                    y: (gy + 0.5) * maze.tileSize
                };
                this.path = maze.findPath(this.x, this.y, this.targetPos.x, this.targetPos.y);
                break;
            }
            attempts++;
        }
    }

    updateChase(dt, player, maze) {
        const hasLOS = maze.hasLineOfSight(this.x, this.y, player.x, player.y);
        const canSeePlayer = hasLOS &&
            Math.hypot(player.x - this.x, player.y - this.y) <= this.sightDistance;
        const chaseTarget = this.trapPaused && !canSeePlayer && this.lastKnownPlayerPos
            ? this.lastKnownPlayerPos
            : player;

        if (this.trapPaused && canSeePlayer) {
            this.lastKnownPlayerPos = { x: player.x, y: player.y };
        }

        const now = performance.now();
        if (now - this.lastPathCalc > 220) {
            this.lastPathCalc = now;
            this.path = maze.findPath(this.x, this.y, chaseTarget.x, chaseTarget.y);
        }

        this.followPath(dt, maze);
        if (this.path.length === 0 && (this.trapPaused ? !canSeePlayer : !hasLOS)) {
            this.state = MONSTER_STATES.SEARCHING;
            this.stateTimer = 3.0;
        }
    }

    startCharge(setWarning) {
        this.state = MONSTER_STATES.CHARGING;
        this.stateTimer = this.chargeDuration;
        window.soundEngine.playMonsterGrowl();
        setWarning("💀 МОНСТР В ЯРОСТИ СОВЕРШАЕТ РЫВОК!", 2200);
    }

    updateDirectCharge(dt, player, maze) {
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const len = Math.hypot(dx, dy);
        if (len > 0) {
            this.angle = Math.atan2(dy, dx);
            const step = this.currentSpeed * maze.getSpikeSpeedMultiplier(this.x, this.y, this.radius) * dt;
            const stepX = (dx / len) * step;
            const stepY = (dy / len) * step;

            if (!maze.checkCollision(this.x + stepX, this.y, this.radius, 'monster')) {
                this.x += stepX;
            }
            if (!maze.checkCollision(this.x, this.y + stepY, this.radius, 'monster')) {
                this.y += stepY;
            }
        }
    }

    // --- Scent Tracking (Level 3 Ability) ---
    performSniff(player, maze, particleSystem, setWarning) {
        this.sniffCooldown = 7.5 + Math.random() * 3.5;
        this.state = MONSTER_STATES.SNIFFING;
        this.stateTimer = 1.6;
        window.soundEngine.playMonsterSniff();

        // If player is hiding in shadows, the monster completely fails to scent anything!
        if (player.isHiding) {
            this.targetPos = null;
            setWarning("🌫️ МОНСТР ПРИНЮХАЛСЯ, НО НЕ ЧУЕТ ТЕБЯ В ТЕНЯХ!", 2200);
            return;
        }

        let bestScent = null;
        let bestDist = Infinity;

        for (const scent of player.scentTrail) {
            const dist = Math.hypot(scent.x - this.x, scent.y - this.y);
            const maxDetect = scent.isCoal ? this.coalScentDetectDistance : this.scentDetectDistance;

            if (dist <= maxDetect) {
                const score = dist - (scent.isCoal ? 160 : 0);
                if (score < bestDist) {
                    bestDist = score;
                    bestScent = scent;
                }
            }
        }

        if (bestScent) {
            this.targetPos = { x: bestScent.x, y: bestScent.y };
            this.path = maze.findPath(this.x, this.y, bestScent.x, bestScent.y);
            setWarning(bestScent.isCoal ? "👃 МОНСТР ЧУЕТ ЗАПАХ УГЛЯ!" : "👃 МОНСТР УЧУЯЛ ТВОЙ СЛЕД!", 2200);
        } else {
            this.targetPos = null;
        }
    }

    updateTracking(dt, maze) {
        this.followPath(dt, maze, () => {
            this.state = MONSTER_STATES.SEARCHING;
            this.stateTimer = 2.0;
            this.investigatingNoise = false;
        });
    }

    // --- Teleportation (Level 5 Ability) ---
    performTeleport(player, maze, setWarning) {
        this.teleportCooldown = 13.0 + Math.random() * 4.0;

        const candidates = [];
        for (let dy = -5; dy <= 5; dy++) {
            for (let dx = -5; dx <= 5; dx++) {
                const gx = Math.floor(player.x / maze.tileSize) + dx;
                const gy = Math.floor(player.y / maze.tileSize) + dy;
                if (!maze.isWall(gx, gy)) {
                    const wx = (gx + 0.5) * maze.tileSize;
                    const wy = (gy + 0.5) * maze.tileSize;
                    const dist = Math.hypot(wx - player.x, wy - player.y);
                    if (dist >= 150 && dist <= 350) {
                        if (!maze.hasLineOfSight(wx, wy, player.x, player.y)) {
                            candidates.push({ x: wx, y: wy });
                        }
                    }
                }
            }
        }

        if (candidates.length > 0) {
            const spot = candidates[Math.floor(Math.random() * candidates.length)];
            this.x = spot.x;
            this.y = spot.y;
            this.path = [];
            this.state = MONSTER_STATES.SEARCHING;
            this.stateTimer = 1.4;

            window.soundEngine.playTeleport();
            setWarning("⚡ ТЬМА СОДРОГНУЛАСЬ... МОНСТР ТЕЛЕПОРТИРОВАЛСЯ!", 2400);

            if (this.level >= 6 && Math.random() < 0.65) {
                player.lanternFlickerTimer = 2.8;
                setWarning("🌑 МОНСТР ЗАДУЛ ТВОЙ ФАКЕЛ!", 2600);
            }
        }
    }

    followPath(dt, maze, onReached) {
        if (!this.path || this.path.length === 0) {
            if (onReached) onReached();
            return true;
        }

        const nextPoint = this.path[0];
        const dx = nextPoint.x - this.x;
        const dy = nextPoint.y - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 12) {
            this.path.shift();
            if (this.path.length === 0) {
                if (onReached) onReached();
                return true;
            }
        } else {
            this.angle = Math.atan2(dy, dx);
            const step = this.currentSpeed * maze.getSpikeSpeedMultiplier(this.x, this.y, this.radius) * dt;
            this.x += (dx / dist) * step;
            this.y += (dy / dist) * step;
        }
        return false;
    }

    // --- TERRIFYING ELDRITCH MONSTER RENDERING ---
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x + this.jitterX, this.y + this.jitterY);
        ctx.rotate(this.angle);

        const r = this.radius;
        const charging = this.state === MONSTER_STATES.CHARGING;

        const aura = ctx.createRadialGradient(r * 0.3, 0, r * 0.15, r * 0.3, 0, r * (charging ? 2.5 : 1.9));
        aura.addColorStop(0, charging ? 'rgba(255, 18, 0, 0.34)' : 'rgba(110, 0, 16, 0.2)');
        aura.addColorStop(1, 'rgba(28, 0, 10, 0)');
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(0, 0, r * (charging ? 2.5 : 1.9), 0, Math.PI * 2);
        ctx.fill();

        // 1. Long, twitching shadow tendrils
        ctx.lineCap = 'round';
        for (let i = 0; i < this.tentaclePhases.length; i++) {
            const phase = this.tentaclePhases[i];
            const baseAngle = Math.PI - 1.45 + (i * 0.58);
            const wave = Math.sin(phase) * r * 0.5;
            const tLen = r * (1.7 + Math.cos(phase * 0.7) * 0.28);
            ctx.strokeStyle = i % 2 === 0 ? '#09070d' : '#17070d';
            ctx.lineWidth = Math.max(2.5, r * 0.22);
            ctx.beginPath();
            ctx.moveTo(Math.cos(baseAngle) * (r * 0.7), Math.sin(baseAngle) * (r * 0.7));
            ctx.quadraticCurveTo(
                Math.cos(baseAngle) * (r * 1.2) + wave,
                Math.sin(baseAngle) * (r * 1.2) - wave,
                Math.cos(baseAngle) * tLen,
                Math.sin(baseAngle) * tLen
            );
            ctx.stroke();
        }

        // 2. Ragged shadow body
        const body = ctx.createRadialGradient(-r * 0.3, 0, r * 0.1, 0, 0, r * 1.25);
        body.addColorStop(0, '#21131d');
        body.addColorStop(0.55, '#09070d');
        body.addColorStop(1, '#020207');
        ctx.fillStyle = body;
        ctx.beginPath();
        for (let i = 0; i <= 16; i++) {
            const angle = (i / 16) * Math.PI * 2;
            const edge = r * (1 + Math.sin(angle * 5 + this.wobblePhase) * 0.1);
            const x = Math.cos(angle) * edge;
            const y = Math.sin(angle) * edge;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();

        // 3. Broken crown-like horns
        ctx.fillStyle = '#09060d';
        ctx.beginPath();
        ctx.moveTo(-r * 0.7, -r * 0.55);
        ctx.lineTo(-r * 1.15, -r * 1.65);
        ctx.lineTo(-r * 0.12, -r * 0.9);
        ctx.lineTo(r * 0.25, -r * 1.75);
        ctx.lineTo(r * 0.55, -r * 0.78);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-r * 0.7, r * 0.55);
        ctx.lineTo(-r * 1.15, r * 1.65);
        ctx.lineTo(-r * 0.12, r * 0.9);
        ctx.lineTo(r * 0.25, r * 1.75);
        ctx.lineTo(r * 0.55, r * 0.78);
        ctx.fill();

        // 4. Cracked bone mask
        const mask = ctx.createLinearGradient(0, -r * 0.7, r, r * 0.7);
        mask.addColorStop(0, '#ded0c4');
        mask.addColorStop(0.55, '#a99598');
        mask.addColorStop(1, '#55434d');
        ctx.fillStyle = mask;
        ctx.beginPath();
        ctx.moveTo(-r * 0.18, -r * 0.7);
        ctx.quadraticCurveTo(r * 0.65, -r * 0.85, r * 0.95, -r * 0.3);
        ctx.lineTo(r * 0.9, r * 0.24);
        ctx.quadraticCurveTo(r * 0.45, r * 0.82, -r * 0.16, r * 0.65);
        ctx.quadraticCurveTo(-r * 0.55, r * 0.12, -r * 0.18, -r * 0.7);
        ctx.closePath();
        ctx.fill();

        // Deep, asymmetrical eye sockets and a fractured brow
        ctx.fillStyle = '#10070d';
        ctx.beginPath();
        ctx.ellipse(r * 0.32, -r * 0.27, r * 0.18, r * 0.12, -0.3, 0, Math.PI * 2);
        ctx.ellipse(r * 0.32, r * 0.27, r * 0.18, r * 0.12, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#45333a';
        ctx.lineWidth = Math.max(1, r * 0.045);
        ctx.beginPath();
        ctx.moveTo(-r * 0.08, -r * 0.72);
        ctx.lineTo(r * 0.02, -r * 0.32);
        ctx.lineTo(-r * 0.1, -r * 0.12);
        ctx.lineTo(r * 0.02, r * 0.12);
        ctx.stroke();

        // Blood-red glow leaking from the eye sockets
        ctx.fillStyle = this.eyeColor;
        ctx.shadowBlur = charging ? r * 1.1 : r * 0.75;
        ctx.shadowColor = this.eyeColor;
        ctx.beginPath();
        ctx.ellipse(r * 0.34, -r * 0.27, r * 0.07, r * 0.055, -0.3, 0, Math.PI * 2);
        ctx.ellipse(r * 0.34, r * 0.27, r * 0.07, r * 0.055, 0.3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fill();
        ctx.shadowBlur = 0;

        // 5. Unhinged jaw lined with needle teeth
        const mawWidth = r * (0.12 + 0.25 * this.jawOpen);
        const mawHeight = r * (0.08 + 0.22 * this.jawOpen);
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(r * 0.56, 0, mawWidth, mawHeight, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#7e2430';
        ctx.lineWidth = Math.max(1, r * 0.05);
        ctx.beginPath();
        ctx.ellipse(r * 0.56, 0, mawWidth, mawHeight, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#e8d8c8';
        for (let i = 0; i < 7; i++) {
            const tx = -mawWidth * 0.8 + (i / 6) * mawWidth * 1.6;
            const tooth = Math.max(2, r * 0.11);
            ctx.beginPath();
            ctx.moveTo(r * 0.56 + tx - tooth * 0.45, -mawHeight * 0.72);
            ctx.lineTo(r * 0.56 + tx + tooth * 0.45, -mawHeight * 0.72);
            ctx.lineTo(r * 0.56 + tx, -mawHeight * 0.15);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(r * 0.56 + tx - tooth * 0.45, mawHeight * 0.72);
            ctx.lineTo(r * 0.56 + tx + tooth * 0.45, mawHeight * 0.72);
            ctx.lineTo(r * 0.56 + tx, mawHeight * 0.15);
            ctx.fill();
        }

        ctx.restore();
    }
}

window.Monster = Monster;
window.MONSTER_STATES = MONSTER_STATES;
