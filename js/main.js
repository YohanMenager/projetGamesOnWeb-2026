import Bot from "./Bot.js";
import Obstacle from "./Objets/Obstacle.js";
import Bloc from "./Objets/Bloc.js";
import Porte from "./Objets/Porte.js";

// ====================== INIT ======================
var canvas = document.getElementById("renderCanvas");
var engine = new BABYLON.Engine(canvas, true, { stencil: false }, true);
var scene = createScene(engine, canvas);

// Variables globales utiles
var sceneSize = 40;           // Taille du niveau (plus grand pour un vrai labyrinthe)
var min = -sceneSize / 2 + 4;
var max = sceneSize / 2 - 4;

//pour la navigation
window.navigationPlugin = null;
var crowd = null;
var navMeshDebug = null;

window.isPreparationPhase = true;   // Phase de préparation (placement des bots, etc.)
// ====================== CREATE SCENE ======================
function createScene(engine, canvas) {
    var scene = new BABYLON.Scene(engine);

    // Caméra vue du dessus (top-down)
    var camera = new BABYLON.ArcRotateCamera(
        "topCamera",
        BABYLON.Tools.ToRadians(90),   // alpha
        BABYLON.Tools.ToRadians(45),    // beta (presque à plat)
        45,                            // distance
        new BABYLON.Vector3(0, 0, 0),
        scene
    );
    camera.attachControl(canvas, true);
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

    //créer un bouton pour alterner entre phase de préparation et phase de simulation
    const phaseButton = document.getElementById("phaseButton");
    phaseButton.addEventListener("click", () => {
        if (window.isPreparationPhase) {
            startSimulation();
            phaseButton.innerHTML = "Passer en préparation";
        } else {
            startPreparation();
            phaseButton.innerHTML = "Passer en simulation";
        }
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
        // Si on est en préparation, on NE MET RIEN à jour (ni le crowd, ni les meshes)
        if (window.isPreparationPhase) 
        {
            scene.bots.forEach(bot => {
                bot.stop(); // On stoppe les bots
            });
            return;
        }

        // Sinon, on update le cerveau (crowd) et les corps (meshes)
        if (crowd) {
            // DeltaTime en secondes
            crowd.update(engine.getDeltaTime() / 1000);
        }

        scene.bots.forEach(bot => {
            if (!bot.attachedBloc) { // Si le bot n'est pas attaché à un bloc
                bot.setTarget(bot.objective);
            }
            if (bot.update) bot.update(scene);
        });
    });

    hideLoadingView();
    console.log("Niveau prêt avec pathfinding Recast !");
}

function createLevel(scene) {
    // Sol
    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: sceneSize, height: sceneSize }, scene);
    const groundMat = new BABYLON.PBRMaterial("gMat", scene);
    groundMat.albedoColor = new BABYLON.Color3(0.1, 0.1, 0.12);
    ground.material = groundMat;
    new BABYLON.PhysicsAggregate(ground, BABYLON.PhysicsShapeType.BOX, { mass: 0 }, scene);

    // Fonction utilitaire pour les murs
    const createWall = (name, w, d, x, z) => {
        const wall = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: 3, depth: d }, scene);
        wall.position.set(x, 1.5, z);
        new BABYLON.PhysicsAggregate(wall, BABYLON.PhysicsShapeType.BOX, { mass: 0 }, scene);
        return wall;
    };

    // Murs extérieurs
    createWall("wN", sceneSize, 1, 0, -sceneSize / 2);
    createWall("wS", sceneSize, 1, 0, sceneSize / 2);
    createWall("wW", 1, sceneSize, -sceneSize / 2, 0);
    createWall("wE", 1, sceneSize, sceneSize / 2, 0);

    // === CRÉATION DES 3 COULOIRS (Séparateurs horizontaux) ===
    // On divise l'espace Z en 3 corridors : de -15 à -5, de -5 à 5, et de 5 à 15
    createWall("inner1", 30, 1, -5, -5); 
    createWall("inner2", 30, 1, -5, 5);

    // Sortie commune (Zone verte)
    const exitZone = BABYLON.MeshBuilder.CreateBox("exitZone", { width: 4, height: 0.1, depth: 30 }, scene);
    exitZone.position.set(16, 0.05, 0);
    const exitMat = new BABYLON.StandardMaterial("eMat", scene);
    exitMat.diffuseColor = new BABYLON.Color3(0, 1, 0);
    exitZone.material = exitMat;

    // === PLACEMENT DES OBSTACLES SPÉCIFIQUES ===

    // 1. Zone du haut : L'OBSTACLE (Draggable par le joueur)
    // Coordonnées : X=0, Z=-10
    new Obstacle(scene, new BABYLON.Vector3(0, 0, -12.5), { width: 1, height: 2, depth: 6 }, 20);
    //murs qui bloquent l'obstacle en place, et empêchent le robot de le contourner
    createWall("inner3", 1, 5, -1, -7.5);
    createWall("inner4", 1, 5, 1, -7.5);
    createWall("inner5", 1, 5, -1, -17.5);
    createWall("inner6", 1, 5, 1, -17.5);

    // 2. Zone du milieu : LA PORTE (Cliquable par le joueur)
    // Coordonnées : X=0, Z=0
    new Porte(scene, new BABYLON.Vector3(0, 0, 0), "player", false, { width: 1, height: 3, depth: 3 });
    //murs pour la porte, pour l'empêcher de se faire contourner par le robot
    createWall("inner9", 1, 3, 1, -3);
    createWall("inner10", 1, 3, -1, 3);
    createWall("inner11", 1, 3, 1, 3);
    createWall("inner12", 1, 3, -1, -3);

    // 3. Zone du bas : LE BLOC (À pousser par le robot)
    // On place une zone cible sur le côté pour que le robot pousse le bloc hors du couloir
    new Bloc(
        scene, 
        new BABYLON.Vector3(0, 0, 12.5),       // Position de départ (bloque le passage)
        new BABYLON.Vector3(5, 0, 12.5),       // Position cible (dans le mur ou un renfoncement)
        { width: 2, height: 2, depth: 2 },
    );
    //murs pour le bloc, pour l'empêcher de se faire contourner par le robot
    createWall("inner7", 4, 7, 0, 8);
    createWall("inner8", 4, 7, 0, 17);
}

