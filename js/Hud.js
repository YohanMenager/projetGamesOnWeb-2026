export class AudioManager {
    constructor() {
        this._ctx = null;
        this._enabled = true;
    }

    _getCtx() {
        if (!this._ctx) {
            this._ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this._ctx;
    }

    _tone(frequency, type, duration, gain, startDelay = 0) {
        if (!this._enabled) return;
        const ctx = this._getCtx();
        const osc = ctx.createOscillator();
        const vol = ctx.createGain();
        osc.connect(vol);
        vol.connect(ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, ctx.currentTime + startDelay);
        vol.gain.setValueAtTime(gain, ctx.currentTime + startDelay);
        vol.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startDelay + duration);
        osc.start(ctx.currentTime + startDelay);
        osc.stop(ctx.currentTime + startDelay + duration);
    }

    playClick() {
        this._tone(600, "square", 0.06, 0.15);
    }

    playStart() {
        this._tone(330, "sawtooth", 0.08, 0.12, 0.00);
        this._tone(440, "sawtooth", 0.08, 0.12, 0.09);
        this._tone(550, "sawtooth", 0.12, 0.15, 0.18);
    }

    playBotExit() {
        this._tone(880, "sine", 0.15, 0.18, 0.00);
        this._tone(1100, "sine", 0.15, 0.14, 0.12);
    }

    playBotDeath() {
        this._tone(220, "sawtooth", 0.2, 0.15, 0.00);
        this._tone(150, "sawtooth", 0.25, 0.10, 0.10);
    }

    playVictory() {
        [523, 659, 784, 1047].forEach((f, i) => {
            this._tone(f, "sine", 0.25, 0.18, i * 0.12);
        });
    }

    playFail() {
        [330, 277, 220, 185].forEach((f, i) => {
            this._tone(f, "sawtooth", 0.22, 0.13, i * 0.13);
        });
    }

    toggle() {
        this._enabled = !this._enabled;
        return this._enabled;
    }
}

export default class Hud {
    constructor() {
        this.currentLevel = 0;
        this.totalBots = 0;
        this.botsRemaining = 0;
        this.botsExited = 0;
        this.botsDead = 0;
        this.onLevelSelected = null;
        this.onRestart = null;
        this.onLevelSelect = null;
        this.audio = new AudioManager();

        this._buildDom();
    }

