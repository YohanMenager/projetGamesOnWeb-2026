import Bot from "./Bot.js";
import Obstacle from "./Objets/Obstacle.js";
import Bloc from "./Objets/Bloc.js";
import Porte from "./Objets/Porte.js";

export default class Niveau {
    constructor(scene, levelData) {
        this.scene = scene;
        this.levelData = levelData;
        
        // Listes pour garder une trace de tout ce qu'on crée (utile pour le Reset)
        this.staticMeshes = []; 
        this.interactables = [];
        this.scene.bots = []; // Rattaché à la scene car Bloc.js l'utilise
        
        // Navigation
        this.navigationPlugin = null;
        this.crowd = null;
        this.navMeshDebug = null;

        this.isPreparationPhase = true;
    }

    /**
     * Construit le niveau entier (Murs, Objets, NavMesh, Bots)
     */
    async build() {
        console.log("=== Création du Niveau ===");
        
        this.buildEnvironment();
        this.buildInteractables();
        
        await this.initNavMesh(); // Doit être fait APRES l'environnement statique
        
        this.spawnBots();
        
        this.setPreparationPhase(true); // On commence toujours en préparation
    }

    /**
     * Crée le sol, les murs extérieurs, la zone de sortie et les murs intérieurs
     */
    buildEnvironment() {
        const size = this.levelData.size;

        // --- SOL ---
        const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: size, height: size }, this.scene);
        const groundMat = new BABYLON.PBRMaterial("gMat", this.scene);
        groundMat.albedoColor = new BABYLON.Color3(0.1, 0.1, 0.12);
        ground.material = groundMat;
        new BABYLON.PhysicsAggregate(ground, BABYLON.PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        this.staticMeshes.push(ground);

        // --- MURS EXTÉRIEURS ---
        this.createWall("wN", size, 1, 0, -size / 2);
        this.createWall("wS", size, 1, 0, size / 2);
        this.createWall("wW", 1, size, -size / 2, 0);
        this.createWall("wE", 1, size, size / 2, 0);

        // --- MURS INTÉRIEURS (depuis le JSON) ---
        if (this.levelData.walls) {
            this.levelData.walls.forEach(w => {
                this.createWall(w.name, w.width, w.depth, w.x, w.z);
            });
        }

        // --- SORTIE ---
        if (this.levelData.exit) {
            const e = this.levelData.exit;
            const exitZone = BABYLON.MeshBuilder.CreateBox("exitZone", { width: e.width, height: 0.1, depth: e.depth }, this.scene);
            exitZone.position.set(e.x, 0.05, e.z);
            const exitMat = new BABYLON.StandardMaterial("eMat", this.scene);
            exitMat.diffuseColor = new BABYLON.Color3(0, 1, 0);
            exitZone.material = exitMat;
            this.staticMeshes.push(exitZone);
        }
    }

    createWall(name, w, d, x, z) {
        const wall = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: 3, depth: d }, this.scene);
        wall.position.set(x, 1.5, z);
        new BABYLON.PhysicsAggregate(wall, BABYLON.PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        this.staticMeshes.push(wall);
    }

    /**
     * Crée les obstacles, portes et blocs à partir du JSON
     */
    buildInteractables() {
        if (!this.levelData.interactables) return;

        this.levelData.interactables.forEach(item => {
            let obj;
            switch (item.type) {
                case "obstacle":
                    obj = new Obstacle(this.scene, new BABYLON.Vector3(item.x, 0, item.z), { width: item.width, height: 2, depth: item.depth }, 20);
                    break;
                case "porte":
                    obj = new Porte(this.scene, new BABYLON.Vector3(item.x, 0, item.z), "player", false, { width: item.width, height: 3, depth: item.depth });
                    break;
                case "bloc":
                    obj = new Bloc(
                        this.scene, 
                        new BABYLON.Vector3(item.startX, 0, item.startZ), 
                        new BABYLON.Vector3(item.targetX, 0, item.targetZ), 
                        { width: item.width, height: 2, depth: item.depth }
                    );
                    break;
            }
            if (obj) this.interactables.push(obj);
        });
    }

    /**
     * Initialise Recast (NavMesh) basé sur les meshes statiques
     */
    async initNavMesh() {
        if (!window.navigationPlugin) {
            window.navigationPlugin = new BABYLON.RecastJSPlugin();
        }
        this.navigationPlugin = window.navigationPlugin;

        const navMeshParameters = {
            cs: 0.2, ch: 0.2, walkableSlopeAngle: 35,
            walkableHeight: 1.0, walkableClimb: 0.5,
            walkableRadius: 0.4, maxEdgeLen: 12,
            maxSimplificationError: 1.3, minRegionArea: 8,
            mergeRegionArea: 20, maxVertsPerPoly: 6,
            detailSampleDist: 6, detailSampleMaxError: 1,
            borderSize: 1, tileSize: 64
        };

        // On crée le NavMesh uniquement à partir du sol et des murs (pas des objets mobiles)
        this.navigationPlugin.createNavMesh(this.staticMeshes, navMeshParameters, (navmeshData) => {
            // Optionnel : afficher le navmesh pour debugger
            // this.navMeshDebug = this.navigationPlugin.createDebugNavMesh(this.scene);
            // this.navMeshDebug.material = new BABYLON.StandardMaterial("navMat", this.scene);
            // this.navMeshDebug.material.diffuseColor = new BABYLON.Color3(0, 1, 0);
            // this.navMeshDebug.material.alpha = 0.1;
            // this.navMeshDebug.position.y = 0.01;
        });

        this.crowd = this.navigationPlugin.createCrowd(10, 0.5, this.scene);
    }

    /**
     * Fait apparaître les bots
     */
    spawnBots() {
        if (!this.levelData.bots) return;

        this.levelData.bots.forEach(bData => {
            const mesh = BABYLON.MeshBuilder.CreateBox("botMesh_" + bData.id, { size: 1 }, this.scene);
            mesh.position = new BABYLON.Vector3(bData.startX, 0.8, bData.startZ);
            
            const bot = new Bot(
                mesh, bData.id, 0.15, 1, this.scene, 
                this.navigationPlugin, this.crowd, 
                new BABYLON.Vector3(bData.targetX, 0.8, bData.targetZ)
            );
            this.scene.bots.push(bot);
        });
    }

    /**
     * Alterne entre Préparation et Action
     */
    setPreparationPhase(isPrep) {
        this.isPreparationPhase = isPrep;
        
        if (this.isPreparationPhase) {
            console.log("Phase : PRÉPARATION");
            this.scene.bots.forEach(bot => bot.stop());
            
            // Activer le Drag & Drop des interactables
            this.interactables.forEach(i => { if (i.mesh) i.mesh.isPickable = true; });
        } else {
            console.log("Phase : ACTION");
            this.interactables.forEach(i => { if (i.mesh) i.mesh.isPickable = false; });
            
            // On relance les bots vers leurs objectifs
            this.scene.bots.forEach(bot => {
                if (!bot.attachedBloc) bot.setTarget(bot.objective);
            });
        }
    }

    /**
     * Met à jour la logique de l'IA à chaque frame (à appeler dans la render loop)
     */
    update(deltaTime) {
        if (this.isPreparationPhase) return;

        if (this.crowd) {
            this.crowd.update(deltaTime);
        }

        this.scene.bots.forEach(bot => {
            if (bot.update) bot.update(this.scene);
        });
    }

    /**
     * Nettoie tout le niveau (destruction totale) pour pouvoir le recommencer à zéro
     */
    async reset() {
        console.log("=== RESET DU NIVEAU ===");
        
        // 1. Détruire les bots
        this.scene.bots.forEach(bot => {
            if (bot.mesh) bot.mesh.dispose();
        });
        this.scene.bots = [];

        // 2. Détruire les interactables (blocs, portes...)
        this.interactables.forEach(item => {
            if (item.mesh) item.mesh.dispose();
            if (item.aggregate) item.aggregate.dispose();
            if (item.observer) this.scene.onBeforeRenderObservable.remove(item.observer);
            if (item.targetZoneMesh) item.targetZoneMesh.dispose();
        });
        this.interactables = [];

        // 3. Détruire l'environnement statique
        this.staticMeshes.forEach(mesh => {
            if (mesh.aggregate) mesh.aggregate.dispose();
            mesh.dispose();
        });
        this.staticMeshes = [];

        if (this.navMeshDebug) this.navMeshDebug.dispose();
        if (this.crowd) this.crowd.dispose();
        
        // 4. Reconstruire le niveau depuis les données JSON
        await this.build();
    }
}