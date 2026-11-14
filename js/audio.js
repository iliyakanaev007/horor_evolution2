// Web Audio API Procedural Sound & Horror Music Engine
// 100% self-contained, synthesizes ambient soundtrack, dynamic chase music, and bone-chilling jumpscares

class SoundEngine {
    constructor() {
        this.ctx = null;
        this.isMuted = false;
        this.initialized = false;
        
        // Master Gain
        this.masterGain = null;
        this.musicGain = null;
        this.sfxGain = null;

        // Ambient Drone & Wind
        this.windGain = null;
        this.windFilter = null;

        // Dynamic Music Engine
        this.musicPlaying = false;
        this.musicTrackTimer = null;
        this.musicStep = 0;
        this.chaseIntensity = 0; // 0.0 (calm ambient) to 1.0 (terror chase)
        this.drumTimer = null;

        // Heartbeat
        this.lastHeartbeatTime = 0;
        this.currentHeartbeatBpm = 60;
    }

    init() {
        if (this.initialized) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();

            // Master buses
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.85;
            this.masterGain.connect(this.ctx.destination);

            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.value = 0.45;
            this.musicGain.connect(this.masterGain);

            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = 0.8;
            this.sfxGain.connect(this.masterGain);

            this.initAmbient();
            this.startHorrorSoundtrack();

            this.initialized = true;
        } catch (e) {
            console.warn("Web Audio API not supported or blocked", e);
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.masterGain) {
            this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.85, this.ctx.currentTime);
        }
        return this.isMuted;
    }

    // --- Ambient Wind & Deep Drone ---
    initAmbient() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // Sub-bass ominous drone
        const droneOsc = this.ctx.createOscillator();
        const droneGain = this.ctx.createGain();
        droneOsc.type = 'sawtooth';
        droneOsc.frequency.setValueAtTime(48, now); // Low G
        
        const droneFilter = this.ctx.createBiquadFilter();
        droneFilter.type = 'lowpass';
        droneFilter.frequency.setValueAtTime(95, now);

        droneGain.gain.setValueAtTime(0.12, now);

        droneOsc.connect(droneFilter);
        droneFilter.connect(droneGain);
        droneGain.connect(this.masterGain);
        droneOsc.start();

        // White noise howling wind
        const bufferSize = this.ctx.sampleRate * 2;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        const whiteNoise = this.ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;

        this.windFilter = this.ctx.createBiquadFilter();
        this.windFilter.type = 'bandpass';
        this.windFilter.frequency.setValueAtTime(280, now);
        this.windFilter.Q.setValueAtTime(4, now);

        this.windGain = this.ctx.createGain();
        this.windGain.gain.setValueAtTime(0.06, now);

        whiteNoise.connect(this.windFilter);
        this.windFilter.connect(this.windGain);
        this.windGain.connect(this.masterGain);
        whiteNoise.start();

        this.modulateWind();
    }

    modulateWind() {
        if (!this.ctx || !this.windFilter) return;
        const now = this.ctx.currentTime;
        const nextFreq = 160 + Math.random() * 300;
        const nextGain = 0.03 + Math.random() * 0.07;
        const duration = 2.5 + Math.random() * 3.5;

        this.windFilter.frequency.linearRampToValueAtTime(nextFreq, now + duration);
        this.windGain.gain.linearRampToValueAtTime(nextGain, now + duration);

        setTimeout(() => this.modulateWind(), duration * 1000);
    }

    // --- PROCEDURAL HORROR MUSIC SOUNDTRACK ---
    // Seamlessly transitions between creepy ambient music box / string drones and intense terror chase music
    startHorrorSoundtrack() {
        if (this.musicPlaying) return;
        this.musicPlaying = true;
        this.playMusicStep();
    }

    setChaseIntensity(intensity) {
        // intensity: 0.0 (calm) to 1.0 (hunting / charging)
        this.chaseIntensity = Math.max(0, Math.min(1, intensity));
    }

    playMusicStep() {
        if (!this.musicPlaying || !this.ctx || this.isMuted) {
            setTimeout(() => this.playMusicStep(), 500);
            return;
        }

        const now = this.ctx.currentTime;
        const isChase = this.chaseIntensity > 0.35;

        if (isChase) {
            // === TERROR CHASE MUSIC ===
            // Fast industrial pounding heartbeat drum + screeching horror stabs
            this.playChaseDrum(now);
            if (this.musicStep % 2 === 0) {
                this.playHorrorScreechNote(now);
            }
            if (this.musicStep % 4 === 0) {
                this.playSubDropBass(now);
            }
            this.musicStep++;
            setTimeout(() => this.playMusicStep(), 280); // ~214 BPM frantic tempo!
        } else {
            // === EERIE AMBIENT MUSIC BOX / CELLO THEME ===
            // Chilling discordant notes in a dark minor scale: [D, Eb, G, Ab, C, Bb]
            const notes = [146.83, 155.56, 196.00, 207.65, 261.63, 293.66, 311.13, 392.00];
            const note = notes[Math.floor(Math.random() * notes.length)];
            
            this.playMusicBoxNote(now, note);
            
            // Distant cello drone every few steps
            if (this.musicStep % 6 === 0) {
                this.playCelloDrone(now, notes[0] / 2);
            }

            this.musicStep++;
            const delay = 900 + Math.random() * 800; // Unpredictable creepy timing
            setTimeout(() => this.playMusicStep(), delay);
        }
    }

    // Creepy music box note
    playMusicBoxNote(t, freq) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);

        // Slightly detuned chime harmonic
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(freq * 2.02, t);

        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 1.8);

        gain2.gain.setValueAtTime(0.08, t);
        gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

        osc.connect(gain);
        osc2.connect(gain2);
        gain.connect(this.musicGain);
        gain2.connect(this.musicGain);

        osc.start(t);
        osc2.start(t);
        osc.stop(t + 1.85);
        osc2.stop(t + 0.85);
    }

    // Low eerie cello drone
    playCelloDrone(t, freq) {
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(180, t);
        filter.frequency.linearRampToValueAtTime(260, t + 2.0);
        filter.frequency.linearRampToValueAtTime(140, t + 4.0);

        gain.gain.setValueAtTime(0.01, t);
        gain.gain.linearRampToValueAtTime(0.18, t + 1.2);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 4.2);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicGain);

        osc.start(t);
        osc.stop(t + 4.3);
    }

    // Chase war drum / heavy industrial kick
    playChaseDrum(t) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, t);
        osc.frequency.exponentialRampToValueAtTime(32, t + 0.18);

        const vol = 0.5 + this.chaseIntensity * 0.4;
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

        osc.connect(gain);
        gain.connect(this.musicGain);

        osc.start(t);
        osc.stop(t + 0.21);
    }

    // High horror violin screech (Psycho shower scene style dissonant stabs)
    playHorrorScreechNote(t) {
        const freqs = [880, 932, 1174, 1244]; // Extremely dissonant cluster
        freqs.forEach(f => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(f + (Math.random() - 0.5) * 20, t);

            gain.gain.setValueAtTime(0.12 * this.chaseIntensity, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

            osc.connect(gain);
            gain.connect(this.musicGain);

            osc.start(t);
            osc.stop(t + 0.23);
        });
    }

    // Low Sub-Drop Bass for chase impact
    playSubDropBass(t) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(90, t);
        osc.frequency.exponentialRampToValueAtTime(25, t + 0.6);

        gain.gain.setValueAtTime(0.45 * this.chaseIntensity, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

        osc.connect(gain);
        gain.connect(this.musicGain);

        osc.start(t);
        osc.stop(t + 0.62);
    }

    // --- Dynamic Heartbeat ---
    updateHeartbeat(dangerRatio) {
        if (!this.ctx || this.isMuted) return;
        if (dangerRatio <= 0.05) return;

        const bpm = 60 + dangerRatio * 120; // 60 to 180 BPM
        this.currentHeartbeatBpm = bpm;

        const interval = (60 / bpm) * 1000;
        const now = performance.now();

        if (now - this.lastHeartbeatTime >= interval) {
            this.lastHeartbeatTime = now;
            this.playHeartbeatSound(dangerRatio);
        }
    }

    playHeartbeatSound(dangerRatio) {
        if (!this.ctx || this.isMuted) return;
        const t = this.ctx.currentTime;
        const volume = 0.35 + dangerRatio * 0.65;

        // Lub
        const osc1 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(65, t);
        osc1.frequency.exponentialRampToValueAtTime(32, t + 0.12);

        gain1.gain.setValueAtTime(volume, t);
        gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

        osc1.connect(gain1);
        gain1.connect(this.sfxGain);
        osc1.start(t);
        osc1.stop(t + 0.13);

        // Dub
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(80, t + 0.12);
        osc2.frequency.exponentialRampToValueAtTime(38, t + 0.24);

        gain2.gain.setValueAtTime(volume * 0.85, t + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

        osc2.connect(gain2);
        gain2.connect(this.sfxGain);
        osc2.start(t + 0.12);
        osc2.stop(t + 0.25);
    }

    // --- Footsteps ---
    playFootstep(isSprinting) {
        if (!this.ctx || this.isMuted) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(isSprinting ? 95 : 65, t);
        osc.frequency.exponentialRampToValueAtTime(28, t + 0.08);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(isSprinting ? 420 : 250, t);

        const vol = isSprinting ? 0.4 : 0.2;
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(t);
        osc.stop(t + 0.09);
    }

    playTrapTrigger() {
        if (!this.ctx || this.isMuted) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'square';
        osc.frequency.setValueAtTime(780, t);
        osc.frequency.exponentialRampToValueAtTime(150, t + 0.12);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1800, t);
        gain.gain.setValueAtTime(0.35, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.17);
    }

    playTrapReset() {
        if (!this.ctx || this.isMuted) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(240, t);
        osc.frequency.exponentialRampToValueAtTime(520, t + 0.08);
        gain.gain.setValueAtTime(0.16, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.14);
    }

    // --- Coal Pickup ---
    playCoalPickup() {
        if (!this.ctx || this.isMuted) return;
        const t = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, t);
        osc.frequency.exponentialRampToValueAtTime(560, t + 0.06);
        osc.frequency.exponentialRampToValueAtTime(220, t + 0.2);

        gain.gain.setValueAtTime(0.45, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.21);
    }

    // --- Furnace Stoke ---
    playFurnaceStoke() {
        if (!this.ctx || this.isMuted) return;
        const t = this.ctx.currentTime;

        const bufferSize = this.ctx.sampleRate * 0.9;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(120, t);
        filter.frequency.exponentialRampToValueAtTime(950, t + 0.3);
        filter.frequency.exponentialRampToValueAtTime(200, t + 0.85);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.65, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.85);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        noise.start(t);
        noise.stop(t + 0.9);

        // Sub blast
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(95, t);
        osc.frequency.exponentialRampToValueAtTime(35, t + 0.5);

        oscGain.gain.setValueAtTime(0.55, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

        osc.connect(oscGain);
        oscGain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.52);
    }

    // --- Monster Sniff (Level 3 Ability) ---
    playMonsterSniff() {
        if (!this.ctx || this.isMuted) return;
        const t = this.ctx.currentTime;
        this._synthesizeInhale(t, 0.22);
        this._synthesizeInhale(t + 0.28, 0.3);
    }

    _synthesizeInhale(startTime, duration) {
        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(320, startTime);
        filter.frequency.exponentialRampToValueAtTime(1550, startTime + duration);
        filter.Q.setValueAtTime(5, startTime);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.01, startTime);
        gain.gain.linearRampToValueAtTime(0.55, startTime + duration * 0.7);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        noise.start(startTime);
        noise.stop(startTime + duration + 0.05);
    }

    // --- Monster Growl / Hunting Roar ---
    playMonsterGrowl() {
        if (!this.ctx || this.isMuted) return;
        const t = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, t);
        osc.frequency.linearRampToValueAtTime(55, t + 0.8);

        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(84, t);
        osc2.frequency.linearRampToValueAtTime(52, t + 0.8);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500, t);
        filter.frequency.exponentialRampToValueAtTime(160, t + 0.8);

        gain.gain.setValueAtTime(0.55, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.85);

        osc.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(t);
        osc2.start(t);
        osc.stop(t + 0.9);
        osc2.stop(t + 0.9);
    }

    // --- Teleport / Blink ---
    playTeleport() {
        if (!this.ctx || this.isMuted) return;
        const t = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(900, t);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.45);

        gain.gain.setValueAtTime(0.6, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.51);
    }

    // --- Shadow Stealth Cloak (Ctrl) ---
    playShadowCloak(active) {
        if (!this.ctx || this.isMuted) return;
        const t = this.ctx.currentTime;

        // Subtle dark whisper / low whoosh
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'sine';
        if (active) {
            osc.frequency.setValueAtTime(140, t);
            osc.frequency.exponentialRampToValueAtTime(45, t + 0.35);
        } else {
            osc.frequency.setValueAtTime(45, t);
            osc.frequency.exponentialRampToValueAtTime(120, t + 0.3);
        }

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(240, t);

        gain.gain.setValueAtTime(0.28, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(t);
        osc.stop(t + 0.38);
    }

    // --- BONE-CHILLING FULLSCREEN JUMPSCARE SOUND ---
    // Multi-layered blast: ear-piercing high frequency screech + distorted noise blast + bone crunch + sub impact
    playJumpscare() {
        if (!this.ctx || this.isMuted) return;
        const t = this.ctx.currentTime;

        // 1. Extreme high screech cluster (FM-modulated dissonant screams)
        const freqs = [380, 430, 520, 710, 890, 1340];
        freqs.forEach(freq => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, t);
            osc.frequency.linearRampToValueAtTime(freq * 1.8, t + 0.15);
            osc.frequency.exponentialRampToValueAtTime(60, t + 1.8);

            gain.gain.setValueAtTime(0.4, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 1.8);

            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(t);
            osc.stop(t + 1.85);
        });

        // 2. White noise roaring explosion
        const bufferSize = this.ctx.sampleRate * 1.5;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1200, t);
        filter.frequency.exponentialRampToValueAtTime(300, t + 1.2);
        filter.Q.setValueAtTime(2, t);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.8, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterGain);

        noise.start(t);
        noise.stop(t + 1.5);

        // 3. Sub-bass massive thud
        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(160, t);
        subOsc.frequency.exponentialRampToValueAtTime(20, t + 0.8);

        subGain.gain.setValueAtTime(0.9, t);
        subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.85);

        subOsc.connect(subGain);
        subGain.connect(this.masterGain);

        subOsc.start(t);
        subOsc.stop(t + 0.9);
    }

    // --- Level Up Chime ---
    playLevelUp() {
        if (!this.ctx || this.isMuted) return;
        const t = this.ctx.currentTime;
        const notes = [220, 277, 330, 440, 554];

        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t + idx * 0.08);

            gain.gain.setValueAtTime(0.25, t + idx * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 1.6);

            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(t + idx * 0.08);
            osc.stop(t + idx * 0.08 + 1.65);
        });
    }
}

window.soundEngine = new SoundEngine();
