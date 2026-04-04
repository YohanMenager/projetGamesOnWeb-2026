export default class Porte {
    constructor(scene, position, type = "bot", requiresKey = false, size = { width: 3, height: 4, depth: 0.5 }) {
        this.scene = scene;
        this.type = type;
        this.requiresKey = requiresKey;
        this.isOpen = false;
        this.size = size;
        this.recastObstacle = null;
        this.isAnimating = false;

        // 1. === DÉTERMINATION DE L'ORIENTATION ===
        // On regarde quelle est la dimension la plus longue pour savoir comment diviser
        this.isWideX = this.size.width >= this.size.depth;
        
        // Axe sur lequel les portes glissent pour s'ouvrir
        // Si la porte est large en X, elle doit glisser sur X pour laisser un trou au centre.
        this.mainAxis = this.isWideX ? "x" : "z";
        this.animProperty = "position." + this.mainAxis;

        this.basePosition = position.clone();
        this.basePosition.y = this.size.height / 2;

        // 2. === CRÉATION DES DEUX VANTAUX ===
        const halfSize = { ...this.size };
        if (this.isWideX) halfSize.width /= 2;
        else halfSize.depth /= 2;

        this.partA = BABYLON.MeshBuilder.CreateBox("porte_A_" + type, halfSize, scene);
        this.partB = BABYLON.MeshBuilder.CreateBox("porte_B_" + type, halfSize, scene);

        // Positionnement initial : on les colle au centre
        this.partA.position = this.basePosition.clone();
        this.partB.position = this.basePosition.clone();

        const offset = this.isWideX ? (this.size.width / 4) : (this.size.depth / 4);
        this.partA.position[this.mainAxis] -= offset;
        this.partB.position[this.mainAxis] += offset;

        // Sauvegarde des positions fermées
        this.posClosedA = this.partA.position[this.mainAxis];
        this.posClosedB = this.partB.position[this.mainAxis];

        this.material = new BABYLON.StandardMaterial("porteMat", scene);
        this.setupAppearance();
        this.partA.material = this.partB.material = this.material;

        // 3. === NAVIGATION & INTERACTIONS ===
        this.initNavMeshUpdate();
        this.type === "player" ? this.setupPlayerInteraction() : this.setupBotInteraction();
    }

    initNavMeshUpdate() {
        const check = setInterval(() => {
            if (window.navigationPlugin) {
                this.updateNavMesh();
                clearInterval(check);
            }
        }, 500);
    }

    setupAppearance() {
        if (this.type === "player") this.material.diffuseColor = new BABYLON.Color3(0.2, 0.5, 1);
        else this.material.diffuseColor = this.requiresKey ? new BABYLON.Color3(0.8, 0.1, 0.1) : new BABYLON.Color3(1, 0.6, 0);
    }

    setupPlayerInteraction() {
        [this.partA, this.partB].forEach(mesh => {
            mesh.actionManager = new BABYLON.ActionManager(this.scene);
            mesh.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPickTrigger, () => {
                if (window.isPreparationPhase !== false) this.toggle();
            }));
        });
    }

    setupBotInteraction() {
        this.observer = this.scene.onBeforeRenderObservable.add(() => {
            if (this.isOpen || !this.scene.bots) return;
            for (let bot of this.scene.bots) {
                if (BABYLON.Vector3.Distance(this.basePosition, bot.botMesh.position) < 3.0) {
                    if (!this.requiresKey) this.open();
                    else if (bot.hasKey) { this.consumeKey(bot); this.open(); }
                }
            }
        });
    }

    consumeKey(bot) {
        bot.hasKey = false;
        bot.botMesh.getChildMeshes().forEach(m => { if (m.name === "cle") m.dispose(); });
    }

    toggle() {
        if (this.isAnimating) return;
        this.isOpen ? this.close() : this.open();
    }

    open() {
        if (this.isOpen || this.isAnimating) return;
        this.isAnimating = true;
        this.isOpen = true;

        const slideDistance = this.isWideX ? this.size.width / 2 : this.size.depth / 2;
        this.animateDoor(this.posClosedA - slideDistance, this.posClosedB + slideDistance, false);
    }

    close() {
        if (!this.isOpen || this.isAnimating) return;
        this.isAnimating = true;
        this.isOpen = false;

        this.partA.checkCollisions = this.partB.checkCollisions = true;
        this.animateDoor(this.posClosedA, this.posClosedB, true);
    }

    animateDoor(targetA, targetB, isClosing) {
        const endFrame = 30;
        const animA = new BABYLON.Animation("animA", this.animProperty, 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT);
        const animB = new BABYLON.Animation("animB", this.animProperty, 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT);

        animA.setKeys([{ frame: 0, value: this.partA.position[this.mainAxis] }, { frame: endFrame, value: targetA }]);
        animB.setKeys([{ frame: 0, value: this.partB.position[this.mainAxis] }, { frame: endFrame, value: targetB }]);

        this.partA.animations = [animA];
        this.partB.animations = [animB];

        this.scene.beginAnimation(this.partA, 0, endFrame, false);
        this.scene.beginAnimation(this.partB, 0, endFrame, false, 1, () => {
            this.isAnimating = false;
            if (!isClosing) this.partA.checkCollisions = this.partB.checkCollisions = false;
            this.updateNavMesh();
        });
    }

    updateNavMesh() {
        if (!window.navigationPlugin) return;

        if (this.recastObstacle !== null) {
            window.navigationPlugin.removeObstacle(this.recastObstacle);
            this.recastObstacle = null;
        }

        if (!this.isOpen) {
            const extent = new BABYLON.Vector3(this.size.width / 2, this.size.height / 2, this.size.depth / 2);
            this.recastObstacle = window.navigationPlugin.addBoxObstacle(this.basePosition, extent, 0);
            console.log("NavMesh : Porte bloquée");
        } else {
            console.log("NavMesh : Porte libérée");
        }
    }
}