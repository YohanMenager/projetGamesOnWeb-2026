export default class Ennemi {
    // On ajoute 'patrolPoints' qui doit être un tableau de BABYLON.Vector3
    constructor(mesh, id, speed, scaling, scene, navigationPlugin, crowd, patrolPoints = []) {
        this.mesh = mesh;
        this.id = id;
        this.scene = scene;
        this.navigationPlugin = navigationPlugin;
        this.crowd = crowd;
        this.speed = speed || 0.15; // Légèrement plus rapide/lent selon ton équilibrage
        this.scaling = scaling || 1.0;

        this.agentIndex = -1;
        this.target = null;
        
        // --- NOUVELLES VARIABLES ENNEMI ---
        this.state = "PATROLLING"; // PATROLLING, CHASING
        this.targetBot = null;
        this.lostSightFrames = 0; // Compteur quand le bot passe derrière un mur
        
        // Gestion de la ronde
        this.patrolPoints = patrolPoints;
        this.currentPatrolIndex = 0;

        // Lien réciproque pour le raycast (si on tire sur l'ennemi plus tard)
        this.mesh.Ennemi = this; 
        this.mesh.scaling = new BABYLON.Vector3(this.scaling, this.scaling, this.scaling);

        // On lance la première action
        this.allerAuProchainPointRonde();
    }

    update() {
        if (this.agentIndex < 0 || !this.crowd) return;

        // 1. Mise à jour de la position et rotation depuis Recast
        const agentPos = this.crowd.getAgentPosition(this.agentIndex);
        if (agentPos) this.mesh.position.copyFrom(agentPos);

        const velocity = this.crowd.getAgentVelocity(this.agentIndex);
        if (velocity && velocity.length() > 0.05) {
            const dir = velocity.normalize();
            this.mesh.rotation.y = Math.atan2(-dir.x, -dir.z);
        }

        // 2. Gestion des états
        if (this.state === "PATROLLING") {
            // L'ennemi balaie du regard droit devant lui
            this.performScan();

            // S'il a des points de ronde, on vérifie s'il est arrivé à destination
            if (this.patrolPoints.length > 0) {
                const dist = BABYLON.Vector3.Distance(this.mesh.position, this.patrolPoints[this.currentPatrolIndex]);
                if (dist < 1.0) { // S'il est assez proche du point
                    this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolPoints.length;
                    this.allerAuProchainPointRonde();
                }
            }

        } else if (this.state === "CHASING") {
            if (!this.targetBot) return;

            // On actualise la destination vers le bot
            this.goTo(this.targetBot.botMesh.position);

            // On vérifie s'il le voit TOUJOURS (s'il n'est pas caché par un mur)
            if (this.checkLineOfSight()) {
                this.lostSightFrames = 0; // Vue confirmée ! On reset le compteur.

                // Est-ce qu'on est assez près pour frapper ?
                const distToBot = BABYLON.Vector3.Distance(this.mesh.position, this.targetBot.botMesh.position);
                if (distToBot < 1.5) {
                    this.attaquer();
                }
            } else {
                // Le bot est caché (mur, obstacle...)
                this.lostSightFrames++;
                
                // Si on ne le voit plus pendant 120 frames (environ 2 secondes à 60fps)
                if (this.lostSightFrames > 120) {
                    console.log(`Ennemi ${this.id} : J'ai perdu le bot. Reprise de la ronde.`);
                    this.state = "PATROLLING";
                    this.targetBot = null;
                    this.lostSightFrames = 0;
                    this.allerAuProchainPointRonde();
                }
            }
        }
    }

    // Balayage frontal pour *détecter* le bot au départ
    performScan() {
        const rayOrigin = this.mesh.position.clone();
        rayOrigin.y += 0.5; // On lève le tir au niveau des "yeux"
        
        // Rayon droit devant lui
        const forward = new BABYLON.Vector3(
            -Math.sin(this.mesh.rotation.y),
            0,
            -Math.cos(this.mesh.rotation.y)
        );
        const ray = new BABYLON.Ray(rayOrigin, forward, 20); // 20m de vision
        
        // On exclut le propre mesh de l'ennemi pour ne pas qu'il s'aveugle lui-même
        const hit = this.scene.pickWithRay(ray, mesh => mesh.isPickable && mesh !== this.mesh);

        if (hit.hit && hit.pickedMesh) {
            // Est-ce qu'on a touché un mesh qui appartient à un Bot ? (via botMesh.Bot = this dans ta classe Bot)
            if (hit.pickedMesh.Bot) {
                console.log(`Ennemi ${this.id} : Bot repéré à ${hit.distance.toFixed(1)}m ! CHAAAARGE !`);
                this.targetBot = hit.pickedMesh.Bot;
                this.state = "CHASING";
                this.lostSightFrames = 0;
            }
        }
    }

    // Raycast ciblé *vers le bot* pour vérifier qu'un mur ne s'est pas glissé entre eux
    checkLineOfSight() {
        if (!this.targetBot) return false;

        const rayOrigin = this.mesh.position.clone();
        rayOrigin.y += 0.5;
        
        const targetPos = this.targetBot.botMesh.position.clone();
        targetPos.y += 0.5;

        const direction = targetPos.subtract(rayOrigin).normalize();
        const distance = BABYLON.Vector3.Distance(rayOrigin, targetPos);
        
        const ray = new BABYLON.Ray(rayOrigin, direction, distance);
        const hit = this.scene.pickWithRay(ray, mesh => mesh.isPickable && mesh !== this.mesh);

        // Si le premier truc qu'on touche sur la ligne droite est le bot, on le voit.
        return (hit.hit && hit.pickedMesh === this.targetBot.botMesh);
    }

    attaquer() {
        // Ici tu mets la logique pour blesser/détruire le bot
        console.log(`Ennemi ${this.id} a attaqué le Bot ${this.targetBot.id} ! BAM !`);
        
        // Exemple : tu pourrais appeler this.targetBot.mourir(); 
        // ou this.targetBot.takeDamage(10);
    }

    allerAuProchainPointRonde() {
        if (this.patrolPoints.length === 0) {
            // S'il n'a pas de points de ronde, il reste planté là où il a été spawn
            this.goTo(this.mesh.position);
            return;
        }
        this.goTo(this.patrolPoints[this.currentPatrolIndex]);
    }

    // --- NAVIGATION STANDARD (Identique au Bot) ---
    setTarget(targetPosition) {
        if (!targetPosition) return;
        this.target = targetPosition.clone();
        
        if (!this.navigationPlugin || !this.crowd) return;

        if (this.agentIndex < 0) {
            this.agentIndex = this.crowd.addAgent(
                this.mesh.position,
                {
                    radius: 0.45,
                    height: 1.2,
                    maxAcceleration: 40,
                    maxSpeed: this.speed * 15,
                    collisionQueryRange: 3,
                    pathOptimizationRange: 0,
                    separationWeight: 1.0
                },
                this.navigationPlugin
            );
        }
        this.crowd.agentGoto(this.agentIndex, targetPosition);
    }

    stop() {
        if (this.agentIndex >= 0) {
            this.crowd.removeAgent(this.agentIndex);
            this.agentIndex = -1;
        }
    }

    goTo(newPosition) {
        if (this.agentIndex >= 0) {
            this.crowd.agentGoto(this.agentIndex, newPosition);
        } else {
            this.setTarget(newPosition);
        }
    }
}