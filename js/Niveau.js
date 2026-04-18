//---------------------------Niveau.js---------------------------
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

    }

    /**
     * Construit le niveau entier (Murs, Objets, NavMesh, Bots)
     */
    async build() {
        console.log("=== Création du Niveau ===");
        
        this.buildEnvironment();
        this.buildInteractables();
        
        await this.initNavMesh(); // Doit être fait après l'environnement statique
        
        this.spawnBots();
        
        this.isPreparationPhase = true;
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
        ground.isPickable = true;
        this.staticMeshes.push(ground);

        const rampeMat = new BABYLON.StandardMaterial("rampMat", this.scene);
        rampeMat.diffuseColor = new BABYLON.Color3(1, 1, 1); // Blanc Pur
        rampeMat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2); // Peu de reflets brillants

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
        // --- PLATEFORMES ---
        if (this.levelData.platforms) {
            this.levelData.platforms.forEach(p => {
                const plat = BABYLON.MeshBuilder.CreateBox(p.name, { width: p.width, height: p.y, depth: p.depth }, this.scene);
                plat.position.set(p.x, p.y / 2, p.z); // Centré sur Y
                new BABYLON.PhysicsAggregate(plat, BABYLON.PhysicsShapeType.BOX, { mass: 0 }, this.scene);
                plat.isPickable = true; 
                this.staticMeshes.push(plat);
            });
        }

        // --- RAMPES ---
        if (this.levelData.ramps) {
            this.levelData.ramps.forEach(r => {
                // Créer un pavé incliné avec CreateBox
                // On allonge artificiellement la profondeur de 10% (* 1.1) pour mordre dans la plateforme
                const ramp = BABYLON.MeshBuilder.CreateBox(r.name, { width: r.width, height: r.height, depth: r.depth * 1.1 }, this.scene);
                ramp.material = rampeMat;
                ramp.isPickable = true;
                ramp.position.set(r.x, r.y || 0, r.z); 

                // On garde la vraie profondeur (r.depth) pour calculer le bon angle
                ramp.rotation.x = Math.atan(r.height / r.depth);
                
                // Tourner horizontalement si spécifié
                if (r.rotationY) ramp.rotation.y = r.rotationY;
                
                // Recalcule le bounding box
                ramp.refreshBoundingInfo();
                
                // Bake les transformations dans les vertices
                ramp.computeWorldMatrix(true);
                ramp.bakeCurrentTransformIntoVertices();
                ramp.refreshBoundingInfo();

                new BABYLON.PhysicsAggregate(
                    ramp, 
                    BABYLON.PhysicsShapeType.MESH, 
                    { mass: 0, friction: 0.5 }, 
                    this.scene
                );
                
                this.staticMeshes.push(ramp);
            });
        }
    }

    createWall(name, w, d, x, z) {
        const wall = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: 3, depth: d }, this.scene);
        wall.position.set(x, 1.5, z);
        wall.isPickable = false;  
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
                        // On récupère le Y si le bloc est en hauteur, sinon on met 0
                        new BABYLON.Vector3(item.startX, item.startY || 0, item.startZ), 
                        new BABYLON.Vector3(item.targetX, item.targetY || 0, item.targetZ), 
                        { width: item.width, height: item.height || 2, depth: item.depth }
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
            cs: 0.1, ch: 0.1, 
            walkableSlopeAngle: 60, 
            walkableHeight: 1.0, 
            walkableClimb: 2.0,
            walkableRadius: 0.5, maxEdgeLen: 12,
            maxSimplificationError: 1.3, minRegionArea: 4,
            mergeRegionArea: 20, maxVertsPerPoly: 6,
            detailSampleDist: 6, detailSampleMaxError: 1,
            borderSize: 1, tileSize: 64
        };

        // 1. On génère le NavMesh 
        this.navigationPlugin.createNavMesh(this.staticMeshes, navMeshParameters);

        // 2. On affiche le debug juste après
        this.navMeshDebug = this.navigationPlugin.createDebugNavMesh(this.scene);
        const navMat = new BABYLON.StandardMaterial("navMat", this.scene);
        navMat.diffuseColor = new BABYLON.Color3(0.8, 0.2, 0.8); // Violet pour bien le voir
        navMat.alpha = 0.6;
        this.navMeshDebug.material = navMat;
        this.navMeshDebug.position.y = 0.05; 

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
     * Démarre l'action
     */
    demarrer() {
        console.log("Phase : ACTION");
        this.interactables.forEach(i => { 
            if (i instanceof Bloc) return;
            if (i.mesh) i.mesh.isPickable = false; 
            if (i.partA) i.partA.isPickable = false;
            if (i.partB) i.partB.isPickable = false;
        });
        

        // Ajouter les obstacles et portes au navmesh au démarrage
        this.interactables.forEach(item => {
            if (item instanceof Obstacle && item.ajouterAuNavMesh) {
                item.ajouterAuNavMesh();
            } else if (item instanceof Porte && item.updateNavMesh) {
                item.updateNavMesh();
            }else if (item instanceof Bloc && item.bloquerLeTrou) { 
                item.bloquerLeTrou(); 
            }
        });
        
        // On relance les bots vers leurs objectifs
        this.scene.bots.forEach(bot => {
            if (!bot.attachedBloc) bot.setTarget(bot.objective);
        });

        this.isPreparationPhase = false;
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

        this.destroy(); // Nettoie tout ce qui a été créé (meshes, bots, navmesh...)
        this.isPreparationPhase = true; // On repasse en préparation pendant le reset pour éviter les bugs d'update

        // 4. Reconstruire le niveau depuis les données JSON
        await this.build();
    }

    destroy() {
        // Appelée si on veut complètement supprimer le niveau (avant de charger un autre)
        //on n'appelle pas reset, on détruit tout directement car reset reconstruit le niveau après nettoyage, ce qui est inutile ici.
        console.log("=== DESTRUCTION DU NIVEAU ===");

        // 1. Détruire les bots
        this.scene.bots.forEach(bot => {
            if (bot.botMesh) bot.botMesh.dispose();  // ← botMesh, pas mesh
        });
        this.scene.bots = [];
        console.log("Bots détruits");

        // 2. Détruire les interactables (blocs, portes...)
        this.interactables.forEach(item => {
            // 1. Disposer l'aggregate 
            if (item.aggregate) {
                item.aggregate.dispose();
                item.aggregate = null;
            }
            // 2. Disposer le mesh principal
            if (item.mesh) item.mesh.dispose();
            
            // 3. Cas spécial pour les Portes (qui ont deux vantaux)
            if (item.partA) {
                if (item.partA.aggregate) item.partA.aggregate.dispose();
                item.partA.dispose();
            }
            if (item.partB) {
                if (item.partB.aggregate) item.partB.aggregate.dispose();
                item.partB.dispose();
            }
            
            // 4. Nettoyer les observateurs et autres
            if (item.observer) this.scene.onBeforeRenderObservable.remove(item.observer);
            if (item.targetZoneMesh) item.targetZoneMesh.dispose();
        });
        this.interactables = [];
        console.log("Interactables détruits");

        // 3. Détruire l'environnement statique
        this.staticMeshes.forEach(mesh => {
            if (mesh.aggregate) mesh.aggregate.dispose();
            mesh.dispose();
        });
        this.staticMeshes = [];
        console.log("Environnement statique détruit");

        if (this.navMeshDebug) this.navMeshDebug.dispose();
        if (this.crowd) this.crowd.dispose();
        this.navMeshDebug = null;
        this.crowd = null;
        console.log("NavMesh et foule détruits");

    }