    _buildDom() {
        // --- Ecran de sélection ---
        this.selectScreen = document.createElement("div");
        this.selectScreen.id = "levelSelectScreen";
        this.selectScreen.innerHTML = `
            <h1 class="select-title"><span>S</span> BOTS</h1>
            <p class="select-subtitle">Choisissez un niveau</p>
            <div class="levels-grid" id="levelsGrid">
                <p class="levels-loading">CHARGEMENT...</p>
            </div>
            <button class="help-open-btn-prominent" id="helpBtnSelect" aria-label="Manuel de jeu">Manuel de jeu</button>
        `;
        document.body.appendChild(this.selectScreen);

        // --- HUD en jeu ---
        this.hudEl = document.createElement("div");
        this.hudEl.id = "gameHud";
        this.hudEl.innerHTML = `
            <div class="hud-bar">
                <div class="hud-level">
                    <span class="hud-level-label">Niveau</span>
                    <span class="hud-level-number" id="hudLevelNum">01</span>
                </div>
                <div class="hud-bots-icons" id="hudBotsIcons"></div>
                <div class="hud-counters">
                    <div class="hud-counter">
                        <span class="hud-counter-value exited" id="hudExited">0</span>
                        <span class="hud-counter-label">sortis</span>
                    </div>
                    <div class="hud-counter-sep">/</div>
                    <div class="hud-counter">
                        <span class="hud-counter-value dead" id="hudDead">0</span>
                        <span class="hud-counter-label">morts</span>
                    </div>
                    <div class="hud-counter-sep">/</div>
                    <div class="hud-counter">
                        <span class="hud-counter-value total" id="hudTotal">0</span>
                        <span class="hud-counter-label">total</span>
                    </div>
                </div>
                <button class="hud-menu-btn" id="hudMenuBtn">Menu</button>
                <button class="hud-help-btn" id="hudHelpBtn" aria-label="Aide">?</button>
                <button class="hud-sound-btn" id="hudSoundBtn" aria-label="Son">&#9834;</button>
            </div>
        `;
        document.body.appendChild(this.hudEl);

        // --- Ecran de victoire ---
        this.victoryScreen = document.createElement("div");
        this.victoryScreen.id = "victoryScreen";
        this.victoryScreen.innerHTML = `
            <div class="victory-panel">
                <div class="victory-title">NIVEAU COMPLET</div>
                <div class="victory-sub">Tous les bots ont atteint la sortie</div>
                <div class="victory-buttons">
                    <button class="victory-btn" id="victoryRestart">Recommencer</button>
                    <button class="victory-btn primary" id="victorySelect">Sélection</button>
                </div>
            </div>
        `;
        document.body.appendChild(this.victoryScreen);

        // --- Ecran d'échec ---
        this.failScreen = document.createElement("div");
        this.failScreen.id = "failScreen";
        this.failScreen.innerHTML = `
            <div class="fail-panel">
                <div class="fail-title">ÉCHEC</div>
                <div class="fail-sub">Tous les bots ont été éliminés</div>
                <div class="victory-buttons">
                    <button class="victory-btn primary" id="failRestart">Recommencer</button>
                    <button class="victory-btn" id="failSelect">Sélection</button>
                </div>
            </div>
        `;
        document.body.appendChild(this.failScreen);

        // --- Panneau d'aide ---
        this.helpPanel = document.createElement("div");
        this.helpPanel.id = "helpOverlay";
        this.helpPanel.innerHTML = `
            <div class="help-panel" role="dialog" aria-modal="true" aria-label="Aide">
                <button class="help-close-btn" id="helpCloseBtn" aria-label="Fermer">&#x2715;</button>
                <div class="help-header">
                    <span class="help-title-accent">S</span> BOTS
                    <div class="help-title-sub">Manuel de jeu</div>
                </div>

                <div class="help-sections">
                    <section class="help-section">
                        <h3 class="help-section-title">Principe</h3>
                        <p class="help-section-text">Aménagez le niveau durant la phase de préparation pour que les robots atteignent la sortie.</p>
                    </section>

                    <section class="help-section">
                        <h3 class="help-section-title">
                            <span class="help-badge phase-prep">Préparation</span>
                        </h3>
                        <p class="help-section-text">Interagissez avec les éléments du niveau — déplacez des obstacles, ouvrez des portes bleues. Cliquez sur <em>Démarrer</em> quand vous êtes prêt.</p>
                    </section>

                    <section class="help-section">
                        <h3 class="help-section-title">
                            <span class="help-badge phase-sim">Simulation</span>
                        </h3>
                        <p class="help-section-text">Les robots se déplacent automatiquement vers la sortie selon le chemin disponible.</p>
                    </section>

                    <div class="help-divider"></div>

                    <section class="help-section">
                        <h3 class="help-section-title">Éléments du niveau</h3>
                        <ul class="help-elements">
                            <li class="help-element">
                                <span class="help-element-icon obstacle"></span>
                                <div>
                                    <strong>Obstacles</strong>
                                    <span>Pavés oranges transparents. Déplaçables par le joueur en phase de préparation.</span>
                                </div>
                            </li>
                            <li class="help-element">
                                <span class="help-element-icon door-blue"></span>
                                <div>
                                    <strong>Portes bleues</strong>
                                    <span>Ouvertes par le joueur en phase de préparation.</span>
                                </div>
                            </li>
                            <li class="help-element">
                                <span class="help-element-icon door-red"></span>
                                <div>
                                    <strong>Portes rouges</strong>
                                    <span>Ouvertes par les bots s'ils possèdent une clé.</span>
                                </div>
                            </li>
                            <li class="help-element">
                                <span class="help-element-icon door-yellow"></span>
                                <div>
                                    <strong>Portes jaunes</strong>
                                    <span>Ouvertes par les bots sans clé requise.</span>
                                </div>
                            </li>
                            <li class="help-element">
                                <span class="help-element-icon block"></span>
                                <div>
                                    <strong>Blocs</strong>
                                    <span>Poussés par les bots jusqu'à un emplacement prédéfini.</span>
                                </div>
                            </li>
                        </ul>
                    </section>

                    <div class="help-divider"></div>

                    <section class="help-section">
                        <h3 class="help-section-title">Intelligence des bots</h3>
                        <ul class="help-ai-list">
                            <li>Les bots se dirigent automatiquement vers les <strong>clés</strong> ou les <strong>blocs</strong> visibles.</li>
                            <li>Un bot portant une clé se dirige vers les <strong>portes verrouillées</strong> visibles.</li>
                            <li>Une fois leur chemin dégagé, ils avancent vers la <strong>sortie</strong>.</li>
                        </ul>
                    </section>
                </div>
            </div>
        `;
        document.body.appendChild(this.helpPanel);

        // --- Toast d'indice niveau ---
        this.hintEl = document.createElement("div");
        this.hintEl.id = "levelHint";
        this.hintEl.innerHTML = `<span class="hint-icon">i</span><span class="hint-text" id="hintText"></span>`;
        document.body.appendChild(this.hintEl);

        document.getElementById("victoryRestart").addEventListener("click", () => {
            this.hideVictory();
            if (this.onRestart) this.onRestart();
        });
        document.getElementById("victorySelect").addEventListener("click", () => {
            this.hideVictory();
            this.hideHud();
            if (this.onLevelSelect) this.onLevelSelect();
        });
        document.getElementById("failRestart").addEventListener("click", () => {
            this.hideFail();
            if (this.onRestart) this.onRestart();
        });
        document.getElementById("failSelect").addEventListener("click", () => {
            this.hideFail();
            this.hideHud();
            if (this.onLevelSelect) this.onLevelSelect();
        });
        document.getElementById("hudMenuBtn").addEventListener("click", () => {
            if (this.onLevelSelect) this.onLevelSelect();
        });

        document.getElementById("hudHelpBtn").addEventListener("click", () => this.showHelp());
        document.getElementById("helpBtnSelect").addEventListener("click", () => this.showHelp());
        document.getElementById("helpCloseBtn").addEventListener("click", () => this.hideHelp());
        this.helpPanel.addEventListener("click", (e) => {
            if (e.target === this.helpPanel) this.hideHelp();
        });

        document.getElementById("hudSoundBtn").addEventListener("click", () => {
            const on = this.audio.toggle();
            document.getElementById("hudSoundBtn").style.opacity = on ? "1" : "0.3";
        });

        // Sons sur les boutons de navigation principaux
        document.getElementById("victoryRestart").addEventListener("click", () => this.audio.playClick());
        document.getElementById("victorySelect").addEventListener("click", () => this.audio.playClick());
        document.getElementById("failRestart").addEventListener("click", () => this.audio.playClick());
        document.getElementById("failSelect").addEventListener("click", () => this.audio.playClick());
        document.getElementById("hudMenuBtn").addEventListener("click", () => this.audio.playClick());
    }

