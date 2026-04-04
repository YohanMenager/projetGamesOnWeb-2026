export default class Bloc {
    constructor(scene, startPosition, targetPosition, size = { width: 2, height: 2, depth: 2 }) {
        this.scene = scene;
        this.size = size;
        this.isLocked = false; 
        this.recastObstacle = null;
        
        // NOUVEAU : On garde en mémoire le bot qui pousse le bloc
        this.attachedBot = null; 

        // 1. === LE MESH ===
        this.mesh = BABYLON.MeshBuilder.CreateBox("pushableBloc", this.size, scene);
        this.mesh.position = startPosition.clone();
        this.mesh.position.y = this.size.height / 2;

        this.material = new BABYLON.StandardMaterial("blocMat", scene);
        this.material.diffuseColor = new BABYLON.Color3(0.8, 0.5, 0.2); 
        this.mesh.material = this.material;

        // 2. === LA PHYSIQUE (Havok) ===
        // On lui met une masse temporaire pour qu'il existe, mais on va la supprimer dès qu'il est touché
        this.aggregate = new BABYLON.PhysicsAggregate(
            this.mesh,
            BABYLON.PhysicsShapeType.BOX,
            { mass: 1, friction: 0.5, restitution: 0 },
            scene
        );

        // 3. === CIBLE ===
        this.targetPosition = targetPosition.clone();
        this.targetPosition.y = 0.05;

        this.targetZoneMesh = BABYLON.MeshBuilder.CreatePlane("targetZone", { size: Math.max(this.size.width, this.size.depth) }, scene);
        this.targetZoneMesh.rotation.x = Math.PI / 2;
        this.targetZoneMesh.position = this.targetPosition;
        
        const zoneMat = new BABYLON.StandardMaterial("zoneMat", scene);
        zoneMat.diffuseColor = new BABYLON.Color3(0.2, 0.8, 0.2);
        zoneMat.alpha = 0.3;
        this.targetZoneMesh.material = zoneMat;

        // 4. === NAVIGATION ===
        this.recastObstacle = null;

        // 5. === BOUCLE DE VÉRIFICATION ET D'ACCROCHE ===
        this.observer = scene.onBeforeRenderObservable.add(() => {
            if (this.isLocked) return;
            if (!this.scene.bots) return;
            if (!this.attachedBot) {
                // --- PHASE 1 : CHERCHER UN BOT À PROXIMITÉ ---
                for (let bot of this.scene.bots) {
                    if (!bot.botMesh) continue;
                    
                    // Calcul de la distance
                    let dist = BABYLON.Vector3.Distance(this.mesh.position, bot.botMesh.position);
                    
                    // Si le bot est à moins de 1.5 unités (ajuste selon la taille de tes meshes)
                    if (dist < 1.5) {
                        this.attachToBot(bot);
                        break; // On a trouvé, on arrête de chercher
                    }
                }
            } else {
                // --- PHASE 2 : SUIVRE LE BOT ---
                // On récupère la vélocité du bot via Recast pour savoir dans quelle direction il va
                const velocity = this.attachedBot.crowd.getAgentVelocity(this.attachedBot.agentIndex);
                
                if (velocity && velocity.length() > 0.05) {
                    const dir = velocity.normalize();
                    // On place le bloc mathématiquement 1.5 unités DEVANT le bot
                    this.mesh.position.x = this.attachedBot.botMesh.position.x + dir.x * 1.5;
                    this.mesh.position.z = this.attachedBot.botMesh.position.z + dir.z * 1.5;
                    
                    // On aligne la rotation du bloc avec celle du bot
                    this.mesh.rotation.y = this.attachedBot.botMesh.rotation.y;
                }

                // On vérifie en permanence si on a atteint la cible
                this.checkWinCondition();
            }
        });
    }

    /**
     * Accroche le bloc au robot et désactive la physique
     */
    attachToBot(bot) {
        if (this.attachedBot) {
            console.warn(`Bloc déjà attaché au bot ${this.attachedBot.id}`);
            return;
        }

        this.botObjective = { ...bot.objective }; // On garde en mémoire l'objectif du bot pour le lui redonner après
        console.log('objectif du bot : ', this.botObjective);
        this.attachedBot = bot;
        bot.attachedBloc = this; // Marquer le bot comme attaché à ce bloc
        console.log(`Bloc accroché au bot ${bot.id} !`);

        if (this.aggregate) {
            this.aggregate.dispose();
            this.aggregate = null;
        }

        bot.setTarget(this.targetPosition);
        
    }

checkWinCondition() {
        if (this.isLocked) return;

        const dx = this.mesh.position.x - this.targetZoneMesh.position.x;
        const dz = this.mesh.position.z - this.targetZoneMesh.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        // Si on a atteint la cible
        if (distance < 0.5) {
            
            // 1. On redonne son objectif initial au bot AVANT de le détacher
            if (this.attachedBot) {
                this.attachedBot.setTarget(this.botObjective);
                this.attachedBot.attachedBloc = null; 
            }

            // 2. On verrouille le bloc
            this.lockInPlace();
        }
    }

    lockInPlace() {
        if (this.isLocked) return;
        this.isLocked = true;
        
        // On s'assure de nettoyer la référence locale au bot
        this.attachedBot = null; 

        console.log("Bloc verrouillé !");

        // 1. Positionnement final parfait
        this.mesh.position.x = this.targetZoneMesh.position.x;
        this.mesh.position.z = this.targetZoneMesh.position.z;
        this.mesh.position.y = this.size.height / 2;
        this.mesh.rotation = BABYLON.Vector3.Zero();

        // 2. On recrée une physique statique (masse 0)
        if (this.aggregate) this.aggregate.dispose();
        this.aggregate = new BABYLON.PhysicsAggregate(this.mesh, BABYLON.PhysicsShapeType.BOX, { mass: 0 }, this.scene);

        // 3. Visuel "activé"
        this.material.diffuseColor = new BABYLON.Color3(0.1, 0.9, 0.1);
        this.targetZoneMesh.isVisible = false;

        // 4. Ajout au NavMesh
        this.updateNavMeshObstacle(true);

        if (this.observer) {
            this.scene.onBeforeRenderObservable.remove(this.observer);
            this.observer = null;
        }
    }

    updateNavMeshObstacle(enable) {
        if (!window.navigationPlugin) return;

        if (this.recastObstacle !== null) {
            window.navigationPlugin.removeObstacle(this.recastObstacle);
            this.recastObstacle = null;
        }

        if (enable) {
            const extent = new BABYLON.Vector3(this.size.width / 2, this.size.height / 2, this.size.depth / 2);
            this.recastObstacle = window.navigationPlugin.addBoxObstacle(
                this.mesh.position,
                extent,
                this.mesh.rotation.y
            );
        }
    }
}