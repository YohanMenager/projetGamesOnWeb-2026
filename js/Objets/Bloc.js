//---------------------------Bloc.js---------------------------
export default class Bloc {
    constructor(scene, startPosition, targetPosition, size = { width: 2, height: 2, depth: 2 }) {
        this.scene = scene;
        this.size = size;
        this.isLocked = false; 
        this.attachedBot = null; 
        this.navigationPlugin = window.navigationPlugin;

        // 1. === LE MESH DU BLOC ===
        this.mesh = BABYLON.MeshBuilder.CreateBox("pushableBloc", this.size, scene);
        this.mesh.parentBloc = this;
        this.mesh.isPickable = true;
        this.mesh.name = `pushableBloc_${Math.random().toString(16).slice(2, 6)}`; // Nom unique pour le raycast   
        this.mesh.position = startPosition.clone();
        this.mesh.position.y = this.size.height / 2;

        this.material = new BABYLON.StandardMaterial("blocMat", scene);
        this.material.diffuseColor = new BABYLON.Color3(0.8, 0.5, 0.2); 
        this.mesh.material = this.material;

        // 2. === LA PHYSIQUE (Havok) ===
        this.aggregate = new BABYLON.PhysicsAggregate(
            this.mesh,
            BABYLON.PhysicsShapeType.BOX,
            { mass: 1, friction: 0.5, restitution: 0 },
            scene
        );

        // 3. === CIBLE ET PONT INVISIBLE ===
        this.targetPosition = targetPosition.clone();
        this.targetPosition.y = 0.05;

        // Création du "Pont Invisible" pour le NavMesh
        this.fakeBridge = BABYLON.MeshBuilder.CreateBox("fakeBridge", {
            width: this.size.width,
            height: 0.1,
            depth: this.size.depth
        }, scene);
        this.fakeBridge.position = this.targetPosition.clone();
        this.fakeBridge.position.y = this.targetPosition.y + this.size.height;  // ← Correction
        this.fakeBridge.isVisible = false; 


        this.fakeBridge.isVisible = false;
        this.fakeBridge.setEnabled(false); 

        // Zone visuelle de la cible
        this.targetZoneMesh = BABYLON.MeshBuilder.CreatePlane("targetZone", { size: Math.max(this.size.width, this.size.depth) }, scene);
        this.targetZoneMesh.rotation.x = Math.PI / 2;
        this.targetZoneMesh.position = this.targetPosition;
        const zoneMat = new BABYLON.StandardMaterial("zoneMat", scene);
        zoneMat.diffuseColor = new BABYLON.Color3(0.2, 0.8, 0.2);
        zoneMat.alpha = 0.3;
        this.targetZoneMesh.material = zoneMat;

        // 4. === NAVIGATION (OBSTACLES) ===
        this.recastObstacle = null; // L'obstacle du bloc lui-même
        this.trouObstacle = null;   // L'obstacle qui bouche le trou


        // 5. === BOUCLE DE VÉRIFICATION ===
        this.observer = scene.onBeforeRenderObservable.add(() => {
            if (this.isLocked) return;
            if (!this.scene.bots) return;
            
            if (!this.attachedBot) {
                for (let bot of this.scene.bots) {
                    let dist = BABYLON.Vector3.Distance(this.mesh.position, bot.botMesh.position);
                    if (dist < 1.5) {
                        this.attachToBot(bot);
                        break;
                    }
                }
            } else {
                const velocity = this.attachedBot.crowd.getAgentVelocity(this.attachedBot.agentIndex);
                if (velocity && velocity.length() > 0.05) {
                    const dir = velocity.normalize();
                    this.mesh.position.x = this.attachedBot.botMesh.position.x + dir.x * 1.5;
                    this.mesh.position.z = this.attachedBot.botMesh.position.z + dir.z * 1.5;
                    this.mesh.rotation.y = this.attachedBot.botMesh.rotation.y;
                }
                this.checkWinCondition();
            }
        });
        setTimeout(() => this.checkWinCondition(), 100);
    }


    attachToBot(bot) {
        if (this.attachedBot) return;
        this.botObjective = bot.objective.clone();
        this.attachedBot = bot;
        bot.attachedBloc = this;

        if (this.aggregate) {
            this.aggregate.dispose();
            this.aggregate = null;
        }
        bot.setTarget(this.targetPosition);
    }

    checkWinCondition() {
        if (this.isLocked) return;
        const distance = BABYLON.Vector3.Distance(this.mesh.position, this.targetZoneMesh.position);

        if (distance < 1) {
            if (this.attachedBot) {
                this.attachedBot.setTarget(this.botObjective);
                this.attachedBot.attachedBloc = null; 
            }
            this.lockInPlace();
        }
    }

    lockInPlace() {
    if (this.isLocked) return;
        this.isLocked = true;
        this.attachedBot = null;

        // 1. Positionnement final
        this.mesh.position.copyFrom(this.targetZoneMesh.position);
        this.mesh.position.y = this.size.height / 2;
        this.mesh.rotation = BABYLON.Vector3.Zero();

        // 2. Physique statique
        if (this.aggregate) this.aggregate.dispose();
        this.aggregate = new BABYLON.PhysicsAggregate(
            this.mesh, BABYLON.PhysicsShapeType.BOX, { mass: 0 }, this.scene
        );

        // 3. On active le fakeBridge et on lui donne une physique
        //    pour qu'il soit détecté par Recast lors du rebake
        this.fakeBridge.setEnabled(true);
        new BABYLON.PhysicsAggregate(
            this.fakeBridge, BABYLON.PhysicsShapeType.BOX, { mass: 0 }, this.scene
        );

        // 4. On ajoute le fakeBridge aux staticMeshes et on rebake
        if (this.scene.currentLevel) {
            this.scene.currentLevel.staticMeshes.push(this.fakeBridge);
            this.scene.currentLevel.rebakeNavMesh(); // ← déjà appelé plus bas, on consolide ici
        }

        // 5. Visuel
        this.material.diffuseColor = new BABYLON.Color3(0.1, 0.9, 0.1);
        this.targetZoneMesh.isVisible = false;

        if (this.observer) {
            this.scene.onBeforeRenderObservable.remove(this.observer);
            this.observer = null;
        }
    }
}