    // ====================== ECRAN DE SELECTION ====================== (inchangé)

    async showLevelSelect(maxLevels = 20) {
        this.selectScreen.style.display = "flex";
        const grid = document.getElementById("levelsGrid");
        grid.innerHTML = "";

        const found = [];
        for (let i = 1; i <= maxLevels; i++) {
            try {
                const r = await fetch(`../resources/niveaux/lvl_${i}.json`);
                if (!r.ok) break;
                found.push(i);
            } catch { break; }
        }

        if (found.length === 0) {
            grid.innerHTML = `<p class="levels-loading">AUCUN NIVEAU TROUVÉ</p>`;
            return;
        }

        found.forEach(number => {
            const card = document.createElement("div");
            card.className = "level-card";
            card.innerHTML = `
                <div class="level-number">${String(number).padStart(2, "0")}</div>
                <div class="level-label">Niveau</div>
            `;
            card.addEventListener("click", () => {
                this.audio.playClick();
                this.hideLevelSelect();
                if (this.onLevelSelected) this.onLevelSelected(number);
            });
            grid.appendChild(card);
        });
    }

    hideLevelSelect() {
        this.selectScreen.style.display = "none";
    }

    // ====================== HUD EN JEU ======================

    showHud(levelNumber, totalBots) {
        this.currentLevel = levelNumber;
        this.totalBots = totalBots;
        this.botsRemaining = totalBots;
        this.botsExited = 0;
        this.botsDead = 0;

        document.getElementById("hudLevelNum").textContent = String(levelNumber).padStart(2, "0");
        document.getElementById("hudTotal").textContent = totalBots;
        this._updateBotsDisplay();
        this.hudEl.style.display = "block";
    }

