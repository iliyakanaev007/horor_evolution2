// Main Game Engine, Atmospheric FX, Dynamic Lighting & Jumpscare System

const GAME_SAVE_KEY = 'dark-furnace-save-v1';

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.wrapper = document.getElementById('game-wrapper');
        this.renderScale = 1;
        this.targetFps = 60;
        this.frameBudgetMs = 1000 / 60;
        this.adaptiveFrameSamples = [];
        this.lowPowerMode = false;
        this.lastRenderTime = 0;

        // Lighting offscreen buffer
        this.lightCanvas = document.createElement('canvas');
        this.lightCtx = this.lightCanvas.getContext('2d');

        // Level & Progress
        this.currentLevel = 1;
        this.maxLevel = 6;
        this.coalInFurnace = 0;
        this.coalNeeded = 3;
        this.cutsceneTimeout = null;
        this.highContrastWalls = false;

        // Camera & Screen Shake
        this.camera = { x: 0, y: 0 };
        this.shakeAmount = 0;

        // Input
        this.keys = {};
        this.trapActivationRequested = false;
        this.leverActivationRequested = false;
        this.trapClaimDuration = 2;
        this.mousePos = { x: 0, y: 0 };
        this.mouseWorldPos = { x: 0, y: 0 };

        // Game Entities
        this.maze = null;
        this.player = null;
        this.monster = null;
        this.particleSystem = new ParticleSystem();
        this.particleSystem.lowPerformance = this.lowPowerMode;
        this.particleSystem.maxParticles = this.lowPowerMode ? 140 : 220;

        // State: 'START', 'PLAYING', 'LEVEL_UP', 'JUMPSCARE', 'GAMEOVER', 'VICTORY'
        this.state = 'START';
        this.lastTime = performance.now();

        // Level Evolution Descriptions
        this.levelData = {
            1: {
                title: "УРОВЕНЬ 1: ДРЕМЛЮЩАЯ ТЕНЬ",
                abilityName: "Статуя во мраке",
                abilityDesc: "Монстр спит в глубине лабиринта и не реагирует на ловушки. Он смертельно опасен при столкновении. Соберите 3 куска угля и разожгите печь!",
                cols: 17, rows: 17, coal: 3
            },
            2: {
                title: "УРОВЕНЬ 2: ПРОБУЖДЕНИЕ",
                abilityName: "Способность: ХОДИТЬ",
                abilityDesc: "Огонь печи разбудил чудовище! Теперь оно медленно патрулирует темные коридоры. Не попадайтесь ему на глаза!",
                cols: 21, rows: 21, coal: 4
            },
            3: {
                title: "УРОВЕНЬ 3: ИЩЕЙКА",
                abilityName: "Способность: НЮХАТЬ",
                abilityDesc: "Чудовище отрастило чуткий нюх! Оно чувствует ваши следы в воздухе, а запах угля чует через весь лабиринт!",
                cols: 25, rows: 25, coal: 4
            },
            4: {
                title: "УРОВЕНЬ 4: ЯРОСТЬ И СЛУХ",
                abilityName: "Способности: ЧУТКИЙ СЛУХ И РЫВОК",
                abilityDesc: "Монстр слышит спринт, нажатие рычага и подъём автоматических шипов. Если не видит вас, идёт проверить источник звука; завидев, совершает бешеный рывок!",
                cols: 27, rows: 27, coal: 5
            },
            5: {
                title: "УРОВЕНЬ 5: ТЕНЕВОЙ КОШМАР",
                abilityName: "Способность: ТЕЛЕПОРТАЦИЯ",
                abilityDesc: "Монстр перемещается сквозь тени и внезапно появляется в лабиринте. Соберите уголь и найдите выход!",
                cols: 31, rows: 31, coal: 6, upgrades: 1, portals: 5
            },
            6: {
                title: "УРОВЕНЬ 6: ПОСЛЕДНИЙ КОШМАР",
                abilityName: "Способности: ТЕЛЕПОРТАЦИЯ И ПОТУХШИЙ ФАКЕЛ",
                abilityDesc: "Монстр снова может задуть ваш факел. Лабиринт стал огромным: найдите 10 кусков угля и два улучшения рюкзака!",
                cols: 39, rows: 39, coal: 10, upgrades: 2, portals: 6
            }
        };

        this.defaultBindings = {
            moveUp: ['KeyW', 'ArrowUp'],
            moveDown: ['KeyS', 'ArrowDown'],
            moveLeft: ['KeyA', 'ArrowLeft'],
            moveRight: ['KeyD', 'ArrowRight'],
            sprint: ['ShiftLeft', 'ShiftRight'],
            hide: ['ControlLeft', 'ControlRight', 'KeyC'],
            toggleSound: ['KeyM'],
            activateTrap: ['Space'],
            activateLever: ['KeyE']
        };
        this.bindings = this.cloneBindings(this.defaultBindings);
        this.soundMuted = false;
        this.progress = {
            unlockedLevel: 1,
            checkpointLevel: 1,
            checkpointCoal: 0,
            finished: false
        };
        this.storageWarning = null;
        this.loadGameData();

        this.initDOM();
        this.applySavedSettings();
        this.refreshBindingButtons();
        this.refreshStartButton();
        this.setupEvents();
        this.resize();
    }

    initDOM() {
        this.dom = {
            startModal: document.getElementById('start-modal'),
            levelModal: document.getElementById('level-modal'),
            gameoverModal: document.getElementById('gameover-modal'),
            victoryModal: document.getElementById('victory-modal'),
            jumpscareOverlay: document.getElementById('jumpscare-overlay'),
            startBtn: document.getElementById('start-btn'),
            saveStatus: document.getElementById('save-status'),
            controlsOpenBtn: document.getElementById('controls-open-btn'),
            controlsModal: document.getElementById('controls-modal'),
            controlsCloseBtn: document.getElementById('controls-close-btn'),
            controlsStatus: document.getElementById('controls-status'),
            wallContrastBtns: [
                document.getElementById('wall-contrast-toggle'),
                document.getElementById('gameover-wall-contrast-toggle')
            ],
            levelBtn: document.getElementById('level-btn'),
            restartBtn: document.getElementById('restart-btn'),
            gameoverHomeBtn: document.getElementById('gameover-home-btn'),
            victoryRestartBtn: document.getElementById('victory-restart-btn'),
            optionalLevelBtn: document.getElementById('optional-level-btn'),
            victoryTitle: document.getElementById('victory-title'),
            victorySubtitle: document.getElementById('victory-subtitle'),
            victoryText: document.getElementById('victory-text'),
            endingCutscene: document.getElementById('ending-cutscene'),
            cutsceneCaption: document.getElementById('cutscene-caption'),
            cutsceneScene: document.getElementById('cutscene-scene'),
            cutsceneSkipBtn: document.getElementById('cutscene-skip-btn'),
            soundBtn: document.getElementById('sound-toggle-btn'),
            levelTitle: document.getElementById('hud-level-title'),
            monsterAbility: document.getElementById('hud-monster-ability'),
            coalSlots: document.getElementById('hud-coal-slots'),
            staminaLabel: document.getElementById('hud-stamina-label'),
            staminaFill: document.getElementById('hud-stamina-fill'),
            inventoryText: document.getElementById('hud-inventory-text'),
            fearVignette: document.getElementById('fear-vignette'),
            warningBanner: document.getElementById('warning-banner'),
            stealthBadge: document.getElementById('hud-stealth-badge'),
            stealthText: document.getElementById('hud-stealth-text'),
            levelModalTitle: document.getElementById('modal-level-title'),
            levelModalAbility: document.getElementById('modal-level-ability'),
            levelModalDesc: document.getElementById('modal-level-desc')
        };
    }

    cloneBindings(source) {
        return Object.fromEntries(
            Object.entries(source).map(([action, codes]) => [action, [...codes]])
        );
    }

    isBindableCode(code) {
        return typeof code === 'string' &&
            /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Shift(Left|Right)|Control(Left|Right)|Numpad[0-9]|Space|Enter|Backspace|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Minus|Equal|Backquote)$/.test(code);
    }

    loadGameData() {
        try {
            const rawSave = window.localStorage.getItem(GAME_SAVE_KEY);
            if (!rawSave) return;

            const saved = JSON.parse(rawSave);
            if (!saved || saved.version !== 1) return;

            if (Number.isInteger(saved.unlockedLevel)) {
                this.progress.unlockedLevel = Math.max(1, Math.min(this.maxLevel, saved.unlockedLevel));
            }
            if (Number.isInteger(saved.checkpointLevel)) {
                this.progress.checkpointLevel = Math.max(1, Math.min(this.progress.unlockedLevel, saved.checkpointLevel));
            }
            if (this.progress.checkpointLevel !== 6 &&
                Number.isInteger(saved.checkpointCoal) && saved.checkpointCoal >= 0) {
                this.progress.checkpointCoal = Math.min(
                    this.levelData[this.progress.checkpointLevel].coal,
                    saved.checkpointCoal
                );
            }
            this.progress.finished = saved.finished === true;
            this.highContrastWalls = saved.highContrastWalls === true;
            this.soundMuted = saved.soundMuted === true;

            if (saved.bindings && typeof saved.bindings === 'object') {
                const candidate = this.cloneBindings(this.defaultBindings);
                const seenCodes = new Set();
                let valid = true;

                for (const [action, defaults] of Object.entries(this.defaultBindings)) {
                    const codes = saved.bindings[action];
                    if (codes === undefined) {
                        const defaultCode = defaults.find(code => !seenCodes.has(code));
                        if (defaultCode) {
                            candidate[action] = [defaultCode];
                            seenCodes.add(defaultCode);
                            continue;
                        }

                        const fallbackCode = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']
                            .map(letter => `Key${letter}`)
                            .find(code => !seenCodes.has(code));
                        if (!fallbackCode) {
                            valid = false;
                            break;
                        }
                        candidate[action] = [fallbackCode];
                        seenCodes.add(fallbackCode);
                        continue;
                    }
                    if (!Array.isArray(codes) || codes.length !== defaults.length ||
                        codes.some(code => !this.isBindableCode(code) || seenCodes.has(code))) {
                        valid = false;
                        break;
                    }
                    codes.forEach(code => seenCodes.add(code));
                    candidate[action] = [...codes];
                }

                if (valid) this.bindings = candidate;
            }
        } catch (error) {
            this.storageWarning = 'Не удалось прочитать сохранение из браузера.';
            console.warn('Не удалось прочитать сохранение игры из браузера.', error);
        }
    }

    saveGameData() {
        const data = {
            version: 1,
            unlockedLevel: this.progress.unlockedLevel,
            checkpointLevel: this.progress.checkpointLevel,
            checkpointCoal: this.progress.checkpointCoal,
            finished: this.progress.finished,
            highContrastWalls: this.highContrastWalls,
            soundMuted: this.soundMuted,
            bindings: this.bindings
        };

        try {
            window.localStorage.setItem(GAME_SAVE_KEY, JSON.stringify(data));
            this.storageWarning = null;
        } catch (error) {
            this.storageWarning = 'Не удалось сохранить прогресс. Проверьте настройки хранения данных браузера.';
            console.warn('Не удалось сохранить прогресс игры в браузере.', error);
            if (this.dom && this.dom.saveStatus) {
                this.dom.saveStatus.textContent = this.storageWarning;
            }
        }
    }

    applySavedSettings() {
        this.dom.wallContrastBtns.forEach((button) => {
            button.setAttribute('aria-pressed', String(this.highContrastWalls));
            button.textContent = `КОНТРАСТНЫЕ СТЕНЫ: ${this.highContrastWalls ? 'ВКЛ' : 'ВЫКЛ'}`;
        });
        this.refreshHUDBindings();
        this.refreshSoundButton();
    }

    refreshHUDBindings() {
        this.dom.staminaLabel.textContent = `ВЫНОСЛИВОСТЬ [${this.keyName(this.bindings.sprint[0])}]:`;
        this.dom.stealthText.textContent = `ТЕНЬ [${this.keyName(this.bindings.hide[0])}]: НЕАКТИВНО`;
    }

    refreshSoundButton() {
        const state = this.soundMuted ? '🔇 ЗВУК: ВЫКЛ' : '🔊 ЗВУК: ВКЛ';
        this.dom.soundBtn.textContent = `${state} [${this.keyName(this.bindings.toggleSound[0])}]`;
    }

    refreshStartButton() {
        if (this.progress.finished) {
            this.dom.startBtn.textContent = 'НАЧАТЬ НОВУЮ ИГРУ';
            this.dom.saveStatus.textContent = 'Финальный уровень пройден. Прогресс сохранён в этом браузере.';
        } else if (this.progress.checkpointLevel === 6) {
            this.dom.startBtn.textContent = 'ПРОДОЛЖИТЬ: УРОВЕНЬ 6';
            this.dom.saveStatus.textContent = 'Сохранён уровень 6. Уголь в печи не сохраняется.';
        } else {
            this.dom.startBtn.textContent = 'ВОЙТИ ВО МРАК';
            this.dom.saveStatus.textContent = 'Уровни 1–5 начинаются заново. Продолжить можно только с уровня 6.';
        }
        if (this.storageWarning) {
            this.dom.saveStatus.textContent = this.storageWarning;
        }
    }

    keyName(code) {
        const names = {
            ArrowUp: '↑',
            ArrowDown: '↓',
            ArrowLeft: '←',
            ArrowRight: '→',
            ShiftLeft: 'Shift L',
            ShiftRight: 'Shift R',
            ControlLeft: 'Ctrl L',
            ControlRight: 'Ctrl R',
            Space: 'Пробел',
            Enter: 'Enter',
            Backspace: 'Backspace',
            Comma: ',',
            Period: '.',
            Slash: '/',
            Semicolon: ';',
            Quote: "'",
            BracketLeft: '[',
            BracketRight: ']',
            Backslash: '\\',
            Minus: '-',
            Equal: '=',
            Backquote: '`'
        };

        if (names[code]) return names[code];
        if (code.startsWith('Key')) return code.slice(3);
        if (code.startsWith('Digit')) return code.slice(5);
        if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
        return code;
    }

    refreshBindingButtons() {
        this.dom.controlsModal.querySelectorAll('.key-binding').forEach((button) => {
            const action = button.dataset.action;
            const index = Number(button.dataset.index);
            const code = this.bindings[action] && this.bindings[action][index];
            if (!code) return;
            button.textContent = this.keyName(code);
            button.setAttribute('aria-label', `Изменить клавишу «${this.keyName(code)}»`);
        });
        this.refreshSoundButton();
        this.refreshHUDBindings();
    }

    beginBindingCapture(button) {
        if (this.bindingCapture) this.bindingCapture.classList.remove('is-capturing');
        this.bindingCapture = button;
        button.classList.add('is-capturing');
        this.dom.controlsStatus.textContent = 'Нажмите клавишу для назначения. Esc — отмена.';
    }

    finishBindingCapture(code) {
        if (!this.bindingCapture) return;
        const button = this.bindingCapture;
        const action = button.dataset.action;
        const index = Number(button.dataset.index);
        const conflicts = Object.entries(this.bindings).some(([otherAction, codes]) =>
            codes.includes(code) && (otherAction !== action || codes.indexOf(code) !== index)
        );

        if (conflicts) {
            this.dom.controlsStatus.textContent = `Клавиша ${this.keyName(code)} уже назначена. Выберите другую.`;
            button.classList.remove('is-capturing');
            this.bindingCapture = null;
            return;
        }

        this.bindings[action][index] = code;
        button.classList.remove('is-capturing');
        this.bindingCapture = null;
        this.refreshBindingButtons();
        this.saveGameData();
        this.dom.controlsStatus.textContent = `Назначено: ${this.keyName(code)}. Настройки сохранены.`;
    }

    isActionDown(action) {
        return this.bindings[action].some(code => this.keys[code]);
    }

    getPlayerInput() {
        return {
            moveUp: this.isActionDown('moveUp'),
            moveDown: this.isActionDown('moveDown'),
            moveLeft: this.isActionDown('moveLeft'),
            moveRight: this.isActionDown('moveRight'),
            sprint: this.isActionDown('sprint'),
            hide: this.isActionDown('hide')
        };
    }

    setupEvents() {
        window.addEventListener('resize', () => this.resize());

        window.addEventListener('keydown', (e) => {
            if (this.bindingCapture) {
                e.preventDefault();
                if (e.repeat) return;
                if (e.code === 'Escape') {
                    this.bindingCapture.classList.remove('is-capturing');
                    this.bindingCapture = null;
                    this.dom.controlsStatus.textContent = 'Назначение отменено.';
                    return;
                }
                if (this.isBindableCode(e.code)) {
                    this.finishBindingCapture(e.code);
                } else {
                    this.dom.controlsStatus.textContent = 'Эту клавишу нельзя назначить. Выберите другую.';
                }
                return;
            }

            this.keys[e.code] = true;
            if (this.state === 'PLAYING' && this.bindings.activateTrap.includes(e.code)) {
                e.preventDefault();
                if (!e.repeat) this.trapActivationRequested = true;
            }
            if (this.state === 'PLAYING' && this.bindings.activateLever.includes(e.code)) {
                e.preventDefault();
                if (!e.repeat) this.leverActivationRequested = true;
            }
            if (this.bindings.toggleSound.includes(e.code)) this.toggleSound();

            const boundCodes = Object.values(this.bindings).flat();
            if (this.bindings.hide.includes(e.code) ||
                (this.state === 'PLAYING' && boundCodes.includes(e.code)) ||
                (e.ctrlKey && boundCodes.includes(e.code))) {
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        window.addEventListener('blur', () => {
            this.keys = {};
        });

        window.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mousePos.x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
            this.mousePos.y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
        });

        this.dom.startBtn.addEventListener('click', () => {
            window.soundEngine.init();
            window.soundEngine.resume();
            if (window.soundEngine.isMuted !== this.soundMuted) {
                window.soundEngine.toggleMute();
            }
            if (this.progress.finished) {
                this.startGame(1);
            } else if (this.progress.checkpointLevel === 6) {
                this.startGame(6, true);
            } else {
                this.startGame(1);
            }
        });

        this.dom.controlsOpenBtn.addEventListener('click', () => {
            this.dom.controlsModal.classList.remove('hidden');
            this.dom.controlsOpenBtn.setAttribute('aria-expanded', 'true');
            this.dom.controlsCloseBtn.focus();
        });

        this.dom.controlsCloseBtn.addEventListener('click', () => {
            if (this.bindingCapture) {
                this.bindingCapture.classList.remove('is-capturing');
                this.bindingCapture = null;
            }
            this.dom.controlsModal.classList.add('hidden');
            this.dom.controlsOpenBtn.setAttribute('aria-expanded', 'false');
            this.dom.controlsOpenBtn.focus();
        });

        this.dom.controlsModal.querySelectorAll('.key-binding').forEach((button) => {
            button.addEventListener('click', () => this.beginBindingCapture(button));
        });

        this.dom.wallContrastBtns.forEach((button) => {
            button.addEventListener('click', () => {
                this.highContrastWalls = !this.highContrastWalls;
                this.dom.wallContrastBtns.forEach((toggle) => {
                    toggle.setAttribute('aria-pressed', String(this.highContrastWalls));
                    toggle.textContent = `КОНТРАСТНЫЕ СТЕНЫ: ${this.highContrastWalls ? 'ВКЛ' : 'ВЫКЛ'}`;
                });
                this.saveGameData();
            });
        });

        this.dom.levelBtn.addEventListener('click', () => {
            this.startGame(this.currentLevel + 1);
        });

        this.dom.restartBtn.addEventListener('click', () => {
            if (this.currentLevel === 6) {
                this.startGame(6, true);
            } else {
                this.startGame(1);
            }
        });

        this.dom.gameoverHomeBtn.addEventListener('click', () => {
            window.soundEngine.setChaseIntensity(0);
            this.state = 'START';
            this.dom.gameoverModal.classList.add('hidden');
            this.dom.controlsModal.classList.add('hidden');
            this.dom.startModal.classList.remove('hidden');
            this.refreshStartButton();
            this.dom.startBtn.focus();
        });

        this.dom.victoryRestartBtn.addEventListener('click', () => {
            this.startGame(1);
        });

        this.dom.optionalLevelBtn.addEventListener('click', () => {
            this.startGame(6);
        });

        this.dom.cutsceneSkipBtn.addEventListener('click', () => {
            this.finishEndingCutscene();
        });

        this.dom.soundBtn.addEventListener('click', () => {
            this.toggleSound();
        });
    }

    toggleSound() {
        window.soundEngine.init();
        window.soundEngine.resume();
        const muted = window.soundEngine.toggleMute();
        this.soundMuted = muted;
        this.refreshSoundButton();
        this.saveGameData();
    }

    resize() {
        const cssWidth = window.innerWidth;
        const cssHeight = window.innerHeight;
        const hardwareThreads = navigator.hardwareConcurrency || 4;
        const isLowPowerDevice = hardwareThreads <= 4 ||
            (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (isLowPowerDevice) {
            this.lowPowerMode = true;
            this.targetFps = 30;
            this.renderScale = Math.min(0.65, 960 / cssWidth, 540 / cssHeight);
        } else {
            this.lowPowerMode = cssWidth * cssHeight > 2073600;
            this.targetFps = this.lowPowerMode ? 45 : 60;
            this.renderScale = this.lowPowerMode ? 0.8 : 1;
        }
        this.renderScale = Math.max(0.55, Math.min(1, this.renderScale));
        this.frameBudgetMs = 1000 / this.targetFps;

        this.canvas.width = Math.max(320, Math.round(cssWidth * this.renderScale));
        this.canvas.height = Math.max(240, Math.round(cssHeight * this.renderScale));
        this.lightCanvas.width = this.canvas.width;
        this.lightCanvas.height = this.canvas.height;
        if (this.wrapper) this.wrapper.classList.toggle('low-performance', this.lowPowerMode);
    }

    setWarning(text, duration = 2200) {
        if (!this.dom.warningBanner) return;
        this.dom.warningBanner.textContent = text;
        this.dom.warningBanner.style.opacity = '1';
        clearTimeout(this.warningTimeout);
        this.warningTimeout = setTimeout(() => {
            if (this.dom.warningBanner) this.dom.warningBanner.style.opacity = '0';
        }, duration);
    }

    activateFarthestTrap() {
        const availableTraps = this.maze.traps.filter(trap =>
            trap.armed && trap.owner === 'player'
        );
        if (availableTraps.length === 0) {
            this.setWarning("НЕТ ГОТОВОЙ ЛОВУШКИ, КОТОРАЯ ЕЩЁ ПРИНАДЛЕЖИТ ТЕБЕ.", 2200);
            return;
        }

        const trap = availableTraps.reduce((farthest, candidate) => {
            const candidateDistance = Math.hypot(
                this.player.x - candidate.worldX,
                this.player.y - candidate.worldY
            );
            const farthestDistance = Math.hypot(
                this.player.x - farthest.worldX,
                this.player.y - farthest.worldY
            );
            return candidateDistance > farthestDistance ? candidate : farthest;
        });

        this.triggerTrap(trap);
    }

    triggerTrap(trap) {
        trap.armed = false;
        trap.claimProgress = 0;
        trap.capturedByPlayer = false;
        window.soundEngine.playTrapTrigger();

        if (this.currentLevel === 1) {
            this.setWarning("ЛОВУШКА ЩЁЛКНУЛА, НО МОНСТР СПИТ И НЕ РЕАГИРУЕТ.", 2600);
        } else {
            this.monster.investigateTrap(trap);
            this.setWarning(
                trap.owner === 'monster'
                    ? "ТЫ ПОПАЛ В ЛОВУШКУ МОНСТРА! ОН БЕЖИТ ПРОВЕРИТЬ ЗВУК!"
                    : "ЛОВУШКА ЩЁЛКНУЛА! МОНСТР БЕЖИТ ПРОВЕРИТЬ ЗВУК!",
                2600
            );
        }
    }

    startGame(level, resumeCheckpoint = false) {
        clearTimeout(this.cutsceneTimeout);
        this.cutsceneTimeout = null;
        this.dom.endingCutscene.classList.add('hidden');
        this.currentLevel = level;
        this.trapActivationRequested = false;
        this.leverActivationRequested = false;
        const config = this.levelData[this.currentLevel];

        const shouldResume = level !== 6 && resumeCheckpoint && this.progress.checkpointLevel === level;
        this.coalInFurnace = shouldResume ? this.progress.checkpointCoal : 0;
        this.progress.checkpointLevel = level;
        this.progress.checkpointCoal = this.currentLevel === 6 ? 0 : this.coalInFurnace;
        this.progress.finished = false;
        this.saveGameData();
        this.refreshStartButton();
        this.coalNeeded = config.coal;

        // Maze
        this.maze = new Maze(config.cols, config.rows, 48);
        this.maze.generate(this.coalNeeded, config.upgrades, config.portals);

        // Player
        const pStartX = (this.maze.furnacePos.x + 1) * this.maze.tileSize;
        const pStartY = (this.maze.furnacePos.y + 3) * this.maze.tileSize;
        this.player = new Player(pStartX, pStartY);

        // Monster
        const monsterSpawn = this.maze.getMonsterSpawn();
        this.monster = new Monster(monsterSpawn.x, monsterSpawn.y);
        this.monster.setLevel(this.currentLevel, monsterSpawn.x, monsterSpawn.y);

        this.particleSystem = new ParticleSystem();
        this.particleSystem.lowPerformance = this.lowPowerMode;
        this.particleSystem.maxParticles = this.lowPowerMode ? 140 : 220;

        // Update HUD
        this.updateHUD();

        // Hide modals & jumpscare
        this.dom.startModal.classList.add('hidden');
        this.dom.controlsModal.classList.add('hidden');
        this.dom.levelModal.classList.add('hidden');
        this.dom.gameoverModal.classList.add('hidden');
        this.dom.victoryModal.classList.add('hidden');
        if (this.dom.jumpscareOverlay) this.dom.jumpscareOverlay.classList.remove('active');
        if (this.wrapper) this.wrapper.classList.remove('screen-glitch');

        this.state = 'PLAYING';
        this.lastTime = performance.now();

        this.setWarning(`УРОВЕНЬ ${this.currentLevel}: СОБЕРИТЕ УГОЛЬ ДЛЯ ПЕЧИ!`, 3000);
    }

    updateHUD() {
        const config = this.levelData[this.currentLevel];
        this.dom.levelTitle.textContent = config.title;
        this.dom.monsterAbility.textContent = config.abilityName;

        this.dom.coalSlots.innerHTML = '';
        for (let i = 0; i < this.coalNeeded; i++) {
            const pip = document.createElement('div');
            pip.className = 'coal-pip' + (i < this.coalInFurnace ? ' filled' : '');
            this.dom.coalSlots.appendChild(pip);
        }

        if (this.player && this.player.coalCount > 0) {
            const capacity = 1 + this.player.pocketUpgradeCount;
            this.dom.inventoryText.textContent = `УГОЛЬ: ${this.player.coalCount}/${capacity} (НЕСИТЕ В ПЕЧЬ)`;
            this.dom.inventoryText.style.color = '#ff9900';
        } else if (this.player && this.player.pocketUpgradeCount > 0) {
            const capacity = 1 + this.player.pocketUpgradeCount;
            this.dom.inventoryText.textContent = `РЮКЗАК: УГОЛЬ 0/${capacity} (УЛУЧШЕНИЙ: ${this.player.pocketUpgradeCount})`;
            this.dom.inventoryText.style.color = '#9dff8a';
        } else {
            this.dom.inventoryText.textContent = "КАРМАНЫ ПУСТЫ (ИЩИТЕ УГОЛЬ)";
            this.dom.inventoryText.style.color = '#aaaaaa';
        }

        if (this.dom.stealthBadge && this.dom.stealthText && this.player) {
            if (this.player.isHiding) {
                this.dom.stealthBadge.classList.add('active');
                this.dom.stealthText.textContent = `ТЕНЬ [${this.keyName(this.bindings.hide[0])}]: В ТЕНЯХ (−33%/С)`;
            } else {
                this.dom.stealthBadge.classList.remove('active');
                this.dom.stealthText.textContent = `ТЕНЬ [${this.keyName(this.bindings.hide[0])}]: НЕАКТИВНО`;
            }
        }
    }

    // --- MAIN UPDATE LOOP ---
    update(dt) {
        if (this.state !== 'PLAYING') return;

        // Camera shake decay
        if (this.shakeAmount > 0) {
            this.shakeAmount = Math.max(0, this.shakeAmount - 20 * dt);
        }

        // Mouse coordinates with camera
        this.mouseWorldPos.x = this.mousePos.x + this.camera.x;
        this.mouseWorldPos.y = this.mousePos.y + this.camera.y;

        // Entities update
        this.player.update(dt, this.getPlayerInput(), this.mouseWorldPos, this.maze, this.particleSystem);
        this.monster.update(dt, this.player, this.maze, this.particleSystem, (t, d) => this.setWarning(t, d));
        this.particleSystem.update(dt);

        this.updateSpikeTraps(dt);
        if (this.leverActivationRequested) {
            this.leverActivationRequested = false;
            this.activateNearbyLever();
        }

        const trapInteractionUnderPlayer = this.maze.traps.some(trap =>
            (trap.owner === 'monster' || !trap.armed) &&
            Math.hypot(this.player.x - trap.worldX, this.player.y - trap.worldY) <= this.player.radius + 8
        );
        if (this.trapActivationRequested) {
            this.trapActivationRequested = false;
            if (!trapInteractionUnderPlayer) this.activateFarthestTrap();
        }

        for (const trap of this.maze.traps) {
            const isPlayerOnTrap = Math.hypot(
                this.player.x - trap.worldX,
                this.player.y - trap.worldY
            ) <= this.player.radius + 8;

            if (trap.armed) {
                trap.claimProgress = 0;
                if (trap.owner === 'monster' && isPlayerOnTrap) this.triggerTrap(trap);
                continue;
            }

            if (!isPlayerOnTrap) {
                trap.claimProgress = 0;
                continue;
            }

            if (this.isActionDown('activateTrap')) {
                trap.claimProgress += dt;
                if (trap.claimProgress >= this.trapClaimDuration) {
                    const isRearming = trap.owner === 'player';
                    trap.owner = 'player';
                    trap.armed = true;
                    trap.capturedByPlayer = true;
                    trap.claimProgress = 0;
                    window.soundEngine.playCoalPickup();
                    this.setWarning(
                        isRearming
                            ? "ТВОЯ ЛОВУШКА ПЕРЕЗАРЯЖЕНА И ГОТОВА К АКТИВАЦИИ."
                            : "СРАБОТАВШАЯ ЛОВУШКА ЗАХВАЧЕНА! ОНА СНОВА ГОТОВА К АКТИВАЦИИ.",
                        2600
                    );
                }
            } else {
                trap.claimProgress = 0;
            }
        }

        // Real-time Stealth HUD update
        if (this.dom.stealthBadge && this.dom.stealthText) {
            if (this.player.isHiding) {
                this.dom.stealthBadge.classList.add('active');
                this.dom.stealthText.textContent = `ТЕНЬ [${this.keyName(this.bindings.hide[0])}]: В ТЕНЯХ (−33%/С)`;
            } else {
                this.dom.stealthBadge.classList.remove('active');
                this.dom.stealthText.textContent = `ТЕНЬ [${this.keyName(this.bindings.hide[0])}]: НЕАКТИВНО`;
            }
        }

        // Volumetric creeping fog drifting in corridors
        this.particleSystem.emitFog(this.camera.x, this.camera.y, this.canvas.width, this.canvas.height);

        // Furnace continuous embers & smoke
        const fWidth = this.maze.furnacePos.w * this.maze.tileSize;
        const fHeight = this.maze.furnacePos.h * this.maze.tileSize;
        this.particleSystem.emitFurnace(
            this.maze.furnacePos.x * this.maze.tileSize,
            this.maze.furnacePos.y * this.maze.tileSize,
            fWidth, fHeight
        );

        // --- Interactions ---
        // 1. Pick Coal
        const carriedCoalCount = this.player.coalCount;
        const coalCapacity = 1 + this.player.pocketUpgradeCount;
        if (carriedCoalCount < coalCapacity) {
            for (const coal of this.maze.coalNodes) {
                if (coal.active) {
                    const coalWorldX = (coal.x + 0.5) * this.maze.tileSize;
                    const coalWorldY = (coal.y + 0.5) * this.maze.tileSize;
                    const dist = Math.hypot(this.player.x - coalWorldX, this.player.y - coalWorldY);
                    if (dist < 32) {
                        if (this.player.isHiding) {
                            // Player cannot pick up coal while hiding in shadows!
                            this.setWarning(`⚠️ ТЫ В ТЕНЯХ: НЕЛЬЗЯ БРАТЬ УГОЛЬ (ОТПУСТИ ${this.keyName(this.bindings.hide[0])})!`, 1200);
                        } else {
                            coal.active = false;
                            this.player.coalCount++;
                            window.soundEngine.playCoalPickup();
                            this.setWarning(
                                `ВЫ НЕСЁТЕ ${this.player.coalCount} ИЗ ${coalCapacity} КУСКОВ УГЛЯ!`,
                                2000
                            );
                            this.updateHUD();
                            break;
                        }
                    }
                }
            }
        }

        // 1b. Pick up the level's extra-pockets upgrade
        for (const upgrade of this.maze.upgradeNodes) {
            if (!upgrade.active) continue;

            const upgradeX = (upgrade.x + 0.5) * this.maze.tileSize;
            const upgradeY = (upgrade.y + 0.5) * this.maze.tileSize;
            const distToUpgrade = Math.hypot(this.player.x - upgradeX, this.player.y - upgradeY);
            if (distToUpgrade < 32) {
                upgrade.active = false;
                this.player.pocketUpgradeCount++;
                window.soundEngine.playCoalPickup();
                const capacity = 1 + this.player.pocketUpgradeCount;
                this.setWarning(`🎒 РЮКЗАК УЛУЧШЕН! ТЕПЕРЬ ВМЕСТИМОСТЬ — ${capacity} КУСКА УГЛЯ!`, 2800);
                this.updateHUD();
                break;
            }
        }

        // 2. Deposit Coal
        if (this.player.coalCount > 0) {
            const furnaceX = this.maze.furnacePos.x * this.maze.tileSize;
            const furnaceY = this.maze.furnacePos.y * this.maze.tileSize;
            const furnaceCenterX = furnaceX + this.maze.furnacePos.w * this.maze.tileSize / 2;
            const furnaceCenterY = furnaceY + this.maze.furnacePos.h * this.maze.tileSize / 2;
            const closestX = Math.max(furnaceX, Math.min(this.player.x, furnaceX + this.maze.furnacePos.w * this.maze.tileSize));
            const closestY = Math.max(furnaceY, Math.min(this.player.y, furnaceY + this.maze.furnacePos.h * this.maze.tileSize));
            const distToFurnace = Math.hypot(this.player.x - closestX, this.player.y - closestY);

            if (distToFurnace <= this.player.radius + 22) {
                this.player.coalCount--;
                this.coalInFurnace++;
                this.progress.checkpointLevel = this.currentLevel;
                this.progress.checkpointCoal = this.coalInFurnace;
                this.saveGameData();
                this.refreshStartButton();
                window.soundEngine.playFurnaceStoke();
                this.particleSystem.emitLevelExplosion(furnaceCenterX, furnaceCenterY);
                this.updateHUD();

                if (this.coalInFurnace >= this.coalNeeded) {
                    this.onLevelComplete();
                    return;
                } else {
                    this.setWarning(`УГОЛЬ В ПЕЧИ! ОСТАЛОСЬ: ${this.coalNeeded - this.coalInFurnace} ШТ.`, 2000);
                }
            }
        }

        // 3. Teleport Portals Interaction & FX
        if (this.maze && this.maze.teleports) {
            for (const tele of this.maze.teleports) {
                this.particleSystem.emitPortalIdle(tele.worldX, tele.worldY, tele.color);
            }

            if (this.player.teleportCooldown <= 0) {
                for (const tele of this.maze.teleports) {
                    const distToTele = Math.hypot(this.player.x - tele.worldX, this.player.y - tele.worldY);
                    if (distToTele < 26) {
                        const targetTele = this.maze.teleports[tele.targetIndex];
                        if (targetTele) {
                            window.soundEngine.playTeleport();

                            // Departure burst
                            this.particleSystem.emitPortalWarp(this.player.x, this.player.y, tele.color);

                            // Instant warp to linked portal
                            this.player.x = targetTele.worldX;
                            this.player.y = targetTele.worldY;
                            this.player.teleportCooldown = 2.0;

                            // Clear scent trail so monster is baffled at entrance portal
                            this.player.scentTrail = [];

                            // Arrival burst
                            this.particleSystem.emitPortalWarp(targetTele.worldX, targetTele.worldY, targetTele.color);
                            this.shakeAmount = 14;

                            this.setWarning(`🌀 ВЫ ПЕРЕМЕСТИЛИСЬ ЧЕРЕЗ ${tele.name}!`, 2200);
                            break;
                        }
                    }
                }
            }
        }

        // 4. Distance & Dynamic Horror Atmosphere
        const distToMonster = Math.hypot(this.player.x - this.monster.x, this.player.y - this.monster.y);
        const maxDangerDist = 500;
        const danger = Math.max(0, 1 - distToMonster / maxDangerDist);

        // Heartbeat
        window.soundEngine.updateHeartbeat(danger);

        // Dynamic Music Chase Intensity
        let chaseIntensity = 0;
        if (this.monster.state === MONSTER_STATES.CHARGING) {
            chaseIntensity = 1.0;
            this.shakeAmount = Math.max(this.shakeAmount, 6);
        } else if (this.monster.state === MONSTER_STATES.CHASE) {
            chaseIntensity = 0.85;
        } else if (this.monster.state === MONSTER_STATES.TRACKING) {
            chaseIntensity = 0.55;
        } else if (danger > 0.2) {
            chaseIntensity = danger * 0.7;
        }
        window.soundEngine.setChaseIntensity(chaseIntensity);

        // Fear Vignette
        if (this.dom.fearVignette) {
            this.dom.fearVignette.style.opacity = (danger * 0.96).toFixed(2);
        }

        // Screen Glitch & Lantern Proximity Flicker
        if (this.wrapper) {
            if (danger > 0.65 || this.monster.state === MONSTER_STATES.CHARGING) {
                this.wrapper.classList.add('screen-glitch');
            } else {
                this.wrapper.classList.remove('screen-glitch');
            }
        }
        // 4. Monster Catches Player -> BONE-CHILLING JUMPSCARE!
        const catchDist = this.player.radius + this.monster.radius + 2;
        if (distToMonster < catchDist) {
            this.triggerJumpscare();
            return;
        }

        // Smooth Camera Follow + Screen Shake
        const targetCamX = this.player.x - this.canvas.width / 2;
        const targetCamY = this.player.y - this.canvas.height / 2;
        this.camera.x += (targetCamX - this.camera.x) * 0.12;
        this.camera.y += (targetCamY - this.camera.y) * 0.12;

        if (this.shakeAmount > 0) {
            this.camera.x += (Math.random() - 0.5) * this.shakeAmount;
            this.camera.y += (Math.random() - 0.5) * this.shakeAmount;
        }

        // HUD Stamina
        if (this.dom.staminaFill) {
            this.dom.staminaFill.style.width = `${(this.player.stamina / this.player.maxStamina) * 100}%`;
        }
    }

    updateSpikeTraps(dt) {
        for (const trap of this.maze.spikeTraps) {
            if (trap.kind !== 'automatic') continue;

            if (trap.phase === 'arming' || trap.phase === 'raised') {
                trap.timer -= dt;
                if (trap.timer <= 0) {
                    if (trap.phase === 'arming') {
                        trap.phase = 'raised';
                        trap.raised = true;
                        trap.timer = 3;
                        window.soundEngine.playTrapTrigger();
                        this.monster.reportNoise(trap.worldX, trap.worldY, 'ШИПЫ');
                    } else {
                        trap.phase = 'hidden';
                        trap.raised = false;
                        trap.timer = 0;
                    }
                }
            }

            const playerOnTrap = Math.hypot(
                this.player.x - trap.worldX,
                this.player.y - trap.worldY
            ) <= this.player.radius + 10;
            const monsterOnTrap = Math.hypot(
                this.monster.x - trap.worldX,
                this.monster.y - trap.worldY
            ) <= this.monster.radius + 10;
            const occupied = playerOnTrap || monsterOnTrap;

            if (!occupied) trap.occupied = false;
            if (occupied && !trap.occupied && trap.phase === 'hidden') {
                trap.occupied = true;
                trap.phase = 'arming';
                trap.timer = 1.5;
            } else if (occupied) {
                trap.occupied = true;
            }
        }
    }

    activateNearbyLever() {
        const nearbyLever = this.maze.levers.reduce((nearest, lever) => {
            const distance = Math.hypot(this.player.x - lever.worldX, this.player.y - lever.worldY);
            return distance <= this.player.radius + 25 &&
                (!nearest || distance < nearest.distance)
                ? { lever, distance }
                : nearest;
        }, null);

        if (!nearbyLever) {
            this.setWarning("Рядом нет рычага.", 1600);
            return;
        }

        const trap = this.maze.spikeTraps[nearbyLever.lever.trapId];
        if (!trap) {
            this.setWarning("Этот рычаг не связан с ловушкой.", 1600);
            return;
        }

        trap.raised = !trap.raised;
        window.soundEngine.playTrapTrigger();
        this.monster.reportNoise(this.player.x, this.player.y, 'РЫЧАГ');
        this.setWarning(trap.raised ? "Шипы подняты!" : "Шипы убраны.", 1600);
    }

    // --- FULLSCREEN TERRIFYING JUMPSCARE SEQUENCE ---
    triggerJumpscare() {
        this.state = 'JUMPSCARE';
        window.soundEngine.setChaseIntensity(0);
        window.soundEngine.playJumpscare();

        // Show terrifying jumpscare overlay with roaring image
        if (this.dom.jumpscareOverlay) {
            this.dom.jumpscareOverlay.classList.add('active');
        }

        // Violent screen rumble
        this.shakeAmount = 25;

        // Transition to Game Over screen after 1.8 seconds of pure panic
        setTimeout(() => {
            if (this.dom.jumpscareOverlay) {
                this.dom.jumpscareOverlay.classList.remove('active');
            }
            if (this.wrapper) {
                this.wrapper.classList.remove('screen-glitch');
            }
            this.state = 'GAMEOVER';
            this.dom.restartBtn.textContent = this.currentLevel === 6
                ? 'ПРОДОЛЖИТЬ УРОВЕНЬ 6'
                : 'НАЧАТЬ ЗАНОВО С УРОВНЯ 1';
            this.dom.gameoverModal.classList.remove('hidden');
        }, 1800);
    }

    onLevelComplete() {
        window.soundEngine.setChaseIntensity(0);
        window.soundEngine.playLevelUp();

        if (this.currentLevel === this.maxLevel) {
            this.progress.finished = true;
            this.progress.checkpointLevel = 1;
            this.progress.checkpointCoal = 0;
        } else {
            this.progress.unlockedLevel = Math.max(this.progress.unlockedLevel, this.currentLevel + 1);
            this.progress.checkpointLevel = this.currentLevel + 1;
            this.progress.checkpointCoal = 0;
            this.progress.finished = false;
        }
        this.saveGameData();
        this.refreshStartButton();

        if (this.currentLevel === this.maxLevel) {
            this.startEndingCutscene();
            return;
        }

        if (this.currentLevel === 5) {
            this.state = 'VICTORY';
            this.dom.victoryTitle.textContent = "ВЫ СБЕЖАЛИ ИЗ ЛАБИРИНТА";
            this.dom.victorySubtitle.textContent = "НО МОНСТР ОСТАЛСЯ В ЖИВЫХ";
            this.dom.victoryText.textContent = "Вы сбежали из лабиринта, но монстр остался в живых.";
            this.dom.optionalLevelBtn.classList.remove('hidden');
            this.dom.victoryRestartBtn.textContent = "ИГРАТЬ ЗАНОВО";
            this.dom.victoryModal.classList.remove('hidden');
            return;
        }

        this.state = 'LEVEL_UP';
        const nextConfig = this.levelData[this.currentLevel + 1];
        this.dom.levelModalTitle.textContent = `ПЕЧЬ РАЗОЖЖЕНА!`;
        this.dom.levelModalAbility.textContent = nextConfig.abilityName;
        this.dom.levelModalDesc.textContent = nextConfig.abilityDesc;
        this.dom.levelModal.classList.remove('hidden');
    }

    startEndingCutscene() {
        this.state = 'CUTSCENE';
        this.dom.victoryModal.classList.add('hidden');
        this.dom.optionalLevelBtn.classList.add('hidden');
        this.dom.cutsceneCaption.textContent = "Земля дрожит. Стены лабиринта начинают рушиться...";
        this.dom.cutsceneScene.className = 'cutscene-scene collapse';
        this.dom.endingCutscene.classList.remove('hidden');

        const scenes = [
            { phase: 'collapse', caption: "Земля дрожит. Стены лабиринта начинают рушиться..." },
            { phase: 'monster-fade', caption: "Монстр исчезает вместе с тенями и обломками." },
            { phase: 'vanish', caption: "Лабиринт исчезает. Вы исчезаете вместе с ним..." }
        ];
        let sceneIndex = 0;

        const advanceScene = () => {
            sceneIndex++;
            if (sceneIndex >= scenes.length) {
                this.finishEndingCutscene();
                return;
            }

            const scene = scenes[sceneIndex];
            this.dom.cutsceneScene.className = `cutscene-scene ${scene.phase}`;
            this.dom.cutsceneCaption.textContent = scene.caption;
            this.cutsceneTimeout = setTimeout(advanceScene, 2800);
        };

        this.cutsceneTimeout = setTimeout(advanceScene, 2800);
    }

    finishEndingCutscene() {
        clearTimeout(this.cutsceneTimeout);
        this.cutsceneTimeout = null;
        this.dom.endingCutscene.classList.add('hidden');
        this.state = 'VICTORY';
        this.dom.victoryTitle.textContent = "ПОБЕДА?";
        this.dom.victorySubtitle.textContent = "ЛАБИРИНТ ИСЧЕЗ";
        this.dom.victoryText.textContent = "Монстр исчез вместе с лабиринтом, и вы вместе с ним... Победа?";
        this.dom.optionalLevelBtn.classList.add('hidden');
        this.dom.victoryRestartBtn.textContent = "ИГРАТЬ ЗАНОВО";
        this.dom.victoryModal.classList.remove('hidden');
    }

    // --- RENDER PIPELINE ---
    render() {
        this.ctx.fillStyle = '#030105';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (!this.maze || !this.player) return;

        this.ctx.save();
        this.ctx.translate(-this.camera.x, -this.camera.y);

        // 1. Maze Floor & Walls
        this.renderMaze(this.ctx);

        // 2. Props (Jack-o'-lanterns, Skulls, Wall Eyes, Blood Stains)
        this.renderProps(this.ctx);

        // 3. Traps
        this.renderTraps(this.ctx);
        this.renderSpikeTraps(this.ctx);

        // 4. Teleport Portals
        this.renderTeleports(this.ctx);

        // 5. Coal Nodes
        this.renderCoalNodes(this.ctx);

        // 6. Extra Pockets Upgrade
        this.renderPocketUpgrades(this.ctx);

        // 7. Furnace
        this.renderFurnace(this.ctx);

        // 8. Particles (Fog, Embers, Smoke, Scent, Blood)
        this.particleSystem.draw(this.ctx);

        // 9. Player
        this.player.draw(this.ctx);

        // 10. Monster Body & Writhing Tentacles
        this.monster.draw(this.ctx);

        this.ctx.restore();

        // 11. Dynamic 2D Lighting Mask
        this.renderLighting();

        // 12. Monster Glowing Eyes Piercing the Darkness!
        this.renderMonsterEyesGlow();
    }

    renderTraps(ctx) {
        const now = performance.now() * 0.003;

        for (const trap of this.maze.traps) {
            const pulse = 0.75 + Math.sin(now + trap.x) * 0.15;
            ctx.save();
            ctx.translate(trap.worldX, trap.worldY);
            ctx.globalAlpha = trap.armed ? pulse : 0.55;
            const isMonsterTrap = trap.owner === 'monster';
            ctx.strokeStyle = trap.armed ? (isMonsterTrap ? '#b765db' : '#a84a35') : '#77727a';
            ctx.fillStyle = trap.armed ? (isMonsterTrap ? '#281a30' : '#38201d') : '#242126';
            ctx.lineWidth = 2;
            ctx.shadowBlur = trap.armed ? 7 : 0;
            ctx.shadowColor = isMonsterTrap ? '#8a36ad' : '#b42c1c';

            ctx.beginPath();
            ctx.arc(0, 0, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            for (let i = 0; i < 8; i++) {
                const angle = (i * Math.PI) / 4;
                ctx.beginPath();
                ctx.moveTo(Math.cos(angle) * 9, Math.sin(angle) * 9);
                ctx.lineTo(Math.cos(angle) * 16, Math.sin(angle) * 16);
                ctx.stroke();
            }

            ctx.shadowBlur = 0;
            ctx.beginPath();
            if (trap.armed) {
                ctx.moveTo(-5, -4);
                ctx.lineTo(0, 0);
                ctx.lineTo(5, -4);
                ctx.moveTo(-5, 4);
                ctx.lineTo(0, 0);
                ctx.lineTo(5, 4);
            } else {
                ctx.moveTo(-5, -5);
                ctx.lineTo(5, 5);
                ctx.moveTo(5, -5);
                ctx.lineTo(-5, 5);
            }
            ctx.stroke();
            if (!trap.armed && trap.claimProgress > 0) {
                const progress = Math.min(1, trap.claimProgress / this.trapClaimDuration);
                ctx.strokeStyle = '#7dffae';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(0, 0, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    renderSpikeTraps(ctx) {
        const now = performance.now() * 0.006;
        const tileSize = this.maze.tileSize;

        for (const trap of this.maze.spikeTraps) {
            ctx.save();
            ctx.translate(trap.worldX, trap.worldY);
            const stateColor = trap.kind === 'lever'
                ? (trap.raised ? '#d74c42' : '#8bd18a')
                : (trap.phase === 'arming' ? '#d88a32' : '#68616b');
            ctx.fillStyle = trap.kind === 'lever'
                ? (trap.raised ? 'rgba(215, 76, 66, 0.16)' : 'rgba(139, 209, 138, 0.12)')
                : '#17151a';
            ctx.strokeStyle = stateColor;
            ctx.lineWidth = 2;
            ctx.shadowColor = stateColor;
            ctx.shadowBlur = trap.kind === 'lever' ? 8 : 0;
            ctx.fillRect(-tileSize * 0.38, -tileSize * 0.38, tileSize * 0.76, tileSize * 0.76);
            ctx.strokeRect(-tileSize * 0.38, -tileSize * 0.38, tileSize * 0.76, tileSize * 0.76);

            if (trap.phase === 'arming') {
                ctx.shadowBlur = 0;
                ctx.globalAlpha = 0.5 + Math.sin(now) * 0.35;
                ctx.strokeStyle = '#ffae45';
                ctx.lineWidth = 3;
                ctx.strokeRect(-tileSize * 0.32, -tileSize * 0.32, tileSize * 0.64, tileSize * 0.64);
            }

            if (trap.raised) {
                ctx.fillStyle = trap.kind === 'lever' ? stateColor : '#c9c3cf';
                ctx.strokeStyle = trap.kind === 'lever' ? stateColor : '#f2d8ff';
                ctx.shadowColor = trap.kind === 'lever' ? stateColor : '#bb79df';
                ctx.shadowBlur = 8;
                for (let row = -1; row <= 1; row++) {
                    for (let col = -1; col <= 1; col++) {
                        const x = col * 10;
                        const y = row * 10;
                        ctx.beginPath();
                        ctx.moveTo(x - 4, y + 5);
                        ctx.lineTo(x, y - 6);
                        ctx.lineTo(x + 4, y + 5);
                        ctx.closePath();
                        ctx.fill();
                        ctx.stroke();
                    }
                }
            } else {
                ctx.fillStyle = trap.kind === 'lever' ? stateColor : '#77717b';
                for (let i = -1; i <= 1; i++) {
                    ctx.fillRect(i * 11 - 3, -2, 6, 4);
                }
            }
            ctx.restore();
        }

        for (const lever of this.maze.levers) {
            const trap = this.maze.spikeTraps[lever.trapId];
            if (!trap) continue;

            ctx.save();
            ctx.translate(lever.worldX, lever.worldY);
            ctx.fillStyle = '#30271f';
            ctx.strokeStyle = '#d5a35b';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(0, 0, 10, 7, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.strokeStyle = trap.raised ? '#d74c42' : '#8bd18a';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(trap.raised ? 4 : -4, trap.raised ? -15 : -12);
            ctx.stroke();

            if (Math.hypot(this.player.x - lever.worldX, this.player.y - lever.worldY) <= this.player.radius + 32) {
                ctx.fillStyle = '#fff1c4';
                ctx.font = 'bold 12px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('E', 0, 22);
            }
            ctx.restore();
        }
    }

    renderMaze(ctx) {
        const ts = this.maze.tileSize;
        const minX = Math.max(0, Math.floor(this.camera.x / ts));
        const maxX = Math.min(this.maze.cols - 1, Math.floor((this.camera.x + this.canvas.width) / ts) + 1);
        const minY = Math.max(0, Math.floor(this.camera.y / ts));
        const maxY = Math.min(this.maze.rows - 1, Math.floor((this.camera.y + this.canvas.height) / ts) + 1);

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const px = x * ts;
                const py = y * ts;

                if (this.maze.grid[y][x] === 1) {
                    // Dungeon Stone Wall
                    ctx.fillStyle = this.highContrastWalls ? '#77717d' : '#180f1e';
                    ctx.fillRect(px, py, ts, ts);

                    // Wall Brick Details
                    ctx.strokeStyle = this.highContrastWalls ? '#e5dce9' : '#0a050f';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(px + 1, py + 1, ts - 2, ts - 2);

                    // Highlight top edge
                    ctx.fillStyle = this.highContrastWalls ? '#f5e8c9' : '#2b1735';
                    ctx.fillRect(px, py, ts, 3);
                } else {
                    const room = this.maze.isRoomFloor(x, y);
                    if (room) {
                        // Special Small Room Floor
                        if (room.type === 'teleport') {
                            // Occult Arcane Portal Chamber Floor
                            ctx.fillStyle = '#150a24';
                            ctx.fillRect(px, py, ts, ts);
                            ctx.strokeStyle = '#2d1448';
                            ctx.lineWidth = 1;
                            ctx.strokeRect(px, py, ts, ts);

                            // Arcane corner stones on room perimeter
                            ctx.fillStyle = '#3a1a60';
                            ctx.fillRect(px + 2, py + 2, 4, 4);
                        } else {
                            // Dark Charcoal Coal Chamber Floor
                            ctx.fillStyle = '#190e0c';
                            ctx.fillRect(px, py, ts, ts);
                            ctx.strokeStyle = '#381c14';
                            ctx.lineWidth = 1;
                            ctx.strokeRect(px, py, ts, ts);

                            // Charcoal soot specks
                            ctx.fillStyle = '#28120a';
                            ctx.fillRect(px + 2, py + 2, 4, 4);
                        }
                    } else {
                        // Standard Dungeon Stone Floor
                        ctx.fillStyle = '#0c0712';
                        ctx.fillRect(px, py, ts, ts);

                        // Cobblestone grid line
                        ctx.strokeStyle = '#140c1d';
                        ctx.lineWidth = 1;
                        ctx.strokeRect(px, py, ts, ts);
                    }
                }
            }
        }
    }

    renderFurnace(ctx) {
        const ts = this.maze.tileSize;
        const fx = this.maze.furnacePos.x * ts;
        const fy = this.maze.furnacePos.y * ts;
        const fw = this.maze.furnacePos.w * ts;
        const fh = this.maze.furnacePos.h * ts;

        ctx.fillStyle = '#2b1010';
        ctx.fillRect(fx, fy, fw, fh);
        ctx.strokeStyle = '#5a1d1d';
        ctx.lineWidth = 3;
        ctx.strokeRect(fx, fy, fw, fh);

        ctx.fillStyle = '#060000';
        ctx.fillRect(fx + 12, fy + 16, fw - 24, fh - 24);

        const fireGlow = 0.8 + Math.sin(performance.now() * 0.008) * 0.2;
        ctx.fillStyle = `rgba(255, 80, 0, ${fireGlow})`;
        ctx.shadowBlur = 24;
        ctx.shadowColor = '#ff2200';
        ctx.fillRect(fx + 16, fy + 24, fw - 32, fh - 36);

        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 3;
        for (let gx = fx + 22; gx < fx + fw - 20; gx += 12) {
            ctx.beginPath();
            ctx.moveTo(gx, fy + 20);
            ctx.lineTo(gx, fy + fh - 14);
            ctx.stroke();
        }
    }

    renderProps(ctx) {
        const ts = this.maze.tileSize;
        const now = performance.now() * 0.005;

        // Jack-o'-lanterns
        for (const pumpkin of this.maze.jackOLanterns) {
            const px = (pumpkin.x + 0.5) * ts;
            const py = (pumpkin.y + 0.5) * ts;
            if (px < this.camera.x - 40 || px > this.camera.x + this.canvas.width + 40 ||
                py < this.camera.y - 40 || py > this.camera.y + this.canvas.height + 40) continue;

            ctx.fillStyle = '#d94f00';
            ctx.beginPath();
            ctx.ellipse(px, py, 14, 11, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#305c12';
            ctx.fillRect(px - 2, py - 14, 4, 4);

            const flicker = Math.sin(now + pumpkin.flickerPhase) > 0.2 ? '#ffe066' : '#ff8800';
            ctx.fillStyle = flicker;
            ctx.beginPath();
            ctx.moveTo(px - 6, py - 4);
            ctx.lineTo(px - 2, py - 4);
            ctx.lineTo(px - 4, py - 7);
            ctx.fill();
            ctx.moveTo(px + 2, py - 4);
            ctx.lineTo(px + 6, py - 4);
            ctx.lineTo(px + 4, py - 7);
            ctx.fill();
            ctx.fillRect(px - 6, py + 1, 12, 3);
        }

        for (const lantern of this.maze.wallLanterns) {
            const px = (lantern.x + 0.5 + lantern.wallX * 0.34) * ts;
            const py = (lantern.y + 0.5 + lantern.wallY * 0.34) * ts;
            if (px < this.camera.x - 40 || px > this.camera.x + this.canvas.width + 40 ||
                py < this.camera.y - 40 || py > this.camera.y + this.canvas.height + 40) continue;
            const flicker = 0.75 + Math.sin(now * 2 + lantern.flickerPhase) * 0.2;

            ctx.save();
            ctx.globalAlpha = flicker;

            // Torch handle and wooden shaft
            ctx.strokeStyle = '#5b3420';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(px - 2, py - 6);
            ctx.lineTo(px - 2, py + 12);
            ctx.stroke();

            // Torch base / holder
            ctx.fillStyle = '#2b1a12';
            ctx.fillRect(px - 8, py - 6, 16, 4);
            ctx.strokeStyle = '#92704a';
            ctx.lineWidth = 2;
            ctx.strokeRect(px - 8, py - 6, 16, 4);

            // Flame / fire
            ctx.beginPath();
            ctx.moveTo(px, py - 12);
            ctx.lineTo(px + 6, py - 2);
            ctx.lineTo(px, py + 7);
            ctx.lineTo(px - 6, py - 2);
            ctx.closePath();
            ctx.fillStyle = '#ffb347';
            ctx.shadowBlur = 14;
            ctx.shadowColor = '#ff7f1e';
            ctx.fill();

            ctx.fillStyle = '#ffe9a0';
            ctx.beginPath();
            ctx.moveTo(px, py - 9);
            ctx.lineTo(px + 3, py - 2);
            ctx.lineTo(px, py + 3);
            ctx.lineTo(px - 3, py - 2);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }

        // Skulls, Wall Eyes & Blood Stains
        for (const prop of this.maze.props) {
            const px = (prop.x + 0.5) * ts;
            const py = (prop.y + 0.5) * ts;
            if (px < this.camera.x - 40 || px > this.camera.x + this.canvas.width + 40 ||
                py < this.camera.y - 40 || py > this.camera.y + this.canvas.height + 40) continue;

            if (prop.type === 'skull') {
                ctx.fillStyle = '#a69989';
                ctx.beginPath();
                ctx.arc(px, py, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#100518';
                ctx.fillRect(px - 3, py - 1, 2, 2);
                ctx.fillRect(px + 1, py - 1, 2, 2);
            } else if (prop.type === 'blood_stain') {
                ctx.fillStyle = '#5c0000';
                ctx.beginPath();
                ctx.ellipse(px, py, 12, 8, Math.PI / 4, 0, Math.PI * 2);
                ctx.fill();
            } else if (prop.type === 'wall_eyes') {
                // Creepy demon eyes in wall that blink
                const blink = Math.sin(now * 1.5 + prop.blinkTimer);
                if (blink > 0) {
                    ctx.fillStyle = '#ff1100';
                    ctx.shadowBlur = 8;
                    ctx.shadowColor = '#ff0000';
                    ctx.fillRect(px - 4, py - 1, 2.5, 2.5);
                    ctx.fillRect(px + 2, py - 1, 2.5, 2.5);
                    ctx.shadowBlur = 0;
                }
            }
        }
    }

    renderTeleports(ctx) {
        if (!this.maze || !this.maze.teleports) return;
        const now = performance.now() * 0.0025;

        for (const tele of this.maze.teleports) {
            const tx = tele.worldX;
            const ty = tele.worldY;

            ctx.save();
            ctx.translate(tx, ty);

            // 1. Arcane Portal Floor Rune Base
            const outerRadius = 22;
            ctx.strokeStyle = tele.color;
            ctx.shadowBlur = 14;
            ctx.shadowColor = tele.glow;
            ctx.lineWidth = 2.2;

            // Rotating outer dashed rune circle
            ctx.save();
            ctx.rotate(now * 1.3);
            ctx.beginPath();
            ctx.setLineDash([7, 5]);
            ctx.arc(0, 0, outerRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // Rune spokes
            for (let i = 0; i < 4; i++) {
                const a = (i * Math.PI) / 2;
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * 12, Math.sin(a) * 12);
                ctx.lineTo(Math.cos(a) * outerRadius, Math.sin(a) * outerRadius);
                ctx.stroke();
            }
            ctx.restore();

            // 2. Swirling Inner Arcane Vortex (counter-rotating)
            ctx.save();
            ctx.rotate(-now * 2.2);

            const vortexGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 16);
            vortexGrad.addColorStop(0, '#ffffff');
            vortexGrad.addColorStop(0.35, tele.color);
            vortexGrad.addColorStop(0.85, tele.glow);
            vortexGrad.addColorStop(1, 'rgba(0,0,0,0)');

            ctx.fillStyle = vortexGrad;
            ctx.beginPath();
            ctx.arc(0, 0, 16, 0, Math.PI * 2);
            ctx.fill();

            // Core energy swirl ellipse
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.ellipse(0, 0, 11, 4.5, now * 2.5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            ctx.shadowBlur = 0;
            ctx.restore();
        }
    }

    renderCoalNodes(ctx) {
        const ts = this.maze.tileSize;
        const now = performance.now() * 0.003;

        for (const coal of this.maze.coalNodes) {
            if (!coal.active) continue;

            const cx = (coal.x + 0.5) * ts;
            const cy = (coal.y + 0.5) * ts + Math.sin(now + coal.floatOffset) * 3;

            ctx.fillStyle = '#121214';
            ctx.shadowBlur = 9;
            ctx.shadowColor = '#ff5500';
            ctx.beginPath();
            ctx.arc(cx, cy, 10, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#ff3b00';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx - 5, cy - 3);
            ctx.lineTo(cx + 2, cy + 1);
            ctx.lineTo(cx + 6, cy - 4);
            ctx.stroke();

            ctx.shadowBlur = 0;
        }
    }

    renderPocketUpgrades(ctx) {
        const ts = this.maze.tileSize;
        const now = performance.now() * 0.004;

        for (const upgrade of this.maze.upgradeNodes) {
            if (!upgrade.active) continue;

            const x = (upgrade.x + 0.5) * ts;
            const y = (upgrade.y + 0.5) * ts + Math.sin(now) * 3;
            const pulse = 0.75 + Math.sin(now * 1.5) * 0.25;

            ctx.save();
            ctx.translate(x, y);
            ctx.shadowBlur = 16;
            ctx.shadowColor = '#8cff66';
            ctx.fillStyle = `rgba(88, 160, 62, ${pulse})`;
            ctx.beginPath();
            ctx.arc(0, 0, 13, 0, Math.PI * 2);
            ctx.fill();

            ctx.shadowBlur = 0;
            ctx.fillStyle = '#34251a';
            ctx.fillRect(-8, -7, 16, 16);
            ctx.strokeStyle = '#b7ff8b';
            ctx.lineWidth = 2;
            ctx.strokeRect(-8, -7, 16, 16);
            ctx.beginPath();
            ctx.moveTo(-5, -8);
            ctx.lineTo(-3, -12);
            ctx.lineTo(3, -12);
            ctx.lineTo(5, -8);
            ctx.stroke();

            ctx.restore();
        }
    }

    // Dynamic 2D Lighting Mask
    renderLighting() {
        const lctx = this.lightCtx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        lctx.globalCompositeOperation = 'source-over';
        lctx.fillStyle = '#020004';
        lctx.fillRect(0, 0, w, h);

        lctx.globalCompositeOperation = 'destination-out';

        const screenPX = this.player.x - this.camera.x;
        const screenPY = this.player.y - this.camera.y;

        // 1. Player Lantern Light
        if (this.player.lanternActive) {
            const flicker = Math.sin(performance.now() * 0.02) * 4;

            // Keep the lantern steady when the monster approaches.
            let radius = this.player.lanternRadius + flicker;
            let beamDist = this.player.lanternBeamDist + flicker;
            if (this.player.isHiding) {
                radius *= 0.72;
                beamDist *= 0.75;
            }

            const ambGrad = lctx.createRadialGradient(screenPX, screenPY, 8, screenPX, screenPY, radius);
            ambGrad.addColorStop(0, 'rgba(0, 0, 0, 1.0)');
            ambGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.7)');
            ambGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

            lctx.fillStyle = ambGrad;
            lctx.beginPath();
            lctx.arc(screenPX, screenPY, radius, 0, Math.PI * 2);
            lctx.fill();

            // Forward flashlight beam
            const beamAngle = this.player.angle;
            const spread = this.player.lanternAngleSpread;

            const beamGrad = lctx.createRadialGradient(screenPX, screenPY, 15, screenPX, screenPY, beamDist);
            beamGrad.addColorStop(0, 'rgba(0, 0, 0, 1.0)');
            beamGrad.addColorStop(0.8, 'rgba(0, 0, 0, 0.85)');
            beamGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

            lctx.fillStyle = beamGrad;
            lctx.beginPath();
            lctx.moveTo(screenPX, screenPY);
            lctx.arc(screenPX, screenPY, beamDist, beamAngle - spread / 2, beamAngle + spread / 2);
            lctx.closePath();
            lctx.fill();
        }

        // 2. Furnace Hearth Glow
        const furnaceCenterX = (this.maze.furnacePos.x + this.maze.furnacePos.w / 2) * this.maze.tileSize - this.camera.x;
        const furnaceCenterY = (this.maze.furnacePos.y + this.maze.furnacePos.h / 2) * this.maze.tileSize - this.camera.y;
        const fPulse = Math.sin(performance.now() * 0.007) * 12;
        const furnaceRadius = 230 + fPulse;

        const fGrad = lctx.createRadialGradient(furnaceCenterX, furnaceCenterY, 30, furnaceCenterX, furnaceCenterY, furnaceRadius);
        fGrad.addColorStop(0, 'rgba(0, 0, 0, 1.0)');
        fGrad.addColorStop(0.6, 'rgba(0, 0, 0, 0.8)');
        fGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        lctx.fillStyle = fGrad;
        lctx.beginPath();
        lctx.arc(furnaceCenterX, furnaceCenterY, furnaceRadius, 0, Math.PI * 2);
        lctx.fill();

        // 3. Soft Jack-o'-lantern glow
        for (const pumpkin of this.maze.jackOLanterns) {
            const ppx = (pumpkin.x + 0.5) * this.maze.tileSize - this.camera.x;
            const ppy = (pumpkin.y + 0.5) * this.maze.tileSize - this.camera.y;
            if (ppx < -60 || ppx > w + 60 || ppy < -60 || ppy > h + 60) continue;
            const flicker = Math.sin(performance.now() * 0.01 + pumpkin.flickerPhase) * 3;
            const radius = 42 + flicker;
            const pumpkinGlow = lctx.createRadialGradient(ppx, ppy, 5, ppx, ppy, radius);
            pumpkinGlow.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
            pumpkinGlow.addColorStop(0.65, 'rgba(0, 0, 0, 0.12)');
            pumpkinGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');

            lctx.fillStyle = pumpkinGlow;
            lctx.beginPath();
            lctx.arc(ppx, ppy, radius, 0, Math.PI * 2);
            lctx.fill();
        }

        // 4. Wall torch lights
        for (const lantern of this.maze.wallLanterns) {
            const lx = (lantern.x + 0.5 + lantern.wallX * 0.34) * this.maze.tileSize - this.camera.x;
            const ly = (lantern.y + 0.5 + lantern.wallY * 0.34) * this.maze.tileSize - this.camera.y;
            if (lx < -100 || lx > w + 100 || ly < -100 || ly > h + 100) continue;
            const flicker = Math.sin(performance.now() * 0.012 + lantern.flickerPhase) * 7;
            const radius = 82 + flicker;
            const lanternGlow = lctx.createRadialGradient(lx, ly, 5, lx, ly, radius);
            lanternGlow.addColorStop(0, 'rgba(0, 0, 0, 0.62)');
            lanternGlow.addColorStop(0.55, 'rgba(0, 0, 0, 0.32)');
            lanternGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');

            lctx.fillStyle = lanternGlow;
            lctx.beginPath();
            lctx.arc(lx, ly, radius, 0, Math.PI * 2);
            lctx.fill();
        }

        // 5. Coal nodes glow
        for (const coal of this.maze.coalNodes) {
            if (!coal.active) continue;
            const cx = (coal.x + 0.5) * this.maze.tileSize - this.camera.x;
            const cy = (coal.y + 0.5) * this.maze.tileSize - this.camera.y;
            if (cx < -50 || cx > w + 50 || cy < -50 || cy > h + 50) continue;

            const cGrad = lctx.createRadialGradient(cx, cy, 4, cx, cy, 38);
            cGrad.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
            cGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

            lctx.fillStyle = cGrad;
            lctx.beginPath();
            lctx.arc(cx, cy, 38, 0, Math.PI * 2);
            lctx.fill();
        }

        // 6. Extra pockets upgrades glow
        for (const upgrade of this.maze.upgradeNodes) {
            if (!upgrade.active) continue;
            const ux = (upgrade.x + 0.5) * this.maze.tileSize - this.camera.x;
            const uy = (upgrade.y + 0.5) * this.maze.tileSize - this.camera.y;
            if (ux < -60 || ux > w + 60 || uy < -60 || uy > h + 60) continue;
            const radius = 44 + Math.sin(performance.now() * 0.006) * 5;
            const upgradeGlow = lctx.createRadialGradient(ux, uy, 4, ux, uy, radius);
            upgradeGlow.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
            upgradeGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');

            lctx.fillStyle = upgradeGlow;
            lctx.beginPath();
            lctx.arc(ux, uy, radius, 0, Math.PI * 2);
            lctx.fill();
        }

        // 7. Teleport Portals Mystical Ambient Glow
        if (this.maze && this.maze.teleports) {
            const now = performance.now();
            for (const tele of this.maze.teleports) {
                const tpx = tele.worldX - this.camera.x;
                const tpy = tele.worldY - this.camera.y;

                if (tpx >= -120 && tpx <= w + 120 && tpy >= -120 && tpy <= h + 120) {
                    const tPulse = Math.sin(now * 0.005 + tele.id * 2) * 8;
                    const tr = 68 + tPulse;

                    const tGrad = lctx.createRadialGradient(tpx, tpy, 6, tpx, tpy, tr);
                    tGrad.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
                    tGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.65)');
                    tGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

                    lctx.fillStyle = tGrad;
                    lctx.beginPath();
                    lctx.arc(tpx, tpy, tr, 0, Math.PI * 2);
                    lctx.fill();
                }
            }
        }

        this.ctx.drawImage(this.lightCanvas, 0, 0);
    }

    // Render monster glowing bleeding eyes on top of the pitch black darkness
    renderMonsterEyesGlow() {
        const mx = this.monster.x - this.camera.x + this.monster.jitterX;
        const my = this.monster.y - this.camera.y + this.monster.jitterY;

        this.ctx.save();
        this.ctx.translate(mx, my);
        this.ctx.rotate(this.monster.angle);

        this.ctx.fillStyle = this.monster.eyeColor;
        this.ctx.shadowBlur = this.monster.state === MONSTER_STATES.CHARGING ? 30 : 18;
        this.ctx.shadowColor = this.monster.eyeColor;

        const r = this.monster.radius;
        this.ctx.beginPath();
        this.ctx.ellipse(r * 0.38, -6, 5, 2.8, Math.PI / 8, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.beginPath();
        this.ctx.ellipse(r * 0.38, 6, 5, 2.8, -Math.PI / 8, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.restore();
    }

    loop(timestamp) {
        if (timestamp - this.lastRenderTime < this.frameBudgetMs) {
            requestAnimationFrame((t) => this.loop(t));
            return;
        }

        const frameInterval = timestamp - this.lastRenderTime;
        this.lastRenderTime = timestamp;
        const dt = Math.max(0, Math.min((timestamp - this.lastTime) / 1000, 0.1));
        this.lastTime = timestamp;

        this.update(dt);
        this.render();

        if (this.adaptiveFrameSamples.length < 120) {
            this.adaptiveFrameSamples.push(frameInterval);
        } else {
            const average = this.adaptiveFrameSamples.reduce((sum, value) => sum + value, 0) /
                this.adaptiveFrameSamples.length;
            if (average > 35 && this.targetFps > 30) {
                this.targetFps = 30;
                this.frameBudgetMs = 1000 / this.targetFps;
                this.renderScale = Math.max(0.55, this.renderScale - 0.08);
                this.resize();
            }
            this.adaptiveFrameSamples = [];
        }

        requestAnimationFrame((t) => this.loop(t));
    }

    start() {
        requestAnimationFrame((t) => this.loop(t));
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
    window.game.start();
});
