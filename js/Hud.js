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

        this._buildDom();
    }

    _buildDom() {
        // --- Ecran de sélection --- (inchangé)
        this.selectScreen = document.createElement("div");
        this.selectScreen.id = "levelSelectScreen";
        this.selectScreen.innerHTML = `
            <h1 class="select-title"><span>S</span> BOTS</h1>
            <p class="select-subtitle">Choisissez un niveau</p>
            <div class="levels-grid" id="levelsGrid">
                <p class="levels-loading">CHARGEMENT...</p>
            </div>
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
        return this.botsRemaining;
    }

    // appelé depuis Niveau._botDies()
    botDied() {
        this.botsDead++;
        this.botsRemaining--;
        this._updateBotsDisplay(true);
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

    // ====================== VICTOIRE / ECHEC ======================

    showVictory() {
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
        this.failScreen.style.display = "flex";
        requestAnimationFrame(() => this.failScreen.classList.add("visible"));
    }

    hideFail() {
        this.failScreen.classList.remove("visible");
        setTimeout(() => { this.failScreen.style.display = "none"; }, 300);
    }
}