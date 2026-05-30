export default class Bot {

    constructor(visualMesh, hitbox, animations, id, speed, scaling, scene, navigationPlugin, crowd, objective) {
        this.visualMesh = visualMesh;
        this.hitbox = hitbox;
        this.animations = animations;
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
        this.state = "MOVING";
        this.targetDoor = null;
        this.targetKey = null;
        this.foundBlock = null;
        this.stuckFrames = 0;
        this.currentAnimation = null;
        this.hitbox.Bot = this;
        this.playAnimation("CombatIdle", true);
    }

    update() {
        if (this.agentIndex < 0 || !this.crowd) return;

        const agentPos = this.crowd.getAgentPosition(this.agentIndex);
        if (agentPos) {
            this.hitbox.position.copyFrom(agentPos);
            this.visualMesh.position.copyFrom(agentPos);
            this.visualMesh.computeWorldMatrix(true);
        }

        const velocity = this.crowd.getAgentVelocity(this.agentIndex);
        if (velocity && velocity.length() > 0) {
            const dir = velocity.normalize();
            const rot = Math.atan2(-dir.x, -dir.z);
            this.hitbox.rotation.y = rot;
            this.visualMesh.rotation.y = rot;
            this.playAnimation("Run", true);
            this.stuckFrames = 0;
        } else {
            this.playAnimation("CombatIdle", true);
        }

        if (this.state === "SEEKING_BLOCK") {
            if (this.attachedBloc) {
                this.state = "PUSHING_BLOCK";
            } else {
                if (this.foundBlock) this.goTo(this.foundBlock.position);
                this.stuckFrames++;
                if (this.stuckFrames > 90) {
                    this.foundBlock = null;
                    this.state = "MOVING";
                    this.stuckFrames = 0;
                    this.setTarget(this.objective);
                }
            }
        } else if (this.state === "PUSHING_BLOCK") {
            if (!this.attachedBloc) {
                this.foundBlock = null;
                this.state = "MOVING";
                this.stuckFrames = 0;
            }
        } else if (this.state === "SEEKING_KEY") {
            if (this.hasKey) {
                this.state = "MOVING";
                this.targetKey = null;
                this.setTarget(this.objective);
                return;
            }
            if (this.targetKey) this.goTo(this.targetKey.mesh.getAbsolutePosition());
        } else if (this.state === "SEEKING_DOOR") {
            if (!this.targetDoor || this.targetDoor.isOpen) {
                this.targetDoor = null;
                this.state = "MOVING";
                this.setTarget(this.objective);
            }
            if (this.targetDoor) {
                const dest = this.targetDoor.basePosition.clone();
                dest.y = 0;
                this.goTo(dest);
            }
        }
        if (this.state === "MOVING") {
            if (this.objective) this.goTo(this.objective);
        }
        if (this.state !== "PUSHING_BLOCK" && this.state !== "SEEKING_KEY" && this.state !== "SEEKING_DOOR") {
            this.performScan();
        }
    }

    performScan() {
        const rayOrigin = this.hitbox.position.clone();
        rayOrigin.y += 0.5;
        const visionAngle = Math.PI / 3;
        const rayCount = 10;
        const maxDistance = 20;

        for (let i = 0; i < rayCount; i++) {
            const angleOffset = (i / (rayCount - 1) - 0.5) * visionAngle;
            const direction = new BABYLON.Vector3(
                -Math.sin(this.hitbox.rotation.y + angleOffset),
                0,
                -Math.cos(this.hitbox.rotation.y + angleOffset)
            );
            const ray = new BABYLON.Ray(rayOrigin, direction, maxDistance);
            const hit = this.scene.pickWithRay(ray, mesh =>
                mesh.isPickable && mesh !== this.hitbox
            );
            //affichage rayon pour debug
            // const rayHelper = new BABYLON.RayHelper(ray);
            // rayHelper.show(this.scene, new BABYLON.Color3(1, 0, 0));

            if (!hit.hit || !hit.pickedMesh) continue;

            // DETECTION CLE
            if (hit.pickedMesh.Cle && !this.hasKey) {
                const cle = hit.pickedMesh.Cle;
                if (cle.isPickedUp) continue;
                this.state = "SEEKING_KEY";
                this.targetKey = cle;
                this.goTo(cle.mesh.getAbsolutePosition());
                return;
            }
            // DETECTION PORTE A CLE
            if (hit.pickedMesh.name.toLowerCase().includes("porte") && this.state !== "SEEKING_DOOR" && this.hasKey) {
                if (!hit.pickedMesh.parentPorte.requiresKey) break;
                console.log("Porte détectée et le bot a une clé");
                const porte = hit.pickedMesh.parentPorte;
                if (porte.requiresKey && !porte.isOpen) {
                    this.targetDoor = porte;
                    this.state = "SEEKING_DOOR";
                    const dest = porte.basePosition.clone();
                    dest.y = 0;
                    this.goTo(dest);
                    return;
                }
            }

            // DETECTION BLOC
            const name = hit.pickedMesh.name?.toLowerCase();
            if (name && name.includes("pushablebloc")) {
                const blocObj = hit.pickedMesh.parentBloc;
                if (!blocObj || blocObj.isLocked || blocObj.attachedBot) continue;
                this.foundBlock = hit.pickedMesh;
                this.state = "SEEKING_BLOCK";
                this.stuckFrames = 0;
                this.goTo(this.foundBlock.position);
                return;
            }
        }
    }

    playAnimation(name, loop = true) {
        if (this.currentAnimation === name) return;
        Object.values(this.animations).forEach(anim => anim.stop());
        if (this.animations[name]) {
            this.animations[name].start(loop);
            this.currentAnimation = name;
        }
    }

    setTarget(targetPosition) {
        if(this.id === 0)
        {
            console.log("Bot 0 setTarget called with: ", targetPosition);
        }
        if (!targetPosition) return;
        this.target = targetPosition.clone();
        if (!this.navigationPlugin || !this.crowd) return;
        if (this.agentIndex < 0) {
            this.agentIndex = this.crowd.addAgent(
                this.hitbox.position,
                { radius: 0.45, height: 1.2, maxAcceleration: 40, maxSpeed: this.speed * 15, collisionQueryRange: 3, pathOptimizationRange: 0, separationWeight: 1.0 },
                this.navigationPlugin
            );
        }
        this.crowd.agentGoto(this.agentIndex, targetPosition);
    }

    goTo(pos) {
        if(this.id === 0)
        {
            console.log("Bot 0 goTo called with: ", pos);
        }
        if(this.agentIndex >= 0)
        {
            if(this.id === 0)
            {
                console.log("Bot 0 agentIndex: ", this.agentIndex);
            }
             this.crowd.agentGoto(this.agentIndex, pos);
        } 
        else {
            
            if(this.id === 0)
            {
                console.log("Bot 0 agentIndex < 0, calling setTarget instead");
            }
            this.setTarget(pos);
        }
    }

    stop() {
        if (this.agentIndex >= 0) {
            this.crowd.removeAgent(this.agentIndex);
            this.agentIndex = -1;
        }
    }

    mourir() {
        if (this.isDying) return; // empêche les appels multiples
        this.isDying = true;
        this.stop();
        this.playAnimation("Death", false);

        // Joue le son de mort du robot
        if (window.soundManager) {
            window.soundManager.play("robot-die");
        }

        setTimeout(() => {
            if (this.scene.currentLevel) this.scene.currentLevel._botDies(this);
        }, 1200);
    }
}