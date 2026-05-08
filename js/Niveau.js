import Bot from "./Bot.js";
import Obstacle from "./Objets/Obstacle.js";
import Bloc from "./Objets/Bloc.js";
import Porte from "./Objets/Porte.js";
import Ennemi from "./Objets/Ennemi.js";
import Cle from "./Objets/Cle.js";

export default class Niveau {
    constructor(scene, levelData) {
        this.scene = scene;
        this.levelData = levelData;
        this.staticMeshes = [];
        this.interactables = [];
        this.scene.bots = [];
        this.scene.ennemis = [];
        this.collisionMeshes = [];

        this.navigationPlugin = null;
        this.crowd = null;
        this.navMeshDebug = null;
        this._stagnationTimer = 0;
        this._stagnationThreshold = 5; // secondes
        this._lastBotPositions = new Map(); // bot.id -> { x, z }

        // Zone de sortie (AABB pour détection)
        this._exitZone = null; // { x, z, hw, hd } demi-largeurs
    }

async build() {
    console.log("=== Création du Niveau ===");
    this.scene.currentLevel = this;

    this.buildEnvironment();
    this.buildInteractables();

    await this.loadModels();

    await this.initNavMesh();

    this.spawnBots();
    this.spawnEnnemis();

    this.isPreparationPhase = true;
}