// ====================== CRÉATION DES ROBOTS ======================
function createRobots(scene) {
    const botPositions = [
        new BABYLON.Vector3(-15, 0.8, -10), // Robot 1 (Obstacle)
        new BABYLON.Vector3(-15, 0.8, 0),   // Robot 2 (Porte)
        new BABYLON.Vector3(-15, 0.8, 10)   // Robot 3 (Bloc)
    ];

    botPositions.forEach((pos, i) => {
        const mesh = BABYLON.MeshBuilder.CreateBox("botMesh_" + i, { size: 1 }, scene);
        mesh.position = pos;
        
        const bot = new Bot(
            mesh, i, 0.15, 1, scene, 
            window.navigationPlugin, crowd, 
            new BABYLON.Vector3(16, 0.8, pos.z) // Cible en face dans son couloir
        );
        scene.bots.push(bot);
    });
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
    window.navigationPlugin = new BABYLON.RecastJSPlugin();
    
    const navMeshParameters = {
        cs: 0.2, ch: 0.2, walkableSlopeAngle: 35,
        walkableHeight: 1.0, walkableClimb: 0.5,
        walkableRadius: 0.4, maxEdgeLen: 12,
        maxSimplificationError: 1.3, minRegionArea: 8,
        mergeRegionArea: 20, maxVertsPerPoly: 6,
        detailSampleDist: 6, detailSampleMaxError: 1,
        borderSize: 1, tileSize: 64
    };

    const walkableMeshes = scene.meshes.filter(m => m.name === "ground" || m.name.startsWith("inner"));

    window.navigationPlugin.createNavMesh(walkableMeshes, navMeshParameters, (navmeshData) => {
        const navMeshDebug = window.navigationPlugin.createDebugNavMesh(scene);
        navMeshDebug.material = new BABYLON.StandardMaterial("navMat", scene);
        navMeshDebug.material.diffuseColor = new BABYLON.Color3(0, 1, 0);
        navMeshDebug.material.alpha = 0.1;
        navMeshDebug.position.y = 0.01;
    });

    crowd = window.navigationPlugin.createCrowd(10, 0.5, scene);
}

function startPreparation() {
    window.isPreparationPhase = true;
    enablePlayerInteractions();
    console.log("Préparation : Agents stoppés");
}

function startSimulation() {
    window.isPreparationPhase = false;
    disablePlayerInteractions();
    console.log("Simulation : Agents en route");
}

function enablePlayerInteractions() {
    // pour les obstacles :
    scene.meshes.forEach(mesh => {
        if (mesh.name.startsWith("obstacle")) {
            mesh.isPickable = true;  // Permet de cliquer et drag l'obstacle
        }
    });
    // pour les portes :
    scene.meshes.forEach(mesh => {
        if (mesh.name.startsWith("porte")) {
            mesh.isPickable = true;  // Permet de cliquer sur la porte
        }
    });
}

function disablePlayerInteractions() {
    // pour les obstacles :
    scene.meshes.forEach(mesh => {
        if (mesh.name.startsWith("obstacle")) {
            mesh.isPickable = false;  // Empêche de cliquer et drag l'obstacle
        }
    });
}