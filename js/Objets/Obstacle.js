export default class Obstacle {
constructor(scene, position, size = { width: 2, height: 1.5, depth: 2 }, mass = 8, color = new BABYLON.Color3(0.6, 0.4, 0.2)) {
        this.scene = scene;
        this.mass = mass;
        this.size = size; // On garde la taille en mémoire
        this.isDraggable = true;
        
        // ... (création du mesh et du matériel identiques à ton code) ...
        this.mesh = BABYLON.MeshBuilder.CreateBox("obstacle", size, scene);
        this.mesh.position = position.clone();
        this.mesh.position.y = size.height / 2;
        
        this.material = new BABYLON.StandardMaterial("obstacleMat", scene);
        this.material.diffuseColor = color;
        this.mesh.material = this.material;

        // === PHYSIQUE HAVOK ===
        this.aggregate = new BABYLON.PhysicsAggregate(this.mesh, BABYLON.PhysicsShapeType.BOX, { mass: this.mass, friction: 0.75, restitution: 0 }, scene);
        this.aggregate.body.setLinearDamping(2.5);
        this.aggregate.body.setAngularDamping(3.0);

        const body = this.aggregate.body;



        this.setupDragBehavior();
        
        // Stockage de l'obstacle Recast pour l'IA
        this.recastObstacle = null;

    }

    setupDragBehavior() {
        this.dragBehavior = new BABYLON.PointerDragBehavior({
            dragPlaneNormal: new BABYLON.Vector3(0, 1, 0)
        });

        //On empêche la souris de téléporter le mesh
        this.dragBehavior.moveAttached = false; 

        this.mesh.addBehavior(this.dragBehavior);

        this.dragBehavior.onDragStartObservable.add(() => {
            if (!this.isDraggable) return;
            this.mesh.scaling.setAll(1.08);

            // On retire le "mur IA" pendant qu'on le déplace
            if (this.recastObstacle !== null && window.navigationPlugin) {
                window.navigationPlugin.removeObstacle(this.recastObstacle);
                this.recastObstacle = null;
            }
        });

        this.dragBehavior.onDragObservable.add((event) => {
            if (!this.isDraggable || !this.aggregate) return;

            // On utilise la PHYSIQUE (Velocity) pour attirer l'objet vers la souris
            const targetPosition = event.dragPlanePoint; // Position 3D de la souris
            const currentPosition = this.mesh.position;
            
            // On calcule la direction vers laquelle on veut aller
            const direction = targetPosition.subtract(currentPosition);
            
            // On applique la vitesse. 15 = nervosité du drag
            this.aggregate.body.setLinearVelocity(direction.scale(15));
            
            // On empêche l'objet de tourner sur lui-même s'il frotte contre un mur
            this.aggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
        });

        this.dragBehavior.onDragEndObservable.add(() => {
            this.mesh.scaling.setAll(1.0);
            this.aggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());

            this.ajouterAuNavMesh(); // On remet le "mur IA" à sa place une fois qu'on a fini de le déplacer
        });
    }

    ajouterAuNavMesh() {
        if (window.navigationPlugin) {
                // On s'assure que la taille est correcte (demi-extents)
                // Si la boîte fait 2.5 de large, l'extent doit être 1.25
                let extent = new BABYLON.Vector3(
                    this.size.width / 2, 
                    this.size.height / 2, 
                    this.size.depth / 2
                );

                // On ajoute l'obstacle
                this.recastObstacle = window.navigationPlugin.addBoxObstacle(
                    this.mesh.position, 
                    extent, 
                    this.mesh.rotation.y
                );
                console.log("Obstacle ajouté au NavMesh à :", this.mesh.position);
            }
    }


    setMass(newMass) {
        this.mass = newMass;
        if (this.aggregate) {
            this.aggregate.body.setMassProperties({ mass: newMass });
        }
    }

    dispose() {
        if (this.dragBehavior) this.dragBehavior.detach();
        if (this.aggregate) this.aggregate.dispose();
        if (this.mesh) this.mesh.dispose();
    }
}
