export default class Cle {
    constructor(scene, position, color = new BABYLON.Color3(1, 0.8, 0)) {
        this.scene = scene;
        this.isPickedUp = false;
        this.carrierBot = null; // Le bot qui porte la clé

        // 1. === LE VISUEL DE LA CLÉ ===
        // On fait une forme simple (un petit losange/cristal)
        this.mesh = BABYLON.MeshBuilder.CreateCylinder("cle", { 
            diameterTop: 0, 
            diameterBottom: 0.4, 
            height: 0.8, 
            tessellation: 4 
        }, scene);
        
        this.mesh.position = position.clone();
        this.mesh.position.y = 1.0; // Flotte un peu au-dessus du sol

        // Matériau brillant/doré
        this.material = new BABYLON.StandardMaterial("cleMat", scene);
        this.material.diffuseColor = color;
        this.material.emissiveColor = color.scale(0.4); // Brille légèrement dans le noir
        this.mesh.material = this.material;

        // 2. === COMPORTEMENT (Rotation et Ramassage) ===
        this.observer = scene.onBeforeRenderObservable.add(() => {
            if (!this.isPickedUp) {
                // Animation : tourne sur elle-même et flotte de haut en bas
                this.mesh.rotation.y += 0.03;
                this.mesh.position.y = 1.0 + Math.sin(performance.now() / 300) * 0.1;

                // Vérification de la distance avec les bots
                this.checkPickup();
            }
        });
    }

    checkPickup() {
        if (!this.scene.bots) return;

        for (let bot of this.scene.bots) {
            // Si le bot n'a pas de mesh ou possède DÉJÀ une clé, on l'ignore
            if (!bot.botMesh || bot.hasKey) continue;

            // Calcul de la distance entre la clé et le bot
            const distance = BABYLON.Vector3.Distance(this.mesh.position, bot.botMesh.position);

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
        
        // On prévient le bot qu'il a la clé 
        bot.hasKey = true; 
        console.log(`Le bot ${bot.id} a récupéré la clé !`);

        // === L'ASTUCE DU PARENTING ===
        // On attache la clé au robot. Ses coordonnées deviennent relatives au robot 
        this.mesh.setParent(bot.botMesh);

        // Comme le bot a un "scaling" de 0.25, la clé va rétrécir automatiquement.
        // On la positionne au-dessus de sa tête. 
        // Note : En coordonnées locales, Y=5 signifie "5 fois plus haut que la taille du bot"
        this.mesh.position = new BABYLON.Vector3(0, 5, 0); 
        this.mesh.rotation.x = 0;
        this.mesh.rotation.z = 0;
        
        // Optionnel : on peut la faire tourner plus vite au-dessus de sa tête
        this.scene.onBeforeRenderObservable.remove(this.observer); // On supprime l'ancienne animation
        this.scene.onBeforeRenderObservable.add(() => {
            this.mesh.rotation.y += 0.08;
        });
    }
}