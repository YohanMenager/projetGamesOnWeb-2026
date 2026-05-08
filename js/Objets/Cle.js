export default class Cle {
    constructor(scene, position, color = new BABYLON.Color3(1, 0.8, 0)) {
        this.scene = scene;
        this.isPickedUp = false;
        this.carrierBot = null; // Le bot qui porte la clé

        // 1. === LE VISUEL DE LA CLÉ ===
        // On fait une forme simple (un petit losange/cristal)
        this.mesh = BABYLON.MeshBuilder.CreateBox("cle", { 
            width: 0.8, height: 1.5, depth: 0.8
        }, scene);
        this.mesh.isPickable = true;
        this.mesh.isVisible = false; // Le hitbox est invisible

        // Visuel séparé, enfant du hitbox
        this.visual = BABYLON.MeshBuilder.CreateCylinder("cle_visual", { 
            diameterTop: 0, 
            diameterBottom: 1, 
            height: 2, 
            tessellation: 4 
        }, scene);
        this.visual.setParent(this.mesh);
        this.visual.position = BABYLON.Vector3.Zero();
        this.visual.material = this.material;
        this.visual.Cle = this; // Référence pour interactions

        this.mesh.position = position.clone();
        this.mesh.position.y = 0.5; // Flotte un peu au-dessus du sol
        // Dans le constructeur, après la création du mesh
        this.mesh.alwaysSelectAsActiveMesh = true; 
        this.mesh.isPickable = true;

        // Matériau brillant/doré
        this.material = new BABYLON.StandardMaterial("cleMat", scene);
        this.material.diffuseColor = color;
        this.material.emissiveColor = color.scale(0.4); // Brille légèrement dans le noir
        this.visual.material = this.material;

        this.mesh.Cle = this;

        // 2. === COMPORTEMENT (Rotation et Ramassage) ===
        this.observer = scene.onBeforeRenderObservable.add(() => {
            if (!this.isPickedUp) {
                // Animation : tourne sur elle-même et flotte de haut en bas
                this.mesh.rotation.y += 0.03;
                this.mesh.position.y = 1.0 + Math.sin(performance.now() / 300) * 0.1;
                this.mesh.refreshBoundingInfo(); // Resynchronise le bounding box après l'animation
                this.checkPickup();
            }
        });
    }

    checkPickup() {
        if (!this.scene.bots) return;

        for (let bot of this.scene.bots) {
            // Si le bot n'a pas de mesh ou possède DÉJÀ une clé, on l'ignore
            if (!bot.hitbox || bot.hasKey) continue;

            // Calcul de la distance entre la clé et le bot
            const distance = BABYLON.Vector3.Distance(this.mesh.position, bot.hitbox.position);

            // Si le bot est assez proche (rayon de ramassage)
            if (distance < 1.5) {
                this.pickup(bot);
                break; // On arrête la boucle, la clé est prise 
            }
        }
    }

    pickup(bot) {
        this.isPickedUp = true;
        this.carrierBot = bot;
        bot.hasKey = true;

        // On attache le hitbox (et donc le visuel) au bot
        this.mesh.setParent(bot.hitbox);
        this.mesh.position = new BABYLON.Vector3(0, 5, 0);
        this.mesh.rotation = BABYLON.Vector3.Zero();
        this.mesh.isPickable = false;
        
        this.scene.onBeforeRenderObservable.remove(this.observer);
        this.scene.onBeforeRenderObservable.add(() => {
            this.mesh.rotation.y += 0.08;
        });
    }
}