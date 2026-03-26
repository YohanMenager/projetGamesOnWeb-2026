export default class Bot {
  constructor(botMesh, id, speed, scaling, scene) {
    this.botMesh = botMesh;
    this.id = id;
    this.scene = scene;
    this.scaling = scaling;
    this.health = 3; // three shots to kill the bot !
    this.frontVector = new BABYLON.Vector3(0, 0, -1); // at start bot is facing camera looking to -Z

    if (speed) this.speed = speed;
    else this.speed = 0.1;

    // in case, attach the instance to the mesh itself, in case we need to retrieve
    // it after a scene.getMeshByName that would return the Mesh
    // SEE IN RENDER LOOP !
    botMesh.Bot = this;

    // scaling
    this.botMesh.scaling = new BABYLON.Vector3(0.2, 0.2, 0.2);

    // FOR COLLISIONS, let's associate a BoundingBox to the Bot

    // singleton, static property, computed only for the first bot we constructed
    // for others, we will reuse this property.
    if (Bot.boundingBoxParameters == undefined) {
      Bot.boundingBoxParameters = this.calculateBoundingBoxParameters();
    }

    this.bounder = this.createBoundingBox();
    this.bounder.botMesh = this.botMesh;

    // Particle system for the Bot, to show when he is hit by cannonball or laser

  }

  followTank(scene) {
    // as move can be called even before the bbox is ready.
    if (!this.bounder) return;

    // let's put the bot at the BBox position. in the rest of this
    // method, we will not move the dude but the BBox instead
    this.botMesh.position = new BABYLON.Vector3(
      this.bounder.position.x,
      this.bounder.position.y,
      this.bounder.position.z
    );

    // adjust y position dependingOn Ground height
    this.followGround();

    // follow the tank
    let tank = scene.getMeshByName("heroTank");
    // let's compute the direction vector that goes from Dude to the tank
    let direction = tank.position.subtract(this.botMesh.position);
    let distance = direction.length(); // we take the vector that is not normalized, not the dir vector
    //console.log(distance);

    let dir = direction.normalize();
    // angle between Dude and tank, to set the new rotation.y of the Dude so that he will look towards the tank
    // make a drawing in the X/Z plan to uderstand....
    let alpha = Math.atan2(-dir.x, -dir.z);
    // If I uncomment this, there are collisions. This is strange ?
    //this.bounder.rotation.y = alpha;

    this.botMesh.rotation.y = alpha;

    // let make the Dude move towards the tank
    // first let's move the bounding box mesh
    if (distance > 2) { // S'ils sont à plus de 2m, ils avancent
    this.bounder.moveWithCollisions(
        dir.multiplyByFloats(this.speed, this.speed, this.speed)
    );
} else {
      //a.pause();
    }
  }


followGround() {
    // 1. Définir l'origine du rayon (un peu au-dessus du bot)
    // On utilise this.botMesh.position pour savoir où est le bot
    let origin = new BABYLON.Vector3(this.botMesh.position.x, 10, this.botMesh.position.z);
    
    // 2. Définir la direction (vers le bas)
    let direction = new BABYLON.Vector3(0, -1, 0);
    
    // 3. Créer le rayon (C'est ici qu'on déclare "let ray")
    let ray = new BABYLON.Ray(origin, direction, 20);

    // 4. On cherche l'intersection avec le sol nommé "ground"
    let pickInfo = this.scene.pickWithRay(ray, (mesh) => { 
        return mesh.name === "ground"; 
    });

    if (pickInfo.hit && pickInfo.pickedPoint) {
        let groundHeight = pickInfo.pickedPoint.y;
        
        // On aligne le mesh du bot sur le sol
        this.botMesh.position.y = groundHeight;

        // On aligne aussi la "bounding box" invisible (le bounder) pour les collisions
        if (this.bounder) {
            let bbInfo = Bot.boundingBoxParameters;
            let max = bbInfo.maximum; // Note: selon ta version, c'est bbInfo.maximum, pas .boundingBox.maximum
            let min = bbInfo.minimum;
            
            this.bounder.position.y = groundHeight + (max.y - min.y) * this.scaling / 2;
        }
        return groundHeight;
    }
    
    return this.botMesh.position.y;
}



calculateBoundingBoxParameters() {
    // Si c'est une instance ou un mesh simple sans enfants
    if (!this.botMesh.getChildren || this.botMesh.getChildren().length === 0) {
        return this.botMesh.getBoundingInfo();
    }
    // Sinon, calcul complexe pour les modèles importés (comme le Dude)
    return this.totalBoundingInfo(this.botMesh.getChildren());
}

  // Taken from BabylonJS Playground example : https://www.babylonjs-playground.com/#QVIDL9#1
  totalBoundingInfo(meshes) {
    var boundingInfo = meshes[0].getBoundingInfo();
    var min = boundingInfo.minimum.add(meshes[0].position);
    var max = boundingInfo.maximum.add(meshes[0].position);
    for (var i = 1; i < meshes.length; i++) {
      boundingInfo = meshes[i].getBoundingInfo();
      min = BABYLON.Vector3.Minimize(
        min,
        boundingInfo.minimum.add(meshes[i].position)
      );
      max = BABYLON.Vector3.Maximize(
        max,
        boundingInfo.maximum.add(meshes[i].position)
      );
    }
    return new BABYLON.BoundingInfo(min, max);
  }

  createBoundingBox() {
    // Create a box as BoundingBox of the Dude
    let bounder = new BABYLON.Mesh.CreateBox(
      "bounder" + this.id.toString(),
      1,
      this.scene
    );
    let bounderMaterial = new BABYLON.StandardMaterial(
      "bounderMaterial",
      this.scene
    );
    bounderMaterial.alpha = 0.4;
    bounder.material = bounderMaterial;
    bounder.checkCollisions = true;

    bounder.position = this.botMesh.position.clone();

    let bbInfo = Bot.boundingBoxParameters;

    let max = bbInfo.boundingBox.maximum;
    let min = bbInfo.boundingBox.minimum;

    // Not perfect, but kinda of works...
    // Looks like collisions are computed on a box that has half the size... ?
    bounder.scaling.x = (max._x - min._x) * this.scaling;
    bounder.scaling.y = (max._y - min._y) * this.scaling;
    bounder.scaling.z = (max._z - min._z) * this.scaling * 3;
    //bounder.isVisible = false;

    bounder.position.y += (max._y - min._y) * this.scaling/2;

    return bounder;
  }


}
