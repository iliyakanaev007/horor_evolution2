// Maze Generator, Collision & Pathfinding Engine

class Maze {
    constructor(cols, rows, tileSize = 48) {
        this.cols = cols;
        this.rows = rows;
        this.tileSize = tileSize;
        this.grid = []; // 0: floor, 1: wall
        this.furnacePos = { x: 0, y: 0, w: 2, h: 2 }; // grid coords
        this.rooms = []; // [{ id, rx, ry, w: 3, h: 3, cx, cy, type: 'coal'|'teleport'|'upgrade' }]
        this.coalNodes = []; // {x, y, active: true, roomId} in grid coords
        this.upgradeNodes = []; // {x, y, active: true, roomId} in grid coords
        this.teleports = []; // [{ id, roomId, x, y, worldX, worldY, targetIndex, color, glow, name, pairId }]
        this.traps = []; // {x, y, worldX, worldY, armed, owner, claimProgress, capturedByPlayer}
        this.jackOLanterns = []; // {x, y, flickerPhase: float}
        this.wallLanterns = []; // {x, y, wallX, wallY, flickerPhase}
        this.props = []; // decorative {x, y, type: 'skull'|'web'}
    }

    generate(coalCount = 4, upgradeCount = 1, portalCount = this.cols >= 27 ? 4 : 2) {
        // Initialize grid full of walls
        this.grid = [];
        for (let y = 0; y < this.rows; y++) {
            this.grid[y] = [];
            for (let x = 0; x < this.cols; x++) {
                this.grid[y][x] = 1;
            }
        }

        // Center room for the Furnace
        const midX = Math.floor(this.cols / 2);
        const midY = Math.floor(this.rows / 2);
        this.furnacePos = { x: midX - 1, y: midY - 1, w: 2, h: 2 };

        // Clear 3x3 room around furnace
        for (let dy = -1; dy <= 2; dy++) {
            for (let dx = -1; dx <= 2; dx++) {
                const gx = midX + dx;
                const gy = midY + dy;
                if (gx >= 0 && gx < this.cols && gy >= 0 && gy < this.rows) {
                    this.grid[gy][gx] = 0;
                }
            }
        }

        // Recursive backtracker maze carving starting around furnace room
        const startX = midX > 2 ? midX - 2 : 1;
        const startY = midY > 2 ? midY - 2 : 1;
        this.carvePassages(1, 1);

        // Ensure furnace room connects to surrounding maze
        this.grid[midY - 2][midX] = 0;
        this.grid[midY + 2][midX] = 0;
        this.grid[midY][midX - 2] = 0;
        this.grid[midY][midX + 2] = 0;

        // Braid maze (remove random walls to create loops and avoid dead-end traps)
        for (let y = 2; y < this.rows - 2; y++) {
            for (let x = 2; x < this.cols - 2; x++) {
                if (this.grid[y][x] === 1) {
                    // Check if it separates two open paths
                    const horiz = this.grid[y][x - 1] === 0 && this.grid[y][x + 1] === 0;
                    const vert = this.grid[y - 1][x] === 0 && this.grid[y + 1][x] === 0;
                    if ((horiz || vert) && Math.random() < 0.16) {
                        this.grid[y][x] = 0;
                    }
                }
            }
        }

        // Generate small rooms (coal will ONLY spawn in these rooms, and some rooms get teleports instead!)
        this.generateRoomsAndContents(coalCount, upgradeCount, portalCount);

        // Borders must remain walls
        for (let x = 0; x < this.cols; x++) {
            this.grid[0][x] = 1;
            this.grid[this.rows - 1][x] = 1;
        }
        for (let y = 0; y < this.rows; y++) {
            this.grid[y][0] = 1;
            this.grid[y][this.cols - 1] = 1;
        }

        this.generateTraps(Math.max(3, Math.floor(this.cols / 9)));

        // Place Jack-o'-lanterns & Props (avoiding coal and teleport centers)
        this.spawnDecorations();
    }

