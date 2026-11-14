// Particle Effects System (Volumetric Fog, Blood, Scent, Embers, Darkness Smoke)

class Particle {
    constructor(x, y, vx, vy, size, color, life, decay, type = 'ember') {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.size = size;
        this.color = color;
        this.maxLife = life;
        this.life = life;
        this.decay = decay;
        this.type = type; // 'ember', 'smoke', 'scent', 'shadow', 'spark', 'fog', 'blood'
        this.rotation = Math.random() * Math.PI * 2;
        this.rotSpeed = (Math.random() - 0.5) * 1.5;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= this.decay * dt;
        this.rotation += this.rotSpeed * dt;

        if (this.type === 'smoke' || this.type === 'scent' || this.type === 'fog') {
            this.size += 5 * dt;
            this.vx *= 0.96;
            this.vy *= 0.96;
        } else if (this.type === 'ember') {
            this.vy -= 14 * dt;
        } else if (this.type === 'blood') {
            this.vy += 35 * dt; // gravity drip
            this.vx *= 0.9;
        }
    }

    draw(ctx) {
        if (this.life <= 0) return;
        const alpha = Math.max(0, this.life / this.maxLife);

        ctx.save();
        ctx.globalAlpha = alpha;

        if (this.type === 'fog') {
            // Eerie volumetric ground fog
            ctx.fillStyle = 'rgba(40, 25, 55, 0.28)';
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#1d0b2e';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'scent') {
            ctx.fillStyle = this.color;
            ctx.shadowBlur = 10;
            ctx.shadowColor = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'shadow') {
            ctx.fillStyle = '#06010a';
            ctx.shadowBlur = 14;
            ctx.shadowColor = '#3a0055';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'blood') {
            ctx.fillStyle = '#8a0303';
            ctx.shadowBlur = 6;
            ctx.shadowColor = '#ff0000';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}

class ParticleSystem {
    constructor() {
        this.particles = [];
    }

    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.update(dt);
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    draw(ctx) {
        for (const p of this.particles) {
            p.draw(ctx);
        }
    }

    // Furnace flames & rising embers
    emitFurnace(x, y, w, h) {
        if (Math.random() < 0.45) {
            const px = x + Math.random() * w;
            const py = y + h - Math.random() * 10;
            const vx = (Math.random() - 0.5) * 35;
            const vy = -35 - Math.random() * 55;
            const size = 1.5 + Math.random() * 2.5;
            const colors = ['#ffcc00', '#ff5500', '#ff2200', '#ffee99'];
            const color = colors[Math.floor(Math.random() * colors.length)];
            this.particles.push(new Particle(px, py, vx, vy, size, color, 1.2, 1, 'ember'));
        }

        if (Math.random() < 0.25) {
            const px = x + w / 2 + (Math.random() - 0.5) * 25;
            const py = y + 10;
            const vx = (Math.random() - 0.5) * 18;
            const vy = -22 - Math.random() * 25;
            const size = 5 + Math.random() * 6;
            this.particles.push(new Particle(px, py, vx, vy, size, '#2e1818', 1.8, 0.7, 'smoke'));
        }
    }

    // Scent trail
    emitScent(x, y, isCarryingCoal) {
        const color = isCarryingCoal ? '#d033ff' : '#7b1fa2';
        const size = isCarryingCoal ? 7 : 4.5;
        const vx = (Math.random() - 0.5) * 10;
        const vy = (Math.random() - 0.5) * 10;
        this.particles.push(new Particle(x, y, vx, vy, size, color, isCarryingCoal ? 4.0 : 2.5, 0.6, 'scent'));
    }

    // Volumetric creeping fog drifting in corridors
    emitFog(camX, camY, viewWidth, viewHeight) {
        if (this.particles.filter(p => p.type === 'fog').length > 55) return;
        if (Math.random() < 0.4) {
            const px = camX + Math.random() * viewWidth;
            const py = camY + Math.random() * viewHeight;
            const vx = 6 + Math.random() * 12; // slow creeping draft
            const vy = (Math.random() - 0.5) * 6;
            const size = 30 + Math.random() * 35;
            this.particles.push(new Particle(px, py, vx, vy, size, 'rgba(40,25,55,0.25)', 6.0, 0.4, 'fog'));
        }
    }

    // Shadow veil mist when player is hiding in shadows (Ctrl)
    emitShadowVeil(x, y) {
        if (Math.random() < 0.4) {
            const px = x + (Math.random() - 0.5) * 18;
            const py = y + (Math.random() - 0.5) * 18;
            const vx = (Math.random() - 0.5) * 8;
            const vy = -4 - Math.random() * 8;
            const size = 3.5 + Math.random() * 4.5;
            this.particles.push(new Particle(px, py, vx, vy, size, '#150524', 0.85, 1.2, 'shadow'));
        }
    }

    // Portal continuous arcane wisps
    emitPortalIdle(x, y, color) {
        if (Math.random() < 0.35) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 18;
            const px = x + Math.cos(angle) * dist;
            const py = y + Math.sin(angle) * dist;
            const vx = -Math.sin(angle) * 16;
            const vy = -12 - Math.random() * 16;
            const size = 1.6 + Math.random() * 2.2;
            this.particles.push(new Particle(px, py, vx, vy, size, color, 1.1, 1.0, 'spark'));
        }
    }

    // Portal instantaneous warp explosion
    emitPortalWarp(x, y, color) {
        for (let i = 0; i < 48; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 40 + Math.random() * 160;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const size = 2 + Math.random() * 3.5;
            const colors = [color, '#ffffff', '#e0b0ff', '#80ffff'];
            const c = colors[Math.floor(Math.random() * colors.length)];
            this.particles.push(new Particle(x, y, vx, vy, size, c, 1.3, 0.9, 'spark'));
        }
    }

    // Monster eldritch shadow aura and dripping blood
    emitMonsterAura(x, y, isChasing) {
        // Dark tendril smoke
        const count = isChasing ? 2 : 1;
        for (let i = 0; i < count; i++) {
            const px = x + (Math.random() - 0.5) * 30;
            const py = y + (Math.random() - 0.5) * 30;
            const vx = (Math.random() - 0.5) * 20;
            const vy = -10 - Math.random() * 15;
            const size = 5 + Math.random() * 7;
            this.particles.push(new Particle(px, py, vx, vy, size, '#06010a', 1.1, 1.0, 'shadow'));
        }

        // Dripping cursed blood
        if (isChasing && Math.random() < 0.3) {
            const px = x + (Math.random() - 0.5) * 20;
            const py = y + (Math.random() - 0.5) * 10;
            this.particles.push(new Particle(px, py, (Math.random() - 0.5) * 10, 15, 2.5, '#7a0000', 1.4, 0.9, 'blood'));
        }
    }

    // Level up explosion
    emitLevelExplosion(x, y) {
        for (let i = 0; i < 75; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 70 + Math.random() * 180;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const size = 2 + Math.random() * 3.5;
            const colors = ['#ff9900', '#ff3300', '#ffea00', '#d600ff', '#ffffff'];
            const color = colors[Math.floor(Math.random() * colors.length)];
            this.particles.push(new Particle(x, y, vx, vy, size, color, 1.6, 0.8, 'spark'));
        }
    }
}

window.ParticleSystem = ParticleSystem;
