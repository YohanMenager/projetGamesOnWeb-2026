/**
 * SoundManager.js
 * Gère tous les sons du jeu
 */
export default class SoundManager {
    constructor() {
        this.sounds = {};
        this.loopingSounds = {}; // Pour les musiques en boucle
        this.soundsPath = "./resources/sounds/";
        
        // Configuration des sons
        this.soundConfig = {
            "block-pickup": { volume: 0.5, loop: false },
            "block-putdown": { volume: 0.5, loop: false },
            "game-over": { volume: 0.7, loop: false },
            "key": { volume: 0.6, loop: false },
            "menu-music": { volume: 0.4, loop: true },
            "music": { volume: 0.4, loop: true },
            "robot-die": { volume: 0.6, loop: false },
            "victory": { volume: 0.7, loop: false }
        };
    }

    /**
     * Initialise tous les sons (à appeler au démarrage du jeu)
     */
    async init() {
        console.log("Initialisation du SoundManager...");
        
        // Créer les éléments audio pour chaque son
        for (const [soundName, config] of Object.entries(this.soundConfig)) {
            const audio = new Audio();
            audio.src = this.soundsPath + soundName + ".mp3";
            audio.volume = config.volume;
            audio.preload = "auto";
            
            this.sounds[soundName] = {
                element: audio,
                config: config,
                isPlaying: false
            };
        }
        
        console.log("SoundManager initialisé !");
    }

    /**
     * Joue un son
     * @param {string} soundName - Nom du son à jouer
     * @param {boolean} force - Force la relecture si déjà en cours (par défaut false)
     */
    play(soundName, force = false) {
        if (!this.sounds[soundName]) {
            console.warn(`[SoundManager] Son '${soundName}' introuvable`);
            return;
        }

        const soundData = this.sounds[soundName];
        const audio = soundData.element;

        // Si c'est une musique en boucle, la stopper proprement avant de relancer
        if (soundData.config.loop && soundData.isPlaying && !force) {
            return; // Déjà en cours, ne pas relancer
        }

        // Si force ou si ce n'est pas une musique, relancer depuis le début
        if (force || !soundData.config.loop) {
            audio.currentTime = 0;
        }

        audio.play().catch(error => {
            console.error(`[SoundManager] Erreur lors de la lecture de '${soundName}':`, error);
        });

        soundData.isPlaying = true;
        audio.onended = () => {
            if (!soundData.config.loop) {
                soundData.isPlaying = false;
            }
        };
    }

    /**
     * Arrête un son
     * @param {string} soundName - Nom du son à arrêter
     */
    stop(soundName) {
        if (!this.sounds[soundName]) {
            console.warn(`[SoundManager] Son '${soundName}' introuvable`);
            return;
        }

        const soundData = this.sounds[soundName];
        soundData.element.pause();
        soundData.element.currentTime = 0;
        soundData.isPlaying = false;
    }

    /**
     * Arrête tous les sons
     */
    stopAll() {
        for (const soundName in this.sounds) {
            this.stop(soundName);
        }
    }

    /**
     * Change le volume d'un son
     * @param {string} soundName - Nom du son
     * @param {number} volume - Volume (0 à 1)
     */
    setVolume(soundName, volume) {
        if (!this.sounds[soundName]) {
            console.warn(`[SoundManager] Son '${soundName}' introuvable`);
            return;
        }

        this.sounds[soundName].element.volume = Math.max(0, Math.min(1, volume));
    }

    /**
     * Change le volume de tous les sons
     * @param {number} masterVolume - Volume général (0 à 1)
     */
    setMasterVolume(masterVolume) {
        for (const soundName in this.sounds) {
            const config = this.soundConfig[soundName];
            this.sounds[soundName].element.volume = config.volume * masterVolume;
        }
    }

    /**
     * Retourne l'état de lecture d'un son
     * @param {string} soundName - Nom du son
     * @returns {boolean} true si le son est en cours de lecture
     */
    isPlaying(soundName) {
        if (!this.sounds[soundName]) return false;
        return this.sounds[soundName].isPlaying;
    }

    /**
     * Arrête les musiques de fond (menu-music ou music)
     */
    stopBackgroundMusic() {
        this.stop("menu-music");
        this.stop("music");
    }

    /**
     * Joue la musique du menu
     */
    playMenuMusic() {
        this.stopBackgroundMusic();
        this.play("menu-music");
    }

    /**
     * Joue la musique du niveau
     */
    playLevelMusic() {
        this.stopBackgroundMusic();
        this.play("music");
    }
}
