// Fonction utilitaire pour snap sur grille
function snap(value, gridSize = 1) {
    return Math.round(value / gridSize) * gridSize;
}

export default class Obstacle {
    constructor(scene, position, size = { width: 2, height: 1.5, depth: 2 }, mass = 8, color = new BABYLON.Color3(0.6, 0.4, 0.2)) {
        this.scene = scene;
        this.size = size; // On garde la taille en mémoire
        this.isDraggable = true;
        this.gridSize = 0.5; // Taille de la grille pour le snap
        
        // === CRÉATION DU MESH ===
        this.mesh = BABYLON.MeshBuilder.CreateBox("obstacle", size, scene);
        this.mesh.position = position.clone();
        this.mesh.position.y = size.height / 2 + 0.01;
        this.lastValidPosition = this.mesh.position.clone();
        
        //obstacles transparents saufs les côtés pour mieux voir le bot
        this.material = new BABYLON.StandardMaterial("obstacleMat", scene);
        this.material.alpha = 0.8;
        this.material.backFaceCulling = false; // Affiche les deux côtés


        this.material.diffuseColor = color;
        this.mesh.material = this.material;

        // === SETUP DRAG BEHAVIOR (sans physique) ===
        this.setupDragBehavior();
    }

    setupDragBehavior() {
        this.dragBehavior = new BABYLON.PointerDragBehavior({
            dragPlaneNormal: new BABYLON.Vector3(0, 1, 0)
        });

        // On empêche la souris de téléporter le mesh
        this.dragBehavior.moveAttached = false; 

        this.mesh.addBehavior(this.dragBehavior);

        this.dragBehavior.onDragStartObservable.add(() => {
            if (!this.isDraggable) return;
            this.mesh.scaling.setAll(1.08);
        });

        // Déplacement MANUEL et CONTRÔLÉ (sans physique)
        this.dragBehavior.onDragObservable.add((event) => {
            if (!this.isDraggable) return;

            const target = event.dragPlanePoint;

            let newX = snap(target.x);
            let newZ = snap(target.z);

            const currentY = this.mesh.position.y;

            //  Test déplacement X uniquement
            let testPosX = new BABYLON.Vector3(newX, currentY, this.mesh.position.z);

            if (!this.isColliding(testPosX, this.scene.currentLevel.collisionMeshes)) {
                this.mesh.position.x = newX;
            }

            //  Test déplacement Z uniquement
            let testPosZ = new BABYLON.Vector3(this.mesh.position.x, currentY, newZ);

            if (!this.isColliding(testPosZ, this.scene.currentLevel.collisionMeshes)) {
                this.mesh.position.z = newZ;
            }

            // Sauvegarde position valide
            this.lastValidPosition = this.mesh.position.clone();
        });

        this.dragBehavior.onDragEndObservable.add(() => {
            this.mesh.scaling.setAll(1.0);

            // Rebake le NavMesh après le déplacement
            if (this.scene.currentLevel && this.scene.currentLevel.rebakeNavMesh) {
                this.scene.currentLevel.rebakeNavMesh();
            }
        });
    }

    dispose() {
        if (this.dragBehavior) this.dragBehavior.detach();
        if (this.mesh) this.mesh.dispose();
    }

    isColliding(newPosition, obstacles) {
        const epsilon = 0.01;
        const halfWidth = this.size.width / 2;
        const halfDepth = this.size.depth / 2;

        const minA = new BABYLON.Vector3(
            newPosition.x - halfWidth,
            0,
            newPosition.z - halfDepth
        );

        const maxA = new BABYLON.Vector3(
            newPosition.x + halfWidth,
            this.size.height,
            newPosition.z + halfDepth
        );
        this.mesh.computeWorldMatrix(true);
        for (let mesh of obstacles) {
            if (!mesh) continue;
            if (mesh === this.mesh) continue;
            mesh.computeWorldMatrix(true);
            const box = mesh.getBoundingInfo().boundingBox;

            if (
                minA.x <= box.maximumWorld.x - epsilon &&
                maxA.x >= box.minimumWorld.x + epsilon &&
                minA.z <= box.maximumWorld.z - epsilon &&
                maxA.z >= box.minimumWorld.z + epsilon &&
                minA.y <= box.maximumWorld.y - epsilon &&
                maxA.y >= box.minimumWorld.y + epsilon
            ) {
                return true;
            }
        }

        return false;
    }
}