    buildEnvironment() {
        const size = this.levelData.size;

        const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: size, height: size }, this.scene);
        const groundMat = new BABYLON.PBRMaterial("gMat", this.scene);
        groundMat.albedoColor = new BABYLON.Color3(0.1, 0.1, 0.12);
        ground.material = groundMat;
        ground.isPickable = true;
        this.staticMeshes.push(ground);

        const rampeMat = new BABYLON.StandardMaterial("rampMat", this.scene);
        rampeMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
        rampeMat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);

        this.createWall("wN", size, 1, 0, -size / 2);
        this.createWall("wS", size, 1, 0, size / 2);
        this.createWall("wW", 1, size, -size / 2, 0);
        this.createWall("wE", 1, size, size / 2, 0);

        if (this.levelData.walls) {
            this.levelData.walls.forEach(w => {
                this.createWall(w.name, w.width, w.depth, w.x, w.z);
            });
        }

        if (this.levelData.exit) {
            const e = this.levelData.exit;
            const exitZone = BABYLON.MeshBuilder.CreateBox("exitZone", { width: e.width, height: 0.1, depth: e.depth }, this.scene);
            exitZone.position.set(e.x, 0.05, e.z);
            const exitMat = new BABYLON.StandardMaterial("eMat", this.scene);
            exitMat.diffuseColor = new BABYLON.Color3(0, 1, 0);
            exitZone.material = exitMat;
            this.staticMeshes.push(exitZone);

            // On mémorise la zone de sortie pour la détection
            this._exitZone = {
                x: e.x,
                z: e.z,
                hw: e.width / 2,
                hd: e.depth / 2
            };
        }

        if (this.levelData.platforms) {
            this.levelData.platforms.forEach(p => {
                const plat = BABYLON.MeshBuilder.CreateBox(p.name, { width: p.width, height: p.y, depth: p.depth }, this.scene);
                plat.material = rampeMat;
                plat.material.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.5);
                plat.position.set(p.x, p.y / 2, p.z);
                plat.isPickable = true;
                this.staticMeshes.push(plat);
                this.collisionMeshes.push(plat);
            });
        }

        if (this.levelData.ramps) {
            this.levelData.ramps.forEach(r => {
                const ramp = BABYLON.MeshBuilder.CreateBox(r.name, { width: r.width, height: r.height, depth: r.depth * 1.1 }, this.scene);
                ramp.isPickable = true;
                ramp.position.set(r.x, r.y || 0, r.z);
                ramp.rotation.x = Math.atan(r.height / r.depth);
                if (r.rotationY) ramp.rotation.y = r.rotationY;
                ramp.refreshBoundingInfo();
                ramp.computeWorldMatrix(true);
                ramp.bakeCurrentTransformIntoVertices();
                ramp.refreshBoundingInfo();
                this.staticMeshes.push(ramp);
                this.collisionMeshes.push(ramp);
            });
        }
    }

    createWall(name, w, d, x, z) {
        const wall = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: 3, depth: d }, this.scene);
        wall.position.set(x, 1.5, z);
        wall.isPickable = true;
        this.staticMeshes.push(wall);
        this.collisionMeshes.push(wall);
    }

    buildInteractables() {
        if (!this.levelData.interactables) return;

        this.levelData.interactables.forEach(item => {
            let obj;
            switch (item.type) {
                case "obstacle":
                    obj = new Obstacle(this.scene, new BABYLON.Vector3(item.x, 0, item.z), { width: item.width, height: 2, depth: item.depth }, 20);
                    break;
                case "porte":
                    obj = new Porte(this.scene, new BABYLON.Vector3(item.x, 0, item.z), item.owner || "player", item.requiresKey || false, { width: item.width, height: 2.5, depth: item.depth });
                    break;
                case "bloc":
                    obj = new Bloc(
                        this.scene,
                        new BABYLON.Vector3(item.startX, item.startY || 0, item.startZ),
                        new BABYLON.Vector3(item.targetX, item.targetY || 0, item.targetZ),
                        { width: item.width, height: item.height || 2, depth: item.depth }
                    );
                    break;
                case "cle":
                    obj = new Cle(this.scene, new BABYLON.Vector3(item.x, 0, item.z));
                    break;
            }
            if (obj) this.interactables.push(obj);
            if (obj && obj.mesh) this.collisionMeshes.push(obj.mesh);
        });
    }

    async initNavMesh() {
        if (!window.navigationPlugin) {
            window.navigationPlugin = new BABYLON.RecastJSPlugin();
        }
        this.navigationPlugin = window.navigationPlugin;

        const navMeshParameters = {
            cs: 0.1, ch: 0.1,
            walkableSlopeAngle: 60,
            walkableHeight: 1.0,
            walkableClimb: 2.0,
            walkableRadius: 0.3,  
            maxEdgeLen: 12,
            maxSimplificationError: 1.3, minRegionArea: 4,
            mergeRegionArea: 20, maxVertsPerPoly: 6,
            detailSampleDist: 6, detailSampleMaxError: 1,
            borderSize: 1, tileSize: 64
        };

        this.navigationPlugin.createNavMesh(this.staticMeshes, navMeshParameters);
        this.crowd = this.navigationPlugin.createCrowd(10, 0.5, this.scene);
    }

    spawnBots() {
        if (!this.levelData.bots) return;

        this.levelData.bots.forEach((bData, index) => {
            const root = new BABYLON.TransformNode("robotRoot_" + index, this.scene);

            //  Position AVANT la boucle de clonage
            root.position = new BABYLON.Vector3(bData.startX, bData.startY || 0, bData.startZ);

            const clonedMeshes = [];

            this.loadedModels.robot.meshes.forEach(mesh => {
                if (mesh instanceof BABYLON.TransformNode && !(mesh instanceof BABYLON.Mesh)) return;
                const clone = mesh.clone(mesh.name + "_clone_" + index);
                if (!clone) return;
                clone.parent = root;
                clone.setEnabled(true)
                clone.isPickable = false;
                clone.alwaysSelectAsActiveMesh = true;
                clonedMeshes.push(clone);
            });

            //  Scaling appliqué UNE FOIS, après la boucle, sur les bons clones
            // Dans spawnBots, après la boucle de clonage :
            clonedMeshes.forEach(m => {
                m.scaling.setAll(0.01);
                m.rotation.y = Math.PI; // corrige l'inversion
            });

            const hitbox = BABYLON.MeshBuilder.CreateBox("botHitbox_" + index,
                { width: 1, height: 2, depth: 1 }, this.scene);
            hitbox.isVisible = false;
            hitbox.isPickable = true;
            hitbox.position.copyFrom(root.position);

            const animations = {};
            this.loadedModels.robot.animationGroups.forEach(anim => {
                animations[anim.name] = anim.clone(anim.name + "_" + index);
            });

            const bot = new Bot(root, hitbox, animations, bData.id, 0.30, 1,
                this.scene, this.navigationPlugin, this.crowd,
                new BABYLON.Vector3(this.levelData.exit.x, this.levelData.exit.y || 0, this.levelData.exit.z));

            hitbox.Bot = bot;
            this.scene.bots.push(bot);
        });
    }

    spawnEnnemis() {
        if (!this.levelData.enemies) return;

        this.levelData.enemies.forEach((eData, index) => {
            const root = new BABYLON.TransformNode("enemyRoot_" + index, this.scene);

            //  Position AVANT la boucle de clonage
            root.position = new BABYLON.Vector3(eData.startX, eData.startY || 0, eData.startZ);

            const clonedMeshes = [];

            this.loadedModels.ennemi.meshes.forEach(mesh => {
                if (mesh instanceof BABYLON.TransformNode && !(mesh instanceof BABYLON.Mesh)) return;
                const clone = mesh.clone(mesh.name + "_clone_" + index);
                if (!clone) return;
                clone.parent = root;
                clone.setEnabled(true)
                clone.isPickable = false;
                clone.alwaysSelectAsActiveMesh = true;
                clonedMeshes.push(clone);
            });

            //  Scaling appliqué 
            clonedMeshes.forEach(m => {
                m.scaling.setAll(0.2);
                m.rotation.y = Math.PI;
                m.rotation.x = Math.PI / 2;           
            });

            const hitbox = BABYLON.MeshBuilder.CreateBox("enemyHitbox_" + index,
                { width: 0.8, height: 1, depth: 0.8 }, this.scene);
            hitbox.isVisible = false;
            hitbox.isPickable = true;
            hitbox.position.copyFrom(root.position);

            const animations = {};
            this.loadedModels.ennemi.animationGroups.forEach(anim => {
                animations[anim.name] = anim.clone(anim.name + "_" + index);
            });

            const patrolPoints = (eData.patrolPoints || []).map(
                p => new BABYLON.Vector3(p.x, 0, p.z));

            const ennemi = new Ennemi(root, hitbox, animations, eData.id,
                eData.speed || 0.4, 1, this.scene,
                this.navigationPlugin, this.crowd, patrolPoints);

            hitbox.Ennemi = ennemi;
            this.scene.ennemis.push(ennemi);
        });
    }

    demarrer() {
        console.log("Phase : ACTION");
        this.interactables.forEach(i => {
            if (i instanceof Bloc) return;
            if (i.mesh) i.mesh.isPickable = false;
            if (i.partA && i.type === "player") i.partA.isPickable = false;
            if (i.partB && i.type === "player") i.partB.isPickable = false;
        });

        this.interactables.forEach(item => {
            if (item instanceof Obstacle) {
                this.staticMeshes.push(item.mesh);
                this.collisionMeshes.push(item.mesh);
            }
        });

        this.rebakeNavMesh();

        this.interactables.forEach(item => {
            if (item instanceof Porte && item.updateNavMesh) {
                item.updateNavMesh();
            }
        });

        this.scene.bots.forEach(bot => {
            if (!bot.attachedBloc) bot.setTarget(bot.objective);
        });
        this.scene.ennemis.forEach(ennemi => ennemi.demarrer());
        this.isPreparationPhase = false;
    }

    update(deltaTime) {
        if (this.isPreparationPhase) return;

        if (this.crowd) {
            this.crowd.update(deltaTime);
        }

        this.scene.bots.forEach(bot => {
            if (bot.update) bot.update(this.scene);
        });

        this.scene.ennemis.forEach(ennemi => {
            if (ennemi.update) ennemi.update();
        });

        // Detection des bots qui atteignent la sortie
        this._checkExits();
        if (window.gameHud && window.gameHud.botsExited > 0 && this.scene.bots.length > 0) {
            this._checkStagnation(deltaTime);
        }
    }

    // ====================== DETECTION DE SORTIE ======================

    _checkExits() {
        if (!this._exitZone || this.scene.bots.length === 0) return;

        const zone = this._exitZone;
        const toRemove = [];

        this.scene.bots.forEach(bot => {
            const p = bot.hitbox.position;
            if (
                Math.abs(p.x - zone.x) < zone.hw &&
                Math.abs(p.z - zone.z) < zone.hd
            ) {
                toRemove.push(bot);
            }
        });

        toRemove.forEach(bot => this._botExits(bot));
    }

    _botExits(bot) {
        console.log(`Bot ${bot.id} a atteint la sortie !`);
        bot.stop();
        if (bot.visualMesh) bot.visualMesh.dispose();
        const index = this.scene.bots.indexOf(bot);
        if (index !== -1) this.scene.bots.splice(index, 1);
        this._lastBotPositions.delete(bot.id);
        this._stagnationTimer = 0; // reset le timer a chaque sortie

        if (window.gameHud) {
            const remaining = window.gameHud.botReachedExit();
            if (remaining === 0) setTimeout(() => window.gameHud.showVictory(), 800);
        }
    }

    _botDies(bot) {
        console.log(`Bot ${bot.id} est mort.`);
        bot.stop();
        if (bot.visualMesh) bot.visualMesh.dispose();
        const index = this.scene.bots.indexOf(bot);
        if (index !== -1) this.scene.bots.splice(index, 1);
        if (window.gameHud) {
            const remaining = window.gameHud.botDied();
            if (remaining === 0 && window.gameHud.botsExited === 0) setTimeout(() => window.gameHud.showFail(), 800);
            else if (remaining === 0 && window.gameHud.botsExited > 0) setTimeout(() => window.gameHud.showVictory(), 800);
        }
    }

    // ====================== NAVMESH ======================

    async rebakeNavMesh() {
        if (!this.navigationPlugin) return;
        console.log("Rebake du NavMesh...");

        const navMeshParameters = {
            cs: 0.1, ch: 0.1,
            walkableSlopeAngle: 60,
            walkableHeight: 1.0,
            walkableClimb: 2.0,
            walkableRadius: 0.3,  
            maxEdgeLen: 12,
            maxSimplificationError: 1.3, minRegionArea: 4,
            mergeRegionArea: 20, maxVertsPerPoly: 6,
            detailSampleDist: 6, detailSampleMaxError: 1,
            borderSize: 1, tileSize: 64
        };

        const botTargets = this.scene.bots.map(bot => ({
            bot,
            target: bot.target ? bot.target.clone() : bot.objective.clone()
        }));

        const ennemiTargets = this.scene.ennemis.map(ennemi => ({
            ennemi,
            target: ennemi.target ? ennemi.target.clone() : ennemi.hitbox.position.clone()
        }));

        this.scene.bots.forEach(bot => {
            if (bot.agentIndex >= 0) {
                this.crowd.removeAgent(bot.agentIndex);
                bot.agentIndex = -1;
            }
            bot.target = null;
        });

        this.scene.ennemis.forEach(ennemi => {
            if (ennemi.agentIndex >= 0) {
                this.crowd.removeAgent(ennemi.agentIndex);
                ennemi.agentIndex = -1;
            }
            ennemi.target = null;
        });

        this.navigationPlugin.createNavMesh(this.staticMeshes, navMeshParameters);

        this.interactables.forEach(item => {
            if (item instanceof Obstacle && item.recastObstacle !== null) {
                item.recastObstacle = null;
            } else if (item instanceof Porte && item.recastObstacle !== null) {
                item.recastObstacle = null;
                item.updateNavMesh();
            }
        });

        if (this.crowd) this.crowd.dispose();
        this.crowd = this.navigationPlugin.createCrowd(10, 0.5, this.scene);

        botTargets.forEach(({ bot, target }) => {
            bot.crowd = this.crowd;
            bot.setTarget(target);
        });

        ennemiTargets.forEach(({ ennemi, target }) => {
            ennemi.crowd = this.crowd;
            ennemi.setTarget(target);
        });

        if (this.navMeshDebug) {
            this.navMeshDebug.dispose();
            this.navMeshDebug = this.navigationPlugin.createDebugNavMesh(this.scene);
            const navMat = new BABYLON.StandardMaterial("navMat", this.scene);
            navMat.diffuseColor = new BABYLON.Color3(0.8, 0.2, 0.8);
            navMat.alpha = 0.6;
            this.navMeshDebug.material = navMat;
            this.navMeshDebug.position.y = 0.05;
        }

        console.log("Rebake terminé !");
    }

    // ====================== RESET / DESTROY ======================

    async reset() {
        console.log("=== RESET DU NIVEAU ===");
        this.destroy();
        this.isPreparationPhase = true;
        this._stagnationTimer = 0;
        this._lastBotPositions = new Map();
        await this.build();
    }

    destroy() {
        console.log("=== DESTRUCTION DU NIVEAU ===");

        this.scene.bots.forEach(bot => {
            bot.stop();
            if (bot.visualMesh) bot.visualMesh.dispose();
            if (bot.hitbox) bot.hitbox.dispose();
        });
        this.scene.bots = [];

        this.scene.ennemis.forEach(ennemi => {
            ennemi.stop();
            if (ennemi.visualMesh) ennemi.visualMesh.dispose();
            if (ennemi.hitbox) ennemi.hitbox.dispose();
        });
        this.scene.ennemis = [];

        this.interactables.forEach(item => {
            if (item.mesh) item.mesh.dispose();
            if (item.partA) item.partA.dispose();
            if (item.partB) item.partB.dispose();
            if (item.observer) this.scene.onBeforeRenderObservable.remove(item.observer);
            if (item.targetZoneMesh) item.targetZoneMesh.dispose();
            if (item.fakeBridge) item.fakeBridge.dispose();
        });
        this.interactables = [];

        this.staticMeshes.forEach(mesh => mesh.dispose());
        this.staticMeshes = [];
        this.collisionMeshes = [];

        if (this.navMeshDebug) this.navMeshDebug.dispose();
        if (this.crowd) this.crowd.dispose();
        this.navMeshDebug = null;
        this.crowd = null;
        this._exitZone = null;

        console.log("Niveau détruit.");
    }


    async loadModels() {

        const robotResult =
            await BABYLON.SceneLoader.ImportMeshAsync(
                "",
                "./resources/models/",
                "robot.glb",
                this.scene
            );
            
        const ennemiResult =
            await BABYLON.SceneLoader.ImportMeshAsync(
                "",
                "./resources/models/",
                "ennemi.glb",
                this.scene
            );

        this.loadedModels = {

            robot: {
                meshes: robotResult.meshes,
                animationGroups: robotResult.animationGroups
            },

            ennemi: {
                meshes: ennemiResult.meshes,
                animationGroups: ennemiResult.animationGroups
            }
        };

        robotResult.meshes.forEach(m => {
            m.setEnabled(false);
        });

        ennemiResult.meshes.forEach(m => {
            m.setEnabled(false);
        });
    }
    _checkStagnation(deltaTime) {
    const MOVE_THRESHOLD = 0.05; // distance minimale pour considerer qu'un bot bouge
    let anyBotMoving = false;

    for (const bot of this.scene.bots) {
        const pos = bot.hitbox.position;
        const last = this._lastBotPositions.get(bot.id);

        if (last) {
            const dx = pos.x - last.x;
            const dz = pos.z - last.z;
            if (Math.sqrt(dx * dx + dz * dz) > MOVE_THRESHOLD) {
                anyBotMoving = true;
            }
        }

        this._lastBotPositions.set(bot.id, { x: pos.x, z: pos.z });
    }

    if (anyBotMoving) {
        this._stagnationTimer = 0;
    } else {
        this._stagnationTimer += deltaTime;
        if (this._stagnationTimer >= this._stagnationThreshold) {
            this._stagnationTimer = 0;
            setTimeout(() => window.gameHud.showVictory(), 800);
        }
    }
}
}