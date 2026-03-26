export default class Bot {
    constructor(botMesh, id, speed, scaling, scene, navigationPlugin, crowd) {
        this.botMesh = botMesh;
        this.id = id;
        this.scene = scene;
        this.navigationPlugin = navigationPlugin;
        this.crowd = crowd;
        this.speed = speed || 0.12;
        this.scaling = scaling || 0.25;

        this.agentIndex = -1;        // ← On stocke l'INDEX (nombre) maintenant
        this.target = null;

        botMesh.Bot = this;

        this.botMesh.scaling = new BABYLON.Vector3(this.scaling, this.scaling, this.scaling);

        // Physique légère (optionnelle avec Recast)
        if (!botMesh.aggregate) {
            botMesh.aggregate = new BABYLON.PhysicsAggregate(
                botMesh,
                BABYLON.PhysicsShapeType.BOX,
                { mass: 1, restitution: 0.0, friction: 0.8 },
                scene
            );
            botMesh.aggregate.body.setLinearDamping(1.8);
            botMesh.aggregate.body.setAngularDamping(2.0);
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
        this.target = targetPosition;

        if (!this.navigationPlugin || !this.crowd) {
            console.warn("Recast non initialisé pour ce bot");
            return;
        }

        // Créer l'agent une seule fois
        if (this.agentIndex < 0) {
            this.agentIndex = this.crowd.addAgent(
                this.botMesh.position,
                {
                    radius: 0.45,
                    height: 1.2,
                    maxAcceleration: 10,
                    maxSpeed: this.speed * 15,
                    collisionQueryRange: 3,
                    pathOptimizationRange: 15,
                    separationWeight: 2.5
                },
                this.navigationPlugin
            );

            console.log(`Bot ${this.id} → agentIndex = ${this.agentIndex}`);
        }

        // Envoyer vers la cible
        this.crowd.agentGoto(this.agentIndex, targetPosition);
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