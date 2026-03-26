
// Define car movement speed
var moveForward = 0;
var moveDirection = 0;
var forceMagnitude = 10;
var rotationSpeed = 3;
var angularDamping = 40;
var decelerationFactor = 4;
var tireDecalTimer = 0;

var moveX, moveZ;
var joystickSensitivity = 10;
var pressed = false;
var leftJoystick;
var rightJoystick;


function keyMove(car) {

    setInterval(() => {
        tireDecalTimer++;
    }, 100);

    var inputMap = {};
    scene.actionManager = new BABYLON.ActionManager(scene);
    scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnKeyDownTrigger, function (evt) {
        inputMap[evt.sourceEvent.key] = evt.sourceEvent.type == "keydown";
    }));
    scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnKeyUpTrigger, function (evt) {
        inputMap[evt.sourceEvent.key] = evt.sourceEvent.type == "keydown";
        var frontVector = car.transformNode.getDirection(BABYLON.Axis.Z);

        if (moveForward == 1)
            car.body.setLinearVelocity(frontVector.scale(-decelerationFactor), car.transformNode.getAbsolutePosition());
        if (moveForward == -1)
            car.body.setLinearVelocity(frontVector.scale(decelerationFactor), car.transformNode.getAbsolutePosition());

        var rotationAxis = new BABYLON.Vector3(0, 0, 0);
        if (moveDirection == 0)
        car.body.setAngularVelocity(rotationAxis.scale(0));

        moveForward = 0;
        moveDirection = 0;
        tireDecalTimer = 0;
    }));

    // Update car position based on keyboard input
    scene.onAfterRenderObservable.add(function () {
        
        /*var velocityVector = new BABYLON.Vector3(0,0,0);
        car.body.getLinearVelocityToRef(velocityVector);
 
        if (inputMap["z"] || inputMap["ArrowUp"]) {
            var frontVector = car.transformNode.getDirection(BABYLON.Axis.Z).scale(-forceMagnitude);
            frontVector.y = velocityVector.y;
            car.body.setLinearVelocity(frontVector, car.transformNode.getAbsolutePosition());
            moveForward = 1;
        }
        if (inputMap["s"] || inputMap["ArrowDown"]) {
            var frontVector = car.transformNode.getDirection(BABYLON.Axis.Z).scale(forceMagnitude);
            frontVector.y = velocityVector.y;
            car.body.setLinearVelocity(frontVector, car.transformNode.getAbsolutePosition());
            moveForward = -1;
        }

        if (inputMap["q"] || inputMap["ArrowLeft"]) {
            if (moveForward != 0)
            {
                var rotationAxis = new BABYLON.Vector3(0, -1, 0);
                car.body.setAngularDamping(angularDamping);
                car.body.setAngularVelocity(rotationAxis.scale(rotationSpeed));
                // if (tireDecalTimer > 10)
                // {
                //     tireDecal(car);
                // }
            }
            moveDirection = 1;
        }
        if (inputMap["d"] || inputMap["ArrowRight"]) {
            if (moveForward != 0)
            {
                var rotationAxis = new BABYLON.Vector3(0, 1, 0);
                car.body.setAngularDamping(angularDamping);
                car.body.setAngularVelocity(rotationAxis.scale(rotationSpeed)); 
                // if (tireDecalTimer > 10)
                // {
                //     tireDecal(car);
                // }
            }
            moveDirection = -1;
        }
    */}
    );
}




