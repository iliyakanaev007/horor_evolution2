// Player Controller & Scent Trail System

class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 14;
        this.angle = 0; // facing direction in radians
        
        // Speeds
        this.baseSpeed = 150;
        this.sprintSpeed = 240;
        this.stealthSpeed = 70; // Slow crawling in shadows
        this.speed = this.baseSpeed;
        
        // Stealth / Shadow Hiding (Ctrl)
        this.isHiding = false;
        this.wasHiding = false;
        this.shadowExhausted = false;
        this.shadowAlpha = 1.0;

        // Teleport cooldown
        this.teleportCooldown = 0;

        // Stamina
        this.maxStamina = 100;
        this.stamina = 100;
        this.isSprinting = false;
        
        // Inventory
        this.coalCount = 0;
        this.pocketUpgradeCount = 0;
        
        // Lantern
        this.lanternRadius = 140;
        this.lanternBeamDist = 290;
        this.lanternAngleSpread = Math.PI / 3.2; // ~56 degrees
        this.lanternActive = true;
        this.lanternFlickerTimer = 0;
        // Scent Trail for Monster's Smell Mechanic
        this.scentTrail = []; // [{x, y, age, isCoal}]
        this.lastScentTime = 0;
        this.footstepDistAccumulator = 0;
    }

    reset(x, y) {
        this.x = x;
        this.y = y;
        this.stamina = this.maxStamina;
        this.coalCount = 0;
        this.pocketUpgradeCount = 0;
        this.scentTrail = [];
        this.lanternActive = true;
        this.lanternFlickerTimer = 0;
        this.isHiding = false;
        this.wasHiding = false;
        this.shadowExhausted = false;
        this.shadowAlpha = 1.0;
        this.teleportCooldown = 0;
    }

    update(dt, keys, mouseWorldPos, maze, particleSystem) {
        if (this.teleportCooldown > 0) {
            this.teleportCooldown -= dt;
        }

        // Handle lantern temporary blackout (e.g. from monster scream/teleport)
        if (this.lanternFlickerTimer > 0) {
            this.lanternFlickerTimer -= dt;
            this.lanternActive = this.lanternFlickerTimer <= 0;
        }

        // Mouse aiming
        const dx = mouseWorldPos.x - this.x;
        const dy = mouseWorldPos.y - this.y;
        this.angle = Math.atan2(dy, dx);

        // Shadow hiding input is normalized by the game engine from the saved key bindings.
        const wantsHide = Boolean(keys.hide);
        if (!wantsHide) {
            this.shadowExhausted = false;
        }
        this.isHiding = wantsHide && !this.shadowExhausted && this.stamina > 0;

        if (this.isHiding !== this.wasHiding) {
            this.wasHiding = this.isHiding;
            if (window.soundEngine && window.soundEngine.playShadowCloak) {
                window.soundEngine.playShadowCloak(this.isHiding);
            }
        }

        // Movement input
        let moveX = 0;
        let moveY = 0;

        if (keys.moveUp) moveY -= 1;
        if (keys.moveDown) moveY += 1;
        if (keys.moveLeft) moveX -= 1;
        if (keys.moveRight) moveX += 1;

        const isMoving = moveX !== 0 || moveY !== 0;

        // Sprinting vs Stealth Speed
        if (this.isHiding) {
            // Hiding in shadows: slowed down, sprint disabled
            this.isSprinting = false;
            this.speed = this.stealthSpeed;
            this.stamina = Math.max(0, this.stamina - this.maxStamina * 0.33 * dt);
            if (this.stamina === 0) {
                this.shadowExhausted = true;
                this.isHiding = false;
                this.wasHiding = false;
                this.speed = this.baseSpeed;
                if (window.soundEngine && window.soundEngine.playShadowCloak) {
                    window.soundEngine.playShadowCloak(false);
                }
            }
        } else {
            // Normal movement & sprint
            const wantsSprint = keys.sprint && isMoving;
            const canSprint = this.isSprinting ? this.stamina > 0 : this.stamina > 5;
            if (wantsSprint && canSprint) {
                this.isSprinting = true;
                this.stamina = Math.max(0, this.stamina - 30 * dt);
                this.speed = this.sprintSpeed;
                if (this.stamina === 0) {
                    this.isSprinting = false;
                    this.speed = this.baseSpeed;
                }
            } else {
                this.isSprinting = false;
                this.speed = this.baseSpeed;
                // Regenerate stamina
                this.stamina = Math.min(this.maxStamina, this.stamina + 22 * dt);
            }
        }

        // Slight speed penalty when carrying heavy coal
        if (this.coalCount > 0) {
            this.speed *= 0.88;
        }

        // Apply movement with wall collision & sliding
        if (isMoving) {
            const len = Math.hypot(moveX, moveY);
            const stepX = (moveX / len) * this.speed * dt;
            const stepY = (moveY / len) * this.speed * dt;

            // Try X movement
            if (!maze.checkCollision(this.x + stepX, this.y, this.radius)) {
                this.x += stepX;
            }
            // Try Y movement
            if (!maze.checkCollision(this.x, this.y + stepY, this.radius)) {
                this.y += stepY;
            }

            // Footstep sounds & Shadow particles
            const distMoved = Math.hypot(stepX, stepY);
            if (this.isHiding) {
                // Footsteps are completely silent in shadow mode!
                this.footstepDistAccumulator = 0;
                particleSystem.emitShadowVeil(this.x, this.y);
            } else {
                this.footstepDistAccumulator += distMoved;
                const stepInterval = this.isSprinting ? 28 : 38;
                if (this.footstepDistAccumulator >= stepInterval) {
                    this.footstepDistAccumulator = 0;
                    window.soundEngine.playFootstep(this.isSprinting);
                }
            }
        } else if (this.isHiding) {
            // Idle shadow veil
            particleSystem.emitShadowVeil(this.x, this.y);
        }

        // Generate Scent Trail (DOES NOT generate when hiding in shadows!)
        const now = performance.now();
        const scentInterval = this.isSprinting ? 220 : (this.coalCount > 0 ? 280 : 400); // ms
        if (!this.isHiding && isMoving && (now - this.lastScentTime > scentInterval)) {
            this.lastScentTime = now;
            this.scentTrail.push({
                x: this.x,
                y: this.y,
                age: 0,
                isCoal: this.coalCount > 0
            });
            // Visual particles for scent
            particleSystem.emitScent(this.x, this.y, this.coalCount > 0);
        }

        // Age scent trail & remove old scents (> 12 seconds normally, 4x faster dissipation in shadows)
        const ageMultiplier = this.isHiding ? 4.0 : 1.0;
        for (let i = this.scentTrail.length - 1; i >= 0; i--) {
            this.scentTrail[i].age += dt * ageMultiplier;
            if (this.scentTrail[i].age > 12) {
                this.scentTrail.splice(i, 1);
            }
        }
    }

    draw(ctx) {
        // Smooth shadow alpha transition
        const targetAlpha = this.isHiding ? 0.52 : 1.0;
        this.shadowAlpha += (targetAlpha - this.shadowAlpha) * 0.15;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Shadow Shroud Aura when hiding
        if (this.isHiding) {
            ctx.fillStyle = 'rgba(10, 2, 18, 0.75)';
            ctx.shadowBlur = 18;
            ctx.shadowColor = '#6a0dad';
            ctx.beginPath();
            ctx.arc(0, 0, this.radius * 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        ctx.globalAlpha = this.shadowAlpha;

        // Player body (Detective / Hunter in trenchcoat)
        // Shadow underneath
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.ellipse(0, 2, this.radius * 1.1, this.radius * 0.9, 0, 0, Math.PI * 2);
        ctx.fill();

        // Cloak / Jacket
        ctx.fillStyle = '#2c221e';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Shoulders / Hat rim
        ctx.fillStyle = '#1c1512';
        ctx.beginPath();
        ctx.arc(-2, 0, this.radius * 0.85, 0, Math.PI * 2);
        ctx.fill();

        // Hat
        ctx.fillStyle = '#4a2f18';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.55, 0, Math.PI * 2);
        ctx.fill();

        // Lantern in right hand
        ctx.fillStyle = '#b8860b';
        ctx.fillRect(this.radius * 0.6, 6, 8, 10);
        
        // Glowing lantern core
        if (this.lanternActive) {
            ctx.fillStyle = '#fff4b8';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ffa500';
            ctx.fillRect(this.radius * 0.6 + 2, 8, 4, 6);
        }

        // Draw carried coal pieces
        for (let i = 0; i < this.coalCount; i++) {
            const coalY = -8 - i * 7;
            ctx.shadowBlur = 6;
            ctx.shadowColor = '#ff4500';
            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath();
            ctx.arc(this.radius * 0.7, coalY, Math.max(4, 6 - i), 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#ff5500';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(this.radius * 0.7 - 2, coalY - 2);
            ctx.lineTo(this.radius * 0.7 + 2, coalY + 2);
            ctx.stroke();
        }

        ctx.restore();
    }
}

window.Player = Player;
