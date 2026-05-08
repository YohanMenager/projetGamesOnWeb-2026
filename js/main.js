import Niveau from "./Niveau.js";
import Hud from "./Hud.js";

// ====================== INIT ======================
var canvas = document.getElementById("renderCanvas");
var engine = new BABYLON.Engine(canvas, true, { stencil: false }, true);
var scene = createScene(engine, canvas);

scene.currentLevel = null;
const cheminNiveau = "./resources/niveaux/";
// ====================== HUD ======================
const hud = new Hud();

hud.onLevelSelected = async (number) => {
    await chargerNiveau(number, scene);
    // On affiche le HUD avec le bon nombre de bots dès que le niveau est chargé
    const botCount = scene.currentLevel?.levelData?.bots?.length ?? 0;
    hud.showHud(number, botCount);
    const phaseButton = document.getElementById("phaseButton");
    if (phaseButton) {
        phaseButton.style.display = "inline-block";
        phaseButton.innerHTML = "Démarrer";
    }
};

hud.onRestart = () => {
    if (!scene.currentLevel) return;
    scene.currentLevel.reset().then(() => {
        const botCount = scene.currentLevel?.levelData?.bots?.length ?? 0;
        hud.showHud(hud.currentLevel, botCount);
        const phaseButton = document.getElementById("phaseButton");
        if (phaseButton) phaseButton.innerHTML = "Démarrer";
    });
};

hud.onLevelSelect = () => {
    if (scene.currentLevel) scene.currentLevel.destroy();
    scene.currentLevel = null;
    const phaseButton = document.getElementById("phaseButton");
    if (phaseButton) phaseButton.style.display = "none";
    hud.showLevelSelect();
};

// On expose le hud globalement pour que Niveau.js puisse le notifier
window.gameHud = hud;

// ====================== CREATE SCENE ======================
function createScene(engine, canvas) {
    var scene = new BABYLON.Scene(engine);

    var camera = new BABYLON.ArcRotateCamera(
        "topCamera",
        BABYLON.Tools.ToRadians(90),
        BABYLON.Tools.ToRadians(45),
        45,
        new BABYLON.Vector3(0, 0, 0),
        scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 20;
    camera.upperRadiusLimit = 80;
    camera.upperBetaLimit = BABYLON.Tools.ToRadians(80);
    camera.lowerBetaLimit = BABYLON.Tools.ToRadians(5);
    scene.activeCamera = camera;

    camera.minZ = 0.1;
    camera.maxZ = 200;
    camera.panningSensibility = 50;

    initGame(scene);

    engine.runRenderLoop(() => {
        scene.render();
    });

    const phaseButton = document.getElementById("phaseButton");
    if (phaseButton) {
        phaseButton.style.display = "none"; // Caché jusqu'à ce qu'un niveau soit chargé
        phaseButton.addEventListener("click", () => {
            if (!scene.currentLevel) return;

            if (scene.currentLevel.isPreparationPhase) {
                scene.currentLevel.demarrer();
                phaseButton.innerHTML = "Recommencer";
            } else {
                scene.currentLevel.reset().then(() => {
                    const botCount = scene.currentLevel?.levelData?.bots?.length ?? 0;
                    hud.showHud(hud.currentLevel, botCount);
                    phaseButton.innerHTML = "Démarrer";
                });
            }
        });
    }

    return scene;
}

// ====================== INIT GAME ======================
async function initGame(scene) {
    engine.displayLoadingUI = function() {};

    console.log("Chargement global de Recast...");
    await Recast();

    createLights(scene);

    scene.registerBeforeRender(() => {
        if (scene.currentLevel) {
            scene.currentLevel.update(engine.getDeltaTime() / 1000);
        }
    });

    hideLoadingView();

    // On affiche l'écran de sélection au démarrage
    await hud.showLevelSelect();
}

// ====================== CHARGEMENT DE NIVEAU ======================
async function chargerNiveau(number, scene) {
    console.log(`Chargement du niveau ${number}...`);

    try {
        const reponse = await fetch(`${cheminNiveau}lvl_${number}.json`);
        if (!reponse.ok) throw new Error(`Erreur HTTP: ${reponse.status}`);
        const levelData = await reponse.json();

        if (scene.currentLevel) {
            scene.currentLevel.destroy();
        }

        scene.currentLevel = new Niveau(scene, levelData);
        await scene.currentLevel.build();

        console.log(`Niveau ${number} chargé !`);
    } catch (erreur) {
        console.error(`Impossible de charger le niveau ${number}:`, erreur);
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
    if (loadingDiv) loadingDiv.style.display = "none";
}