    generateTraps(count) {
        this.traps = [];
        const furnaceCenter = {
            x: this.furnacePos.x + this.furnacePos.w / 2,
            y: this.furnacePos.y + this.furnacePos.h / 2
        };
        const candidates = [];

        for (let y = 1; y < this.rows - 1; y++) {
            for (let x = 1; x < this.cols - 1; x++) {
                if (this.grid[y][x] !== 0 || this.isRoomFloor(x, y)) continue;
                if (Math.hypot(x + 0.5 - furnaceCenter.x, y + 0.5 - furnaceCenter.y) < 5) continue;
                candidates.push({ x, y });
            }
        }

        candidates.sort(() => Math.random() - 0.5);
        for (const candidate of candidates) {
            if (this.traps.length >= count) break;
            const spacedOut = this.traps.every(trap =>
                Math.hypot(candidate.x - trap.x, candidate.y - trap.y) >= 4
            );
            if (spacedOut) {
                this.traps.push({
                    ...candidate,
                    worldX: (candidate.x + 0.5) * this.tileSize,
                    worldY: (candidate.y + 0.5) * this.tileSize,
                    armed: true,
                    owner: 'monster',
                    claimProgress: 0,
                    capturedByPlayer: false
                });
            }
        }
    }

    carvePassages(cx, cy) {
        this.grid[cy][cx] = 0;

        const dirs = [
            [0, -2], // North
            [2, 0],  // East
            [0, 2],  // South
            [-2, 0]  // West
        ].sort(() => Math.random() - 0.5);

        for (const [dx, dy] of dirs) {
            const nx = cx + dx;
            const ny = cy + dy;

            if (nx > 0 && nx < this.cols - 1 && ny > 0 && ny < this.rows - 1) {
                if (this.grid[ny][nx] === 1) {
                    this.grid[cy + dy / 2][cx + dx / 2] = 0;
                    this.carvePassages(nx, ny);
                }
            }
        }
    }