async rebakeNavMesh() {
    if (!this.navigationPlugin) return;
    console.log("Rebake du NavMesh...");

    const navMeshParameters = {
        cs: 0.2, ch: 0.2,
        walkableSlopeAngle: 60,
        walkableHeight: 1.0,
        walkableClimb: 1.0,
        walkableRadius: 0.5, maxEdgeLen: 12,
        maxSimplificationError: 1.3, minRegionArea: 8,
        mergeRegionArea: 20, maxVertsPerPoly: 6,
        detailSampleDist: 6, detailSampleMaxError: 1,
        borderSize: 1, tileSize: 64
    };

    // 1. Sauvegarder les cibles AVANT de toucher à quoi que ce soit
    const botTargets = this.scene.bots.map(bot => ({
        bot,
        target: bot.target ? bot.target.clone() : bot.objective.clone()
    }));

    // 2. Supprimer tous les agents
    this.scene.bots.forEach(bot => {
        if (bot.agentIndex >= 0) {
            this.crowd.removeAgent(bot.agentIndex);
            bot.agentIndex = -1;
        }
        // Reset de this.target pour forcer setTarget à recréer l'agent
        bot.target = null;
    });

    // 3. Rebake
    this.navigationPlugin.createNavMesh(this.staticMeshes, navMeshParameters);

    // 4. Remettre les obstacles dynamiques
    this.interactables.forEach(item => {
        if (item instanceof Obstacle && item.recastObstacle !== null) {
            item.recastObstacle = null;
            item.ajouterAuNavMesh();
        } else if (item instanceof Porte && item.recastObstacle !== null) {
            item.recastObstacle = null;
            item.updateNavMesh();
        }
    });

    // 5. Recréer la foule
    if (this.crowd) this.crowd.dispose();
    this.crowd = this.navigationPlugin.createCrowd(10, 0.5, this.scene);

    // 6. Re-enregistrer les bots — bot.target est null donc setTarget s'exécute toujours
    botTargets.forEach(({ bot, target }) => {
        bot.crowd = this.crowd;
        bot.setTarget(target);
    });

    // 7. Debug mesh
    if (this.navMeshDebug) this.navMeshDebug.dispose();
    this.navMeshDebug = this.navigationPlugin.createDebugNavMesh(this.scene);
    const navMat = new BABYLON.StandardMaterial("navMat", this.scene);
    navMat.diffuseColor = new BABYLON.Color3(0.8, 0.2, 0.8);
    navMat.alpha = 0.6;
    this.navMeshDebug.material = navMat;
    this.navMeshDebug.position.y = 0.05;

    console.log("Rebake terminé !");
}
}