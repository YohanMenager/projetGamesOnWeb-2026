export default class Bot {
    constructor(botMesh, id, speed, scaling, scene, navigationPlugin, crowd, objective) {
        this.botMesh = botMesh;
        this.id = id;
        this.scene = scene;
        this.navigationPlugin = navigationPlugin;
        this.crowd = crowd;
        this.speed = speed || 0.12;
        this.scaling = scaling || 1.0;

        this.agentIndex = -1;
        this.target = null;
        this.objective = objective;
        this.hasKey = false;
        this.attachedBloc = null;

        this.state = "MOVING"; // MOVING, SEEKING_BLOCK, PUSHING_BLOCK
        this.foundBlock = null;
        this.stuckFrames = 0;

        botMesh.Bot = this;
        this.botMesh.scaling = new BABYLON.Vector3(this.scaling, this.scaling, this.scaling);
    }

    update(scene) {
        if (this.agentIndex < 0 || !this.crowd) return;

        // Position et rotation depuis Recast
        const agentPos = this.crowd.getAgentPosition(this.agentIndex);
        if (agentPos) this.botMesh.position.copyFrom(agentPos);

        const velocity = this.crowd.getAgentVelocity(this.agentIndex);
        if (velocity && velocity.length() > 0.05) {
            const dir = velocity.normalize();
            this.botMesh.rotation.y = Math.atan2(-dir.x, -dir.z);
            this.stuckFrames = 0;
        }

        if (this.state !== "PUSHING_BLOCK") {
            this.performScan();
        }

        // Gestion des états
        if (this.state === "SEEKING_BLOCK") {
            if (this.attachedBloc) {
                console.log(`Bot ${this.id} : bloc attaché, poussée en cours.`);
                this.state = "PUSHING_BLOCK";
            } else {
                // Mettre à jour la cible en continu car le bloc peut bouger
                if (this.foundBlock) {
                    this.goTo(this.foundBlock.position);
                }

                this.stuckFrames++;
                if (this.stuckFrames > 90) {
                    // Bloc inaccessible ou déjà pris, on abandonne
                    console.log(`Bot ${this.id} : bloc inaccessible, reprise de l'objectif.`);
                    this.foundBlock = null;
                    this.state = "MOVING";
                    this.stuckFrames = 0;
                    this.setTarget(this.objective);
                }
            }

        } else if (this.state === "PUSHING_BLOCK") {
            if (!this.attachedBloc) {
                // Bloc.js a fini (lockInPlace), on reprend
                console.log(`Bot ${this.id} : bloc posé, reprise de l'objectif.`);
                this.foundBlock = null;
                this.state = "MOVING";
                this.stuckFrames = 0;
            }
        }
    }

    performScan() {
        // Raycast droit devant, chaque frame
        const rayOrigin = this.botMesh.position.clone();
        rayOrigin.y += 0.5;
        const forward = new BABYLON.Vector3(
            -Math.sin(this.botMesh.rotation.y),
            0,
            -Math.cos(this.botMesh.rotation.y)
        );
        const ray = new BABYLON.Ray(rayOrigin, forward, 15);
        const hit = this.scene.pickWithRay(ray, mesh => mesh.isPickable);

        if (!hit.hit || !hit.pickedMesh || this.id !=2 ) return;
        console.log(`Bot ${this.id} : scan effectué, hit : ${hit.pickedMesh.name}`);
        if (!hit.pickedMesh.name) return;
        const name = hit.pickedMesh.name.toLowerCase();
        if (!name.includes("pushablebloc")) return;

        const blocObj = hit.pickedMesh.parentBloc;
        if (!blocObj || blocObj.isLocked || blocObj.attachedBot) return;

        
        console.log(`Bot ${this.id} : bloc repéré à ${hit.distance.toFixed(1)}m !`);
        this.foundBlock = hit.pickedMesh;
        this.state = "SEEKING_BLOCK";
        this.stuckFrames = 0;
        this.goTo(this.foundBlock.position);
    }

    setTarget(targetPosition) {
        if (!targetPosition) return;

        this.target = targetPosition.clone();
        if (!this.navigationPlugin || !this.crowd) return;

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