    generateRoomsAndContents(coalCount, upgradeCount = 1, portalCount = this.cols >= 27 ? 4 : 2) {
        this.rooms = [];
        this.coalNodes = [];
        this.upgradeNodes = [];
        this.teleports = [];

        const totalRoomsNeeded = coalCount + portalCount + upgradeCount;

        const furnaceCenter = {
            x: this.furnacePos.x + this.furnacePos.w / 2,
            y: this.furnacePos.y + this.furnacePos.h / 2
        };

        // Find candidate odd coordinates (rx, ry) for 3x3 rooms
        const candidates = [];
        for (let ry = 1; ry <= this.rows - 4; ry += 2) {
            for (let rx = 1; rx <= this.cols - 4; rx += 2) {
                const cx = rx + 1;
                const cy = ry + 1;
                const distFurnace = Math.hypot(cx - furnaceCenter.x, cy - furnaceCenter.y);
                // Keep rooms at least 4.5 tiles away from the central furnace
                if (distFurnace >= 4.5) {
                    candidates.push({ rx, ry, cx, cy, distFurnace });
                }
            }
        }

        // Shuffle candidates
        candidates.sort(() => Math.random() - 0.5);

        // Select rooms ensuring they don't overlap with each other
        const chosen = [];
        for (const cand of candidates) {
            if (chosen.length >= totalRoomsNeeded) break;
            const overlap = chosen.some(r => Math.abs(cand.cx - r.cx) < 4 && Math.abs(cand.cy - r.cy) < 4);
            if (!overlap) {
                chosen.push(cand);
            }
        }

        // Relax buffer if needed
        if (chosen.length < totalRoomsNeeded) {
            for (const cand of candidates) {
                if (chosen.length >= totalRoomsNeeded) break;
                const overlap = chosen.some(r => Math.abs(cand.cx - r.cx) < 3 && Math.abs(cand.cy - r.cy) < 3);
                if (!overlap && !chosen.includes(cand)) {
                    chosen.push(cand);
                }
            }
        }

        // Carve all chosen 3x3 rooms into floor tiles
        chosen.forEach((cand, idx) => {
            for (let dy = 0; dy < 3; dy++) {
                for (let dx = 0; dx < 3; dx++) {
                    this.grid[cand.ry + dy][cand.rx + dx] = 0;
                }
            }

            this.rooms.push({
                id: idx,
                rx: cand.rx,
                ry: cand.ry,
                w: 3,
                h: 3,
                cx: cand.cx,
                cy: cand.cy,
                worldX: (cand.cx + 0.5) * this.tileSize,
                worldY: (cand.cy + 0.5) * this.tileSize,
                type: 'coal'
            });
        });

        // Shuffle rooms before distributing contents
        const shuffledRooms = [...this.rooms].sort(() => Math.random() - 0.5);

        // First coalCount rooms get COAL
        for (let i = 0; i < coalCount && i < shuffledRooms.length; i++) {
            const room = shuffledRooms[i];
            room.type = 'coal';
            this.coalNodes.push({
                x: room.cx,
                y: room.cy,
                active: true,
                floatOffset: Math.random() * Math.PI * 2,
                roomId: room.id
            });
        }

        for (let i = 0; i < upgradeCount && coalCount + i < shuffledRooms.length; i++) {
            const upgradeRoom = shuffledRooms[coalCount + i];
            upgradeRoom.type = 'upgrade';
            this.upgradeNodes.push({
                x: upgradeRoom.cx,
                y: upgradeRoom.cy,
                active: true,
                roomId: upgradeRoom.id
            });
        }

        // Remaining rooms get TELEPORTS (paired up)
        const teleportRooms = shuffledRooms.slice(coalCount + upgradeCount);
        const pairsCount = Math.floor(teleportRooms.length / 2);

        const portalStyles = [
            { color: '#b545ff', glow: '#9400d3', name: 'ФИОЛЕТОВЫЙ ПОРТАЛ' },
            { color: '#00e5ff', glow: '#0088cc', name: 'ЛАЗУРНЫЙ ПОРТАЛ' }
        ];

        for (let p = 0; p < pairsCount; p++) {
            const roomA = teleportRooms[p * 2];
            const roomB = teleportRooms[p * 2 + 1];
            if (!roomA || !roomB) break;

            roomA.type = 'teleport';
            roomB.type = 'teleport';

            const style = portalStyles[p % portalStyles.length];
            const idxA = this.teleports.length;
            const idxB = idxA + 1;

            this.teleports.push({
                id: idxA,
                roomId: roomA.id,
                x: roomA.cx,
                y: roomA.cy,
                worldX: (roomA.cx + 0.5) * this.tileSize,
                worldY: (roomA.cy + 0.5) * this.tileSize,
                targetIndex: idxB,
                color: style.color,
                glow: style.glow,
                name: style.name,
                pairId: p
            });

            this.teleports.push({
                id: idxB,
                roomId: roomB.id,
                x: roomB.cx,
                y: roomB.cy,
                worldX: (roomB.cx + 0.5) * this.tileSize,
                worldY: (roomB.cy + 0.5) * this.tileSize,
                targetIndex: idxA,
                color: style.color,
                glow: style.glow,
                name: style.name,
                pairId: p
            });
        }

        if (teleportRooms.length % 2 === 1 && this.teleports.length > 0) {
            const room = teleportRooms[teleportRooms.length - 1];
            const portalId = this.teleports.length;
            const style = portalStyles[pairsCount % portalStyles.length];
            room.type = 'teleport';
            this.teleports[0].targetIndex = portalId;
            this.teleports.push({
                id: portalId,
                roomId: room.id,
                x: room.cx,
                y: room.cy,
                worldX: (room.cx + 0.5) * this.tileSize,
                worldY: (room.cy + 0.5) * this.tileSize,
                targetIndex: 0,
                color: style.color,
                glow: style.glow,
                name: style.name,
                pairId: pairsCount
            });
        }
    }