    hideHud() {
        this.hudEl.style.display = "none";
    }

    // Appelé depuis Niveau._botExits()
    botReachedExit() {
        this.botsExited++;
        this.botsRemaining--;
        this._updateBotsDisplay(true);
        this.audio.playBotExit();
        return this.botsRemaining;
    }

    // appelé depuis Niveau._botDies()
    botDied() {
        this.botsDead++;
        this.botsRemaining--;
        this._updateBotsDisplay(true);
        this.audio.playBotDeath();
        return this.botsRemaining;
    }

    _updateBotsDisplay(animate = false) {
        const exitedEl = document.getElementById("hudExited");
        const deadEl = document.getElementById("hudDead");
        const iconsEl = document.getElementById("hudBotsIcons");

        exitedEl.textContent = this.botsExited;
        deadEl.textContent = this.botsDead;

        if (animate) {
            exitedEl.classList.add("updated");
            deadEl.classList.add("updated");
            setTimeout(() => {
                exitedEl.classList.remove("updated");
                deadEl.classList.remove("updated");
            }, 600);
        }

        // Icônes : blanc = vivant, vert = sorti, rouge = mort
        iconsEl.innerHTML = "";
        for (let i = 0; i < this.totalBots; i++) {
            const icon = document.createElement("div");
            if (i < this.botsExited) {
                icon.className = "bot-icon exited";
            } else if (i < this.botsExited + this.botsDead) {
                icon.className = "bot-icon dead";
            } else {
                icon.className = "bot-icon alive";
            }
            iconsEl.appendChild(icon);
        }
    }

    // ====================== INDICE NIVEAU ======================

    showHint(text) {
        if (this._hintTimeout) clearTimeout(this._hintTimeout);
        document.getElementById("hintText").textContent = text;
        this.hintEl.classList.remove("hiding");
        this.hintEl.classList.add("visible");
        // this._hintTimeout = setTimeout(() => this.hideHint(), 5000);
    }

    hideHint() {
        this.hintEl.classList.add("hiding");
        setTimeout(() => {
            this.hintEl.classList.remove("visible", "hiding");
        }, 500);
    }

    // ====================== AIDE ======================

    showHelp() {
        this.helpPanel.style.display = "flex";
        requestAnimationFrame(() => this.helpPanel.classList.add("visible"));
    }

    hideHelp() {
        this.helpPanel.classList.remove("visible");
        setTimeout(() => { this.helpPanel.style.display = "none"; }, 300);
    }

    // ====================== VICTOIRE / ECHEC ======================

    showVictory() {
        this.audio.playVictory();
        const sub = this.victoryScreen.querySelector(".victory-sub");
        if (sub) {
            sub.textContent = this.botsExited === this.totalBots
                ? "Tous les bots ont atteint la sortie"
                : `${this.botsExited} bot${this.botsExited > 1 ? "s ont" : " a"} atteint la sortie sur ${this.totalBots}`;
        }
        this.victoryScreen.style.display = "flex";
        requestAnimationFrame(() => this.victoryScreen.classList.add("visible"));
    }

    hideVictory() {
        this.victoryScreen.classList.remove("visible");
        setTimeout(() => { this.victoryScreen.style.display = "none"; }, 300);
    }

    showFail() {
        this.audio.playFail();
        this.failScreen.style.display = "flex";
        requestAnimationFrame(() => this.failScreen.classList.add("visible"));
    }

    hideFail() {
        this.failScreen.classList.remove("visible");
        setTimeout(() => { this.failScreen.style.display = "none"; }, 300);
    }
}