export default class Bot {
    constructor(botMesh, id, speed, scaling, scene, navigationPlugin, crowd, objective) {
        this.botMesh = botMesh;
        this.id = id;
        this.scene = scene;
        this.navigationPlugin = navigationPlugin;
        this.crowd = crowd;
        this.speed = speed || 0.12;
        this.scaling = scaling || 1.0;

        this.agentIndex = -1;        // ← On stocke l'INDEX (nombre) maintenant
        this.target = null;
        this.objective = objective;

        this.hasKey = false;

        botMesh.Bot = this;

        this.botMesh.scaling = new BABYLON.Vector3(this.scaling, this.scaling, this.scaling);

        // 1. === PHYSIQUE DU ROBOT ===
        if (!botMesh.aggregate) {
            botMesh.aggregate = new BABYLON.PhysicsAggregate(
                botMesh,
                BABYLON.PhysicsShapeType.BOX,
                { mass: 0, restitution: 0.0, friction: 0.8 }, // mass: 0 en fait un objet cinématique
                scene
            );
            
            // CRUCIAL : Indique à Havok que la position du mesh va être modifiée manuellement (par le Crowd) 
            // et qu'il doit s'en servir pour repousser les objets dynamiques (comme le bloc).
            botMesh.aggregate.body.disablePreStep = false;
        }
    }

    // Appelée chaque frame dans registerBeforeRender
    update(scene) {
        if (this.agentIndex < 0 || !this.crowd) return;

        

        // Récupérer la position via l'index
        const agentPos = this.crowd.getAgentPosition(this.agentIndex);

        if (agentPos) {
            this.botMesh.position.x = agentPos.x;
            this.botMesh.position.z = agentPos.z;
            this.botMesh.position.y = 0.8;   // ou appelle followGround() si tu veux
        }

        // Récupérer la vélocité pour orienter le robot
        const velocity = this.crowd.getAgentVelocity(this.agentIndex);
        if (velocity && velocity.length() > 0.1) {
            const dir = velocity.normalize();
            const alpha = Math.atan2(-dir.x, -dir.z);
            this.botMesh.rotation.y = alpha;
        }
    }

    // Définit une cible (sortie, clé, etc.)
    setTarget(targetPosition) {
        if (!targetPosition) {
            console.error(`Bot ${this.id}: targetPosition is undefined.`);
            return;
        }

        // Si on a déjà cette cible exacte, on ne recalcule rien (optimisation !)
        if (this.target && (this.target.x === targetPosition.x) && (this.target.z === targetPosition.z)) {
            return;
        }
        this.target = targetPosition;

        if (!this.navigationPlugin || !this.crowd) {
            console.warn("Recast non initialisé pour ce bot");
            return;
        }

        if (this.agentIndex < 0) {
            this.agentIndex = this.crowd.addAgent(
                this.botMesh.position,
                {
                    radius: 0.45,
                    height: 1.2,
                    maxAcceleration: 40,
                    maxSpeed: this.speed * 15,
                    collisionQueryRange: 3,
                    pathOptimizationRange: 0,
                    separationWeight: 2.5
                },
                this.navigationPlugin
            );

            console.log(`Bot ${this.id} → agentIndex = ${this.agentIndex}`);
        }

        this.crowd.agentGoto(this.agentIndex, targetPosition);
    }

    stop() {
        if (this.agentIndex >= 0) {
            this.crowd.removeAgent(this.agentIndex);
            this.agentIndex = -1;
            console.log(`Bot ${this.id} → agent stoppé`);
          }  
    }

    // Pour changer de cible plus tard
    goTo(newPosition) {
        if (this.agentIndex >= 0) {
            this.crowd.agentGoto(this.agentIndex, newPosition);
        } else {
            this.setTarget(newPosition);
        }
    }
}
