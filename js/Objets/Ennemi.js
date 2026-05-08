export default class Ennemi {

    constructor(visualMesh, hitbox, animations, id, speed, scaling, scene, navigationPlugin, crowd, patrolPoints = []) {
        this.visualMesh = visualMesh;
        this.hitbox = hitbox;
        this.animations = animations;
        this.id = id;
        this.scene = scene;
        this.navigationPlugin = navigationPlugin;
        this.crowd = crowd;
        this.speed = speed || 0.15;
        this.agentIndex = -1;
        this.target = null;
        this.state = "PATROLLING";
        this.targetBot = null;
        this.lostSightFrames = 0;
        this.lastTargetPos = null;
        this.patrolPoints = patrolPoints;
        this.currentPatrolIndex = 0;
        this.currentAnimation = null;
        this.hitbox.Ennemi = this;
        
        // Pas d'appel à allerAuProchainPointRonde() ici — appelé dans demarrer()
    }

    demarrer() {
        this.allerAuProchainPointRonde();
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
        if (velocity && velocity.length() > 0.05) {
            const dir = velocity.normalize();
            const rot = Math.atan2(-dir.x, -dir.z);
            this.hitbox.rotation.y = rot;
            this.visualMesh.rotation.y = rot;
        }

        if (this.state === "PATROLLING") {
            this.performScan();
            if (this.patrolPoints.length > 0) {
                const dist = BABYLON.Vector3.Distance(
                    this.hitbox.position,
                    this.patrolPoints[this.currentPatrolIndex]
                );
                if (dist < 1.0) {
                    this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolPoints.length;
                    this.allerAuProchainPointRonde();
                }
            }
        } else if (this.state === "CHASING") {
            if (!this.targetBot || !this.targetBot.hitbox) {
                this.resetToPatrol();
                return;
            }
            const targetPos = this.targetBot.hitbox.position.clone();
            if (!this.lastTargetPos ||
                BABYLON.Vector3.Distance(this.lastTargetPos, targetPos) > 1.0) {
                this.lastTargetPos = targetPos.clone();
                this.goTo(this.lastTargetPos);
            }
            if (this.hasLineOfSight(this.targetBot)) {
                this.lostSightFrames = 0;
                const dist = BABYLON.Vector3.Distance(this.hitbox.position, targetPos);
                if (dist < 1.5) this.attaquer();
            } else {
                this.lostSightFrames++;
                if (this.lostSightFrames > 120) this.resetToPatrol();
            }
        }
    }

    performScan() {
        const visionAngle = Math.PI * 0.75;
        const maxDistance = 20;
        let bestBot = null;
        let bestDist = Infinity;

        for (let bot of this.scene.bots) {
            if (!bot.hitbox || bot.isDying) continue;
            if (!bot.hitbox) continue;
            const toBot = bot.hitbox.position.subtract(this.hitbox.position);
            const distance = toBot.length();
            if (distance > maxDistance) continue;
            const forward = new BABYLON.Vector3(
                -Math.sin(this.hitbox.rotation.y), 0,
                -Math.cos(this.hitbox.rotation.y)
            );
            const dot = BABYLON.Vector3.Dot(forward, toBot.normalize());
            if (Math.acos(Math.max(-1, Math.min(1, dot))) > visionAngle / 2) continue;
            if (!this.hasLineOfSight(bot)) continue;
            if (distance < bestDist) { bestDist = distance; bestBot = bot; }
        }

        if (bestBot) {
            this.targetBot = bestBot;
            this.state = "CHASING";
            this.lostSightFrames = 0;
            this.lastTargetPos = null;
        }
    }

    hasLineOfSight(bot) {
         if (bot.isDying) return false;
        const origin = this.hitbox.position.clone();
        origin.y += 0.5;
        const target = bot.hitbox.position.clone();
        target.y += 0.5;
        const direction = target.subtract(origin);
        const distance = direction.length();
        direction.normalize();
        const ray = new BABYLON.Ray(origin, direction, distance);
        const hit = this.scene.pickWithRay(ray, mesh =>
            mesh.isPickable && mesh !== this.hitbox
        );
        return hit.hit && hit.pickedMesh === bot.hitbox;
    }

    attaquer() {
        if (!this.targetBot) return;
        // Joue l'unique animation pendant l'attaque
        const animName = Object.keys(this.animations)[0];
        if (animName) this.playAnimation(animName, false);
        this.targetBot.mourir();
        this.targetBot = null;
        this.state = "PATROLLING";
    }

    playAnimation(name, loop = true) {
        if (this.currentAnimation === name) return;
        Object.values(this.animations).forEach(anim => anim.stop());
        if (this.animations[name]) {
            this.animations[name].start(loop);
            this.currentAnimation = name;
        }
    }

    allerAuProchainPointRonde() {
        if (this.patrolPoints.length === 0) {
            this.goTo(this.hitbox.position);
            return;
        }
        this.goTo(this.patrolPoints[this.currentPatrolIndex]);
    }

    setTarget(targetPosition) {
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
        if (this.agentIndex >= 0) this.crowd.agentGoto(this.agentIndex, pos);
        else this.setTarget(pos);
    }

    stop() {
        if (this.agentIndex >= 0) {
            this.crowd.removeAgent(this.agentIndex);
            this.agentIndex = -1;
        }
    }

    resetToPatrol() {
        this.state = "PATROLLING";
        this.targetBot = null;
        this.lastTargetPos = null;
        this.lostSightFrames = 0;
        this.allerAuProchainPointRonde();
    }
}