    isRoomFloor(gx, gy) {
        for (let i = 0; i < this.rooms.length; i++) {
            const r = this.rooms[i];
            if (gx >= r.rx && gx < r.rx + r.w && gy >= r.ry && gy < r.ry + r.h) {
                return r;
            }
        }
        return null;
    }

    spawnDecorations() {
        this.jackOLanterns = [];
        this.wallLanterns = [];
        this.props = [];
        for (let y = 1; y < this.rows - 1; y++) {
            for (let x = 1; x < this.cols - 1; x++) {
                if (this.grid[y][x] === 0) {
                    // Do not spawn decorations on coal nodes or teleports
                    if (this.coalNodes.some(c => c.x === x && c.y === y)) continue;
                    if (this.upgradeNodes.some(u => u.x === x && u.y === y)) continue;
                    if (this.teleports.some(t => t.x === x && t.y === y)) continue;

                    // Check if adjacent to a wall
                    const nearWall = (this.grid[y-1][x] === 1 || this.grid[y+1][x] === 1 || 
                                      this.grid[y][x-1] === 1 || this.grid[y][x+1] === 1);
                    if (nearWall) {
                        const rand = Math.random();
                        if (rand < 0.04) {
                            const tooCloseToTorch = this.wallLanterns.some(torch =>
                                Math.hypot(x - torch.x, y - torch.y) < 7
                            );
                            if (!tooCloseToTorch) {
                                const adjacentWalls = [
                                    [0, -1], [1, 0], [0, 1], [-1, 0]
                                ].filter(([dx, dy]) => this.grid[y + dy][x + dx] === 1);
                                const [wallX, wallY] = adjacentWalls[Math.floor(Math.random() * adjacentWalls.length)];
                                this.wallLanterns.push({
                                    x,
                                    y,
                                    wallX,
                                    wallY,
                                    flickerPhase: Math.random() * 10
                                });
                            }
                        } else if (rand < 0.08) {
                            this.jackOLanterns.push({
                                x: x,
                                y: y,
                                flickerPhase: Math.random() * 10
                            });
                        } else if (rand < 0.20) {
                            const pTypes = ['skull', 'web', 'blood_stain', 'wall_eyes'];
                            this.props.push({
                                x: x,
                                y: y,
                                type: pTypes[Math.floor(Math.random() * pTypes.length)],
                                blinkTimer: Math.random() * 5
                            });
                        }
                    }
                }
            }
        }
    }

    isWall(gx, gy) {
        if (gx < 0 || gx >= this.cols || gy < 0 || gy >= this.rows) return true;
        // Check if inside the solid furnace core
        if (gx >= this.furnacePos.x && gx < this.furnacePos.x + this.furnacePos.w &&
            gy >= this.furnacePos.y && gy < this.furnacePos.y + this.furnacePos.h) {
            return true;
        }
        return this.grid[gy][gx] === 1;
    }

