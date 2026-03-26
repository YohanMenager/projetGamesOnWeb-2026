import Bot from "./Bot.js";

// ====================== INIT ======================
var canvas = document.getElementById("renderCanvas");
var engine = new BABYLON.Engine(canvas, true, { stencil: false }, true);
var scene = createScene(engine, canvas);

// Variables globales utiles
var sceneSize = 40;           // Taille du niveau (plus grand pour un vrai labyrinthe)
var min = -sceneSize / 2 + 4;
var max = sceneSize / 2 - 4;

//pour la navigation
var navigationPlugin = null;
var crowd = null;
var navMeshDebug = null;

// ====================== CREATE SCENE ======================
function createScene(engine, canvas) {
    var scene = new BABYLON.Scene(engine);

    // Caméra vue du dessus (top-down)
    var camera = new BABYLON.ArcRotateCamera(
        "topCamera",
        BABYLON.Tools.ToRadians(90),   // alpha
        BABYLON.Tools.ToRadians(0),    // beta (presque à plat)
        45,                            // distance
        new BABYLON.Vector3(0, 0, 0),
        scene
    );
    // camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 20;
    camera.upperRadiusLimit = 80;
    camera.upperBetaLimit = BABYLON.Tools.ToRadians(80);
    camera.lowerBetaLimit = BABYLON.Tools.ToRadians(5);
    scene.activeCamera = camera;

    camera.minZ = 0.1;      // Très important pour éviter les flashs noirs en vue du dessus
    camera.maxZ = 200;      // Limite la distance de rendu
    camera.panningSensibility = 50;   // Rend le panning plus fluide en top-down

    // Lancement de l’initialisation asynchrone
    initGame(scene);

    // Boucle de rendu
    engine.runRenderLoop(() => {
        scene.render();
    });

    return scene;
}

// ====================== INIT GAME ======================
async function initGame(scene) {
    engine.displayLoadingUI = function() {};

    console.log("Chargement de Havok...");
    const havokInstance = await HavokPhysics();
    const hk = new BABYLON.HavokPlugin(true, havokInstance);
    scene.enablePhysics(new BABYLON.Vector3(0, -9.81, 0), hk);

    console.log("Havok chargé");

    createLevel(scene);
    createLights(scene);

    // === INITIALISATION RECAST ===
    console.log("Création du Navigation Mesh avec Recast...");
    await initNavigation(scene);

    scene.bots = [];
    createRobots(scene, 8);

    // Mise à jour (crowd + bots)
    scene.registerBeforeRender(() => {
        if (crowd) crowd.update(scene.getEngine().getDeltaTime() / 1000);
        scene.bots.forEach(bot => {
            if (bot.update) bot.update(scene);
        });
    });

    hideLoadingView();
    console.log("Niveau prêt avec pathfinding Recast !");
}

// ====================== CRÉATION DU NIVEAU ======================
function createLevel(scene) {
    // Matériaux
    const groundMat = new BABYLON.PBRMaterial("groundMat", scene);
    groundMat.albedoColor = new BABYLON.Color3(0.15, 0.15, 0.2);
    groundMat.roughness = 0.8;

    const wallMat = new BABYLON.PBRMaterial("wallMat", scene);
    wallMat.albedoColor = new BABYLON.Color3(0.6, 0.6, 0.7);
    wallMat.roughness = 0.9;

    const exitMat = new BABYLON.PBRMaterial("exitMat", scene);
    exitMat.albedoColor = new BABYLON.Color3(0.1, 0.8, 0.2);
    exitMat.emissiveColor = new BABYLON.Color3(0.1, 0.6, 0.15);

    // Sol
    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: sceneSize, height: sceneSize }, scene);
    ground.material = groundMat;
    ground.receiveShadows = true;
    new BABYLON.PhysicsAggregate(ground, BABYLON.PhysicsShapeType.BOX, { mass: 0 }, scene);

    // Murs extérieurs
    const wallThickness = 1;
    const half = sceneSize / 2;

    function createWall(name, width, depth, x, z) {
        const wall = BABYLON.MeshBuilder.CreateBox(name, { width, height: 2, depth }, scene);
        wall.position.set(x, 1, z);
        wall.material = wallMat;
        new BABYLON.PhysicsAggregate(wall, BABYLON.PhysicsShapeType.BOX, { mass: 0 }, scene);
        return wall;
    }

    createWall("wallNorth", sceneSize + wallThickness, wallThickness, 0, -half);
    createWall("wallSouth", sceneSize + wallThickness, wallThickness, 0, half);
    createWall("wallWest", wallThickness, sceneSize + wallThickness, -half, 0);
    createWall("wallEast", wallThickness, sceneSize + wallThickness, half, 0);

    // === Labyrinthe simple pour le premier niveau ===
    // Quelques murs intérieurs pour créer des chemins
    createWall("inner1", 12, 1, -8, -6);
    createWall("inner2", 1, 15, -12, 4);
    createWall("inner3", 10, 1, 5, -10);
    createWall("inner4", 1, 12, 10, 8);
    createWall("inner5", 18, 1, -5, 12);

    // Sortie (zone verte à droite)
    const exitZone = BABYLON.MeshBuilder.CreateBox("exitZone", { width: 6, height: 0.1, depth: 8 }, scene);
    exitZone.position.set(15, 0.05, 0);
    exitZone.material = exitMat;
    exitZone.isPickable = false;

    // Optionnel : un petit drapeau ou lumière pour voir la sortie
    const exitLight = new BABYLON.PointLight("exitLight", new BABYLON.Vector3(15, 5, 0), scene);
    exitLight.intensity = 0.8;
    exitLight.diffuse = new BABYLON.Color3(0.2, 1, 0.3);

    console.log("Niveau créé avec sortie à droite.");
}

