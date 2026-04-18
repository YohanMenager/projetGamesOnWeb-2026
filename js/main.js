//---------------------------main.js---------------------------
import Niveau from "./Niveau.js";

// ====================== INIT ======================
var canvas = document.getElementById("renderCanvas");
var engine = new BABYLON.Engine(canvas, true, { stencil: false }, true);
var scene = createScene(engine, canvas);

// Variables globales pour la gestion du niveau
scene.currentLevel = null;
const cheminNiveau = "../resources/niveaux/"; 

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

    // Bouton pour alterner entre phase de préparation et phase de simulation
    const phaseButton = document.getElementById("phaseButton");
    if (phaseButton) {
        phaseButton.addEventListener("click", () => {
            if (!scene.currentLevel) return;

            if (scene.currentLevel.isPreparationPhase) {
                scene.currentLevel.demarrer();
                phaseButton.innerHTML = "Recommencer";
            } else {
                scene.currentLevel.reset();
                phaseButton.innerHTML = "Démarrer";
            }
        });
    }

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

    console.log("Chargement global de Recast...");
    await Recast(); // Initialisation globale requise une seule fois

    createLights(scene);

    // Charger le premier niveau par défaut 
    await chargerNiveau(1, scene);

    // Mise à jour (déléguée à la classe Niveau)
    scene.registerBeforeRender(() => {
        if (scene.currentLevel) {
            // On passe le deltaTime en secondes pour Recast
            scene.currentLevel.update(engine.getDeltaTime() / 1000);
        }
    });

    hideLoadingView();
    console.log("Moteur prêt !");
}

// ====================== CHARGEMENT DE NIVEAU ======================
async function chargerNiveau(number, scene) {
    console.log(`Tentative de chargement du niveau ${number}...`);
    
    try {
        // 1. Récupération du fichier JSON
        const reponse = await fetch(`${cheminNiveau}lvl_${number}.json`);
        
        if (!reponse.ok) {
            throw new Error(`Erreur HTTP: ${reponse.status}`);
        }
        
        const levelData = await reponse.json();

        // 2. Nettoyage de l'ancien niveau s'il y en a un
        if (scene.currentLevel) {
            scene.currentLevel.destroy(); 
        }

        // 3. Création et construction du nouveau niveau
        scene.currentLevel = new Niveau(scene, levelData);
        await scene.currentLevel.build();

        console.log(`Niveau ${number} chargé et généré avec succès !`);

        // On s'assure que le bouton affiche le bon texte au chargement
        const phaseButton = document.getElementById("phaseButton");
        if(phaseButton) phaseButton.innerHTML = "Démarrer";
        
    } catch (erreur) {
        console.error(`Impossible de charger le fichier du niveau ${number}:`, erreur);
    }
}

// ====================== UTILITIES ======================



window.addEventListener("resize", () => engine.resize());

function createLights(scene) {
    const dirLight = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(-0.5, -1, -0.7), scene);
    dirLight.intensity = 1.2;
    dirLight.diffuse = new BABYLON.Color3(1, 0.95, 0.9);
    dirLight.specular = new BABYLON.Color3(1, 1, 1);

    const hemiLight = new BABYLON.HemisphericLight("hemiLight", new BABYLON.Vector3(0, 1, 0), scene);
    hemiLight.intensity = 0.6;
    hemiLight.groundColor = new BABYLON.Color3(0.3, 0.3, 0.4);
    hemiLight.diffuse = new BABYLON.Color3(0.8, 0.85, 1);

    const exitLight = new BABYLON.PointLight("exitLight", new BABYLON.Vector3(15, 4, 0), scene);
    exitLight.intensity = 1.5;
    exitLight.diffuse = new BABYLON.Color3(0.3, 1, 0.4);
    exitLight.range = 25;
}

function hideLoadingView() {
    const loadingDiv = document.getElementById("loadingDiv");
    if (loadingDiv) {
        loadingDiv.style.display = "none";
    }
}