    // Circle vs wall collision
    checkCollision(x, y, radius) {
        const minGx = Math.floor((x - radius) / this.tileSize);
        const maxGx = Math.floor((x + radius) / this.tileSize);
        const minGy = Math.floor((y - radius) / this.tileSize);
        const maxGy = Math.floor((y + radius) / this.tileSize);

        for (let gy = minGy; gy <= maxGy; gy++) {
            for (let gx = minGx; gx <= maxGx; gx++) {
                if (this.isWall(gx, gy)) {
                    // Closest point on tile to circle
                    const tileLeft = gx * this.tileSize;
                    const tileRight = tileLeft + this.tileSize;
                    const tileTop = gy * this.tileSize;
                    const tileBottom = tileTop + this.tileSize;

                    const closestX = Math.max(tileLeft, Math.min(x, tileRight));
                    const closestY = Math.max(tileTop, Math.min(y, tileBottom));

                    const distX = x - closestX;
                    const distY = y - closestY;
                    if ((distX * distX + distY * distY) < (radius * radius)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // Line of sight raycasting between world points
    hasLineOfSight(x0, y0, x1, y1) {
        let gx0 = Math.floor(x0 / this.tileSize);
        let gy0 = Math.floor(y0 / this.tileSize);
        const gx1 = Math.floor(x1 / this.tileSize);
        const gy1 = Math.floor(y1 / this.tileSize);

        const dx = Math.abs(gx1 - gx0);
        const dy = Math.abs(gy1 - gy0);
        const sx = gx0 < gx1 ? 1 : -1;
        const sy = gy0 < gy1 ? 1 : -1;
        let err = dx - dy;

        while (true) {
            if (this.isWall(gx0, gy0)) return false;
            if (gx0 === gx1 && gy0 === gy1) break;

            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                gx0 += sx;
            }
            if (e2 < dx) {
                err += dx;
                gy0 += sy;
            }
        }
        return true;
    }

    // BFS Pathfinding on Grid from (fromX, fromY) to (toX, toY)
    findPath(fromX, fromY, toX, toY) {
        const startGx = Math.floor(fromX / this.tileSize);
        const startGy = Math.floor(fromY / this.tileSize);
        const targetGx = Math.floor(toX / this.tileSize);
        const targetGy = Math.floor(toY / this.tileSize);

        if (startGx === targetGx && startGy === targetGy) return [];
        if (this.isWall(targetGx, targetGy)) return [];

        const queue = [{ x: startGx, y: startGy }];
        const visited = new Set([`${startGx},${startGy}`]);
        const parentMap = new Map();

        const dirs = [
            { x: 0, y: -1 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
            { x: -1, y: 0 }
        ];

        let found = false;
        while (queue.length > 0) {
            const curr = queue.shift();
            if (curr.x === targetGx && curr.y === targetGy) {
                found = true;
                break;
            }

            for (const d of dirs) {
                const nx = curr.x + d.x;
                const ny = curr.y + d.y;
                const key = `${nx},${ny}`;

                if (nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows && !visited.has(key)) {
                    if (!this.isWall(nx, ny)) {
                        visited.add(key);
                        parentMap.set(key, curr);
                        queue.push({ x: nx, y: ny });
                    }
                }
            }
        }

        if (!found) return [];

        // Reconstruct path
        const path = [];
        let currKey = `${targetGx},${targetGy}`;
        while (currKey !== `${startGx},${startGy}`) {
            const parts = currKey.split(',').map(Number);
            path.unshift({
                x: (parts[0] + 0.5) * this.tileSize,
                y: (parts[1] + 0.5) * this.tileSize
            });
            const p = parentMap.get(currKey);
            currKey = `${p.x},${p.y}`;
        }
        return path;
    }

    // Get furthest floor point from furnace for monster spawn
    getMonsterSpawn() {
        const furnaceCenter = {
            x: this.furnacePos.x + this.furnacePos.w / 2,
            y: this.furnacePos.y + this.furnacePos.h / 2
        };

        let bestTile = { x: 1, y: 1 };
        let maxDist = -1;

        for (let y = 1; y < this.rows - 1; y++) {
            for (let x = 1; x < this.cols - 1; x++) {
                if (this.grid[y][x] === 0) {
                    const dist = Math.hypot(x - furnaceCenter.x, y - furnaceCenter.y);
                    if (dist > maxDist) {
                        maxDist = dist;
                        bestTile = { x, y };
                    }
                }
            }
        }

        return {
            x: (bestTile.x + 0.5) * this.tileSize,
            y: (bestTile.y + 0.5) * this.tileSize
        };
    }
}

window.Maze = Maze;