// ====================== CRÉATION DES ROBOTS ======================
function createRobots(scene, count) {
    const botMaster = BABYLON.MeshBuilder.CreateBox("botMaster", { size: 1.2 }, scene);
    botMaster.isVisible = false;

    const robotMaterial = new BABYLON.StandardMaterial("robotMaterial", scene);
    robotMaterial.diffuseColor = new BABYLON.Color3(0.9, 0.3, 0.1);
    botMaster.material = robotMaterial;

    for (let i = 0; i < count; i++) {
        const instance = botMaster.createInstance("robot_" + i);

        instance.position.set(
            -sceneSize / 2 + 5 + Math.random() * 6,
            0.8,
            -12 + Math.random() * 24
        );

        // On passe navigationPlugin et crowd au constructeur
        const newBot = new Bot(
            instance, 
            i, 
            0.12,      // speed
            0.25,      // scaling
            scene,
            navigationPlugin,   // ← important
            crowd               // ← important
        );

        // Objectif initial = sortie (à droite)
        newBot.setTarget(new BABYLON.Vector3(15, 0.8, 0));

        scene.bots.push(newBot);
    }
}

// ====================== UTILITIES ======================
// Exemple : fonction pour lancer la simulation (phase réalisation)
// Tu pourras appeler startSimulation() depuis un bouton HTML
window.startSimulation = function() {
    console.log("=== Phase RÉALISATION lancée ===");
    // Ici tu pourras activer l’IA complète des bots, ennemis, etc.
};

// Exemple : reset du niveau
window.resetLevel = function() {
    // Dispose tous les bots et recrée le niveau
    if (scene.bots) {
        scene.bots.forEach(b => b.mesh?.dispose());
        scene.bots = [];
    }
    // Recréer le niveau et robots (ou recharger complètement)
    createLevel(scene);
    createRobots(scene, 8);
    console.log("Niveau réinitialisé");
};

// Redimensionnement
window.addEventListener("resize", () => engine.resize());

// Lancement
console.log("Jeu de robots puzzle - Base prête !");

function createLights(scene) {
    // Lumière directionnelle principale (soleil)
    const dirLight = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(-0.5, -1, -0.7), scene);
    dirLight.intensity = 1.2;
    dirLight.diffuse = new BABYLON.Color3(1, 0.95, 0.9);
    dirLight.specular = new BABYLON.Color3(1, 1, 1);

    // Lumière ambiante pour éviter les zones totalement noires
    const hemiLight = new BABYLON.HemisphericLight("hemiLight", new BABYLON.Vector3(0, 1, 0), scene);
    hemiLight.intensity = 0.6;
    hemiLight.groundColor = new BABYLON.Color3(0.3, 0.3, 0.4);
    hemiLight.diffuse = new BABYLON.Color3(0.8, 0.85, 1);

    // Petite lumière près de la sortie pour la mettre en valeur
    const exitLight = new BABYLON.PointLight("exitLight", new BABYLON.Vector3(15, 4, 0), scene);
    exitLight.intensity = 1.5;
    exitLight.diffuse = new BABYLON.Color3(0.3, 1, 0.4);
    exitLight.range = 25;

    console.log("Lumières ajoutées");
}
function hideLoadingView() {
    const loadingDiv = document.getElementById("loadingDiv");
    if (loadingDiv) {
        loadingDiv.style.display = "none";
        console.log("Loading view caché");
    }
}
async function initNavigation(scene) {
    await Recast();
    // Création du plugin Recast
    navigationPlugin = new BABYLON.RecastJSPlugin();
    
    // Paramètres du navmesh (à ajuster selon ton niveau)
    const navMeshParameters = {
        cs: 0.2,          // cell size
        ch: 0.2,          // cell height
        walkableSlopeAngle: 35,
        walkableHeight: 1.0,
        walkableClimb: 0.5,
        walkableRadius: 0.4,
        maxEdgeLen: 12,
        maxSimplificationError: 1.3,
        minRegionArea: 8,
        mergeRegionArea: 20,
        maxVertsPerPoly: 6,
        detailSampleDist: 6,
        detailSampleMaxError: 1,
        borderSize: 1
    };

    // On utilise tous les meshes "walkable" (sol + murs intérieurs si besoin)
    const walkableMeshes = [];
    scene.meshes.forEach(mesh => {
        if (mesh.name === "ground" || mesh.name.startsWith("inner")) {
            walkableMeshes.push(mesh);
        }
    });

    // Création du navmesh
    navigationPlugin.createNavMesh(walkableMeshes, navMeshParameters, (navmeshData) => {
        console.log("NavMesh créé avec succès !");
        
        // Debug optionnel : afficher le navmesh en vert semi-transparent
        navMeshDebug = navigationPlugin.createDebugNavMesh(scene);
        navMeshDebug.material = new BABYLON.StandardMaterial("navDebugMat", scene);
        navMeshDebug.material.diffuseColor = new BABYLON.Color3(0, 1, 0);
        navMeshDebug.material.alpha = 0.15;
        navMeshDebug.position.y += 0.05; // légèrement au-dessus du sol
    });

    // Création du Crowd (gère plusieurs agents en même temps)
    crowd = navigationPlugin.createCrowd(20, 0.4, scene);  // max 20 agents, radius 